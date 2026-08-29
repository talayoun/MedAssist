# Where the demo work stands

Last updated 2026-08-23. This file lives in the repo on purpose: `.tmp/` is gitignored, so scratch
notes do not travel between machines. Read this first on a new machine.

Branch: `feat/demo-day-phase1`, cut from `backlog-fixes`.

---

## What the demo is

Booth, ~2026-09-04. A visitor walks up, hears the background, then watches the flow live: a new patient
opened in the back office → a Telegram magic link → opened on the presenter's phone → the visit
unfolding on one route with the real Wolfson photos. Plus a bit of the ER track and the admin config
screens. The pitch: on this route it already works; the rest of the hospital is duplication.

Hosting: **laptop + own hotspot**, committed. AWS only if the flow is solid with days to spare.

The plan of record is published at
https://claude.ai/code/artifact/f627ef26-ae0d-48a3-9509-436da00bc1ac
(source: `docs/backlog/demo-day-readiness.html`).

**The audit backlog is parked.** M2, the offline service worker, is dropped, along with the E-series
edge cases, until the flow itself is presentable. Nothing in that queue is visible in a walkthrough.

## Phase 0 — done, merged

- `pnpm --filter api db:reset-demo` truncates all 20 data tables, clears the BullMQ queue, reseeds.
  Guarded against a non-`*_dev` database and against a non-local Redis. The dev database went from 585
  patients / 54 routes / a junk department to 1 patient, 2 departments, 2 routes.
- The seven Wolfson photos are committed at `apps/api/src/db/demo-assets/` and uploaded at seed time
  through the same compression path a staff upload uses.
- **The demo is ophthalmology.** The photos end at `מחלקת עיניים`, so the department, procedure
  (`cataract-surgery`), checklist and forms all match them. `קרדיולוגיה` stays seeded — twelve test
  files look it up by name.

## Phase 1 — done for steps 1-9, merged

See `docs/demo/WALKTHROUGH-FINDINGS.md` for the ranked list. Summary: **the flow works end to end**,
including a real Telegram delivery and all seven navigation photos. One blocker (the free-text
procedure field), several visible rough edges.

Not yet walked: the ER track and the admin configuration screens.

Fixed while walking, because they were caused by Phase 0 rather than found by it: the seed protected
every default route (which locked the demo route against the admin screens and broke a test's expected
error), and two specs matched text loosely — `עיניים` is a substring of the eye form labels on the same
page. Also tightened the queue card's RTL spacing at the user's request.

All suites green after: 83 API, 18 patient (1 pre-existing skip), 15 back office, typecheck clean.

## Phase 2 — not started

Fix the walkthrough list top down, blocker first. Each item its own branch, `--no-ff` merge back.

Still open from that list, most visible first: the free-text `סוג פרוצדורה` field whose own
suggestions do not match the seed (blocker), the unfiltered forms picker, forms that attach only when
staff ticks them, long form labels crushing the row layout, a required consent the patient cannot act
on, and the department arrival details that never surface.

## Dry-run review fixes — done 2026-08-30

Separate from the walkthrough list: feedback from the project dry run, merged into `backlog-fixes`
as four branches. Plan at `~/.claude/plans/sparkling-bubbling-puppy.md`.

- **Forms pre-fill.** `שם מלא` opens filled from the visit and stays editable. Matching is by label,
  since template items carry no field key; the value is persisted so the submit gate and the staff
  PDF agree with what the patient sees. The database holds nothing else usable (name and phone only,
  no national ID or email), so the name is the whole list today.
- **Navigation.** `אני כאן` and `השלב הקודם` are both always on screen, the peek state and its
  "return to current step" gate are gone, and confirming an already-confirmed step only moves the
  view. The dots follow the viewed step. A back arrow leaves internal navigation for the
  route-to-the-hospital screen and clears the arrival state. `GET /visit/:token/navigation` now
  returns the steps already reached plus the next one, so walking back survives a reload; contract
  note updated.
- **Scroll.** Every screen change starts at the top: a route-level reset plus the navigation page's
  own sub-screen and step state.
- **Em dashes.** None left in either app, comments included.

Five new patient specs (`navigation-back-forward`, `scroll-reset`), each verified red before the fix.
Suites after: 83 API, 23 patient (1 pre-existing skip), 15 back office, typecheck clean.

One API test, `admin-navigation-routes` "returns 409 when route is the default for an active
appointment dept", fails on a residue-heavy database: it takes whichever default route comes first,
and with 14 routes around that was the protected demo route, so the 409 says `item_protected`. Green
on a reset database. Another reason the order stays: run the tests, then reset, then demo.

## Phase 3 — not started, highest remaining risk

The network dress rehearsal on the real phone. Do it early, not the night before.

---

## Traps that will bite (learned the hard way)

**Image URLs are baked in at seed time.** `apps/api/src/services/s3.ts:53` writes
`${AWS_ENDPOINT_URL}/${BUCKET}/${key}` straight into `route_steps.image_url`. Seeded against
`localhost:5566`, every navigation photo is dead on a phone. LocalStack publishes `5566:4566` on all
interfaces, so the hotspot address works for laptop and phone alike — configuration, not code. **Order
is strict: set the addresses first, THEN reset.** Changing env afterwards does nothing to existing rows.
Same class of problem as `BASE_URL` and `VITE_API_URL`.

**The notification queue outlives a database wipe.** The seed enqueues to Redis after COMMIT. 451 jobs
had accumulated before this was caught; starting the worker with sending enabled would have fired all
of them at a real phone with dead tokens. `db:reset-demo` now clears the queue.

**Run the tests, THEN reset, then demo.** The suites are what fill the database with residue.

**`TELEGRAM_SEND_ENABLED` is `false` in Doppler and stays that way.** To send for real, override it for
the worker process only:
`TELEGRAM_SEND_ENABLED=true doppler run -p medassist -c dev --preserve-env -- pnpm --filter api worker`
Never `doppler secrets set` it.

## Running it

```powershell
docker compose up -d
doppler run -p medassist -c dev -- pnpm --filter api db:reset-demo

doppler run -p medassist -c dev -- pnpm dev                 # api :3000, patient :5173, back office :5174
doppler run -p medassist -c dev -- pnpm --filter api worker # only when a message must actually go out
```

Accounts: `admin@medassist.test` / `AdminPassword123`, `staff@medassist.test` / `StaffPassword123`,
`eyes@medassist.test` / `StaffPassword123` (ophthalmology).

## Regression gate before any merge

```powershell
doppler run -p medassist -c dev -- npx playwright test --project=api                      # 83 passed
doppler run -p medassist -c dev -- npx playwright test --project=patient-pwa-mobile       # 18 passed, 1 skipped
doppler run -p medassist -c dev -- npx playwright test --project=staff-backoffice-desktop # 15 passed, needs :5174 up
npx tsc --noEmit -p apps/api ; npx tsc --noEmit -p apps/patient-pwa
```

The one skip (`signature page renders canvas`) is pre-existing. Reset the database after running these.

## Still open with the user

- **Artifact re-share.** A teammate's link to the fix-backlog page is pinned to an older version;
  republishing does not move them. They must re-share from the share menu on claude.ai.
- **`chore/poster-demo-seed`** holds a demo-patient seed that never reached main and overlaps
  `db:reset-demo`. Fold in or delete.
- The Doppler dev service token exposed on 2026-08-22 was **accepted as a risk** by the user. Closed.
