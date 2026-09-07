# Demo flow walkthrough — findings

Phase 1 of the demo-day plan. Walked in a real browser on 2026-08-22/23 against a freshly reset
database, back office at desktop size and the patient app at phone size (390×844), in the same order
demo day runs.

**Steps 1-9 covered. Step 10 (ER track, admin config screens) not yet walked.**

Ranked blocker / visible / cosmetic. No fixes were applied during the walk — that is Phase 2.

---

## The flow works end to end

This is the headline. A visitor can be walked through the whole thing today:

1. Staff logs into the back office → clean queue, one patient, no test residue.
2. Creates `משה לוי`, department `עיניים`, `שלח SMS עכשיו` → appointment created.
3. **A real Telegram message was sent and delivered** (worker run with sending enabled for that
   process only; notification row went to `sent`, queue drained to 0).
4. Magic link opens → entry screen with department, date and time, and an add-to-calendar button.
5. Checklist → all 8 ophthalmology items, correct Hebrew, progress `0 מתוך 8`.
6. Forms → the three eye documents, correctly labelled.
7. **The forms gate shipped earlier that day works in the real app:** tapping the CTA with required
   documents missing keeps the patient on the page and shows
   `יש להשלים את כל השדות המסומנים כחובה לפני המשך לניווט`.
8. Navigation → arrival screen, then **all 7 real Wolfson photos**, `שלב 1 מתוך 7` through
   `שלב 7 מתוך 7`, correct order, ending at the ophthalmology reception desk.
9. Waiting → live badge, position 1, 0 ahead, stage tracker.
10. Back office → `משה לוי` now reads `ממתין במחלקה`, `המתין: 0 דק׳`, `טפסים: 0/3`.

The loop closes. Phase 0's reset produces a genuinely presentable system.

---

## BLOCKER — `סוג פרוצדורה` is free text, and its own suggestions are wrong

`apps/staff-backoffice/src/pages/NewAppointment/index.tsx:186-205`

A plain `<input>` with a `<datalist>` of English slugs, placeholder `pre-op-cardiac`. Two problems that
compound:

1. **The datalist offers `cataract`. The seeded template is `cataract-surgery`.** Picking the suggestion
   the app itself offers produces a procedure with no checklist template behind it.
2. **It is free text at all.** A typo on stage silently creates a patient whose checklist does not
   exist. This is also the exact input for open ticket **E4** (`checklist.router.ts:49-52` dereferences
   `template.id` with no existence check, so the patient may get a raw 500).

Why it is a blocker: the demo opens with the presenter typing this field in front of a visitor. It
needs to be a picker of real seeded procedures.

## VISIBLE — the patient is shown the raw English slug

The checklist page subtitle reads `לקראת: cataract-surgery`. A patient-facing screen, in an otherwise
fully Hebrew app, displaying an English database slug. Fixing the blocker above (real procedures with
display names) fixes this too.

## VISIBLE — the forms picker is not filtered by procedure

Same modal as the blocker. "טפסים לשליחה למטופל" lists every template item from every procedure at
once. For the eye patient it offered, side by side:

- `סיכום רפואי מרופא העיניים המפנה` / `תוצאות בדיקת ביומטריה ולחץ תוך-עיני` / `הסכמה לניתוח קטרקט` ← correct
- `סיכום רפואי מהרופא המפנה` / `תוצאות בדיקות דם עדכניות (תפקודי קרישה)` / `הסכמה לניתוח` ← cardiac

Staff must know which is which, and a visitor reading the list sees an app that does not know what
procedure it is preparing for.

## VISIBLE — nothing is attached unless staff ticks it

The whole forms section is opt-in. The BO-created patient came out with **3 forms**; the seeded patient
has **12**. So the demo either shows a patient with almost no paperwork, or the presenter ticks nine
boxes on stage. The universal required items (ID, טופס 17, consents) should almost certainly attach by
default.

## VISIBLE — long form labels wrap into a squeezed column

On the patient forms page, `סיכום רפואי מרופא העיניים המפנה` renders as a narrow stack of single words
crushed against the two upload buttons. Any label beyond a few words breaks the row layout.

## VISIBLE — a required consent the patient cannot act on

`הסכמה לניתוח קטרקט` is `staff_upload_sign` and required, but staff has not uploaded the blank form, so
it shows status `ממתין` with no button and no explanation. The forms gate deliberately does not block on
it (otherwise the patient would be trapped), but the patient still sees a required item they cannot
clear. Needs a line of copy telling them the clinic will prepare it.

## VISIBLE — department arrival details never surface

Phase 0 filled in address, parking, transit and map coordinates for both departments. The entry screen
shows only department, date and time. Either the fields are unused or they live on a screen the flow
does not reach — worth confirming before claiming "we tell patients where to park".

## COSMETIC — final navigation step still says `אני כאן`

Step 7 of 7 is the reception desk. The button could say something conclusive rather than the same label
as every other step.

## COSMETIC — `/api/auth/me` 401s twice on the login page

Two identical unauthenticated calls before login. Harmless, but it is the only thing in the console and
anyone who opens devtools during the demo sees two red lines.

## Note, not a finding — an orphaned notification row

Deleting a queued job straight out of Redis (done during this walk to control the single real send)
leaves its `notifications` row stuck at `retrying` forever. `db:reset-demo` clears it. Only mentioned so
a future session does not mistake it for a delivery bug.

---

## Step 10 — ER track, walked 2026-09-07

No product path exists to create an `er`-track appointment — `createElectiveAppointment`
(`apps/api/src/modules/staff/appointments.service.ts:38`) hardcodes `track = 'elective'` in both
the appointment INSERT and the token generation; the `send_now` checkbox does not affect track,
it only controls SMS timing. Added `apps/api/src/db/seed-er-demo.ts` (reuses the real
`generateToken`/`enqueueNotification` services) to seed one ER patient directly for this walk,
under `עיניים` so it gets the real photographed route rather than placeholder images.

**Verified at the API level** (against the live EC2 box, `GET /api/visit/:token`):
- `visit_date: null` correctly triggers the "urgent visit, no scheduling needed" path —
  `MagicLinkEntry` reads this as the `⚡ ביקור דחוף, אין צורך בתיאום מראש` banner.
- `phase: "navigation"` on first resolve — checklist is skipped entirely, not just hidden,
  exactly as `magic-links.service.ts:100` implements it.
- `track: "er"` is present on the Queue endpoint's per-patient DTO
  (`GET /api/staff/queue`), which is what `Queue/index.tsx:406-408`'s `מיון` badge reads.
- Notification worker completed the ER magic-link send with no errors in the logs. Real receipt
  on a phone still needs eyes-on confirmation, same caveat as the elective check.

**VISIBLE — constitution wording doesn't match actual ER behavior.** `.specify/memory/constitution.md`
describes ER as landing on an "immediate waiting screen." The actual entry phase is `navigation`,
not `waiting` — a patient walks the same navigation photos as elective, just without a checklist
first. Not fixed here (this was a walkthrough, not a fix pass) — flagged for the team to decide
whether the doc or the behavior is wrong.

**Not walked:** the "abbreviated consent forms" behavior the constitution also describes for ER —
no such branching exists in the forms code; ER patients get the same full form set as elective.
Also not walked: the admin configuration screens (still open from Phase 1).

## Next

Phase 2 fixes these top-down, blocker first. Phase 3 is the network dress rehearsal on the real phone,
which has not started and is the highest remaining risk.
