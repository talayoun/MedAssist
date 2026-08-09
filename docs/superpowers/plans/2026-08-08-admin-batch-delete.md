# Admin Batch Selection & Bulk Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a back-office admin select multiple rows in an admin table and delete them in one confirmed pass, while system-protected rows stay undeletable.

**Architecture:** Bulk delete is a **client-side sequential fan-out over the existing per-row DELETE endpoints** — no new API routes, no transactions. Those handlers already encode active-use checks, archive fallback, S3 blank-form cleanup and the manual 7-table appointment cascade; fan-out reuses all of it. The only backend change is a new `is_protected` column plus a 409 guard on three DELETE handlers. On the client, the selection logic lives in pure DOM-free functions (Vitest-testable) with a thin React hook on top, plus two new shared components.

**Tech Stack:** PostgreSQL (`pg`, raw SQL migrations), Express 4 + TypeScript, Zod, React 18 + Vite, Playwright (API + E2E), Vitest (pure logic only).

## Global Constraints

- Every command runs under `doppler run --`. No `.env` files, ever.
- Branch per task-group: work on `feat/admin-batch-delete`, cut from `feat/final-figma-redesign`. Never commit to `main`. Merge back with `--no-ff`.
- No em dash characters in any output, code, comment, or commit message.
- staff-backoffice styling is **100% inline `React.CSSProperties`** objects (`const s: Record<string, React.CSSProperties>`). There are no CSS files, no Tailwind, no tokens in this app. Do not introduce any.
- All back-office UI is Hebrew RTL. The selection checkbox column is the **first DOM cell** so it renders rightmost.
- Testing discipline (CLAUDE.md): HTTP/DB/Redis/browser → Playwright. Pure functions → Vitest. **Do not write happy-dom component tests** and do not add `supertest`.
- `apps/staff-backoffice/vitest.config.ts` `include` is `['tests/**/*.test.tsx', 'src/**/*.test.tsx', 'tests/**/*.test.ts']`. Note: `src/**/*.test.ts` is **not** matched. Unit tests for this feature therefore live in `apps/staff-backoffice/tests/`.
- API error conventions: `400 {error:'invalid_request', issues}` from `safeParse`; `404 {error:'not_found'}`; `409 {error:'<slug>', message:'<Hebrew>'}`.
- Bulk delete is **per table only**. There is no cross-table batch, so semantics are uniform within any one batch.
- Confirmation copy must not say "cannot be undone" for checklists / nav routes / form templates. Those deletes may soft-archive, which is reversible. Only trash hard-delete is permanent.

---

## Context

The four admin tables (`/admin/checklists`, `/admin/navigation-routes`, `/admin/form-templates`, `/admin/trash`) only delete one row at a time, each behind its own confirm. Clearing accumulated test data is tedious. This adds a per-table selection column and a bulk delete action.

Two facts from exploration shape the design:

1. **Delete semantics differ per table** (but are uniform within one table, which is why batches are single-table):

   | Table | Endpoint | Behaviour |
   |---|---|---|
   | Checklists | `DELETE /admin/checklists/:id` | hard delete; `{archived:true}` if completed appointments used it; `409 template_in_active_use` if active ones do |
   | Nav routes | `DELETE /admin/navigation-routes/:id` | same shape, `409 route_in_active_use` |
   | Form templates | `DELETE /admin/form-templates/:id` | always soft (`is_active=false`), returns `204` |
   | Trash | `DELETE /admin/trash/:id` | permanent, manually cascades 7 child tables |

   Even inside one table, outcomes vary per row (deleted / archived / 409). The run must therefore report a **split**, not a blanket "done".

2. **No `is_protected` / `is_system` column exists anywhere.** The user chose to add a real column rather than derive protection client-side.

There is no pagination in these tables. The list is filtered only by the "show archived" toggle, so "select all on the current page" means *all currently rendered rows after filters* — and selection must be pruned whenever the rendered set changes.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `apps/api/src/db/migrations/021_protected_admin_entities.sql` | Adds `is_protected` to three tables |
| `apps/staff-backoffice/src/lib/rowSelection.ts` | Pure, DOM-free selection state functions |
| `apps/staff-backoffice/src/lib/bulkDelete.ts` | Pure outcome classifier + sequential runner |
| `apps/staff-backoffice/src/hooks/useRowSelection.ts` | Thin React wrapper over `lib/rowSelection.ts` |
| `apps/staff-backoffice/src/components/ConfirmDialog/index.tsx` | Shared modal, extracted from duplicated markup |
| `apps/staff-backoffice/src/components/BulkActionBar/index.tsx` | Count + bulk delete + clear selection bar |
| `apps/staff-backoffice/tests/rowSelection.test.ts` | Vitest, pure |
| `apps/staff-backoffice/tests/bulkDelete.test.ts` | Vitest, pure |
| `tests/api/admin-protected-items.spec.ts` | Playwright API contract |
| `tests/e2e/staff/admin-bulk-delete.spec.ts` | Playwright E2E |

**Modify:**

| File | Change |
|---|---|
| `apps/api/src/db/99-alters.sql` | Mirror the three ALTERs (consolidated DDL copy, kept in sync by convention) |
| `apps/api/src/db/seed.ts` | Mark baseline seeded rows protected |
| `apps/api/src/modules/admin/checklists.service.ts` | `is_protected` in SELECTs + row type; guard in `deleteTemplate` |
| `apps/api/src/modules/admin/checklists.router.ts` | Expose `is_protected` in list/get payloads; map `item_protected` to 409 |
| `apps/api/src/modules/admin/navigation-routes.service.ts` | Same pattern |
| `apps/api/src/modules/admin/navigation-routes.router.ts` | Same pattern |
| `apps/api/src/modules/admin/form-templates.service.ts` | Guard in `softDeleteTemplateItem` (uses `SELECT *`, so exposure is automatic) |
| `apps/api/src/modules/admin/form-templates.router.ts` | Map thrown 409 |
| `packages/shared-types/src/staff.ts` | `is_protected` on `ChecklistTemplateDTO`, `AdminRouteDTO` |
| `packages/shared-types/src/visit.ts` | `is_protected` on `FormTemplateItemDTOSchema` |
| `apps/staff-backoffice/src/pages/Admin/index.tsx` | Wire selection (checklists) |
| `apps/staff-backoffice/src/pages/Admin/NavigationRoutes/index.tsx` | Wire selection |
| `apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx` | Wire selection |
| `apps/staff-backoffice/src/pages/Admin/Trash/index.tsx` | Wire selection |

`Admin/Departments/index.tsx` is **out of scope** — it has no DELETE endpoint at all.

---

## Task 0: Land the plan in the repo

- [ ] **Step 1: Cut the branch and copy this plan in**

Branch off `feat/final-figma-redesign` and merge back into it when done. That branch stays the
working trunk for the ongoing Figma work and the UI/UX audit that follows this feature.

```bash
git checkout feat/final-figma-redesign
git checkout -b feat/admin-batch-delete
```

Copy this file to `docs/superpowers/plans/2026-08-08-admin-batch-delete.md` and commit it. The
subagent executor looks for plans there, not in `~/.claude/plans/`.

```bash
git add docs/superpowers/plans/2026-08-08-admin-batch-delete.md
git commit -m "docs: add admin batch delete implementation plan"
```


---

## Task 1: `is_protected` column, exposed through the API

**Files:**
- Create: `apps/api/src/db/migrations/021_protected_admin_entities.sql`
- Modify: `apps/api/src/db/99-alters.sql`, `apps/api/src/db/seed.ts`
- Modify: `apps/api/src/modules/admin/checklists.service.ts:3-11,22-38`, `apps/api/src/modules/admin/checklists.router.ts:38-62`
- Modify: `apps/api/src/modules/admin/navigation-routes.service.ts` (list/get SELECTs and row type)
- Modify: `packages/shared-types/src/staff.ts:126-135,173-179`, `packages/shared-types/src/visit.ts:205-220`
- Test: `tests/api/admin-protected-items.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `is_protected: boolean` on every row returned by `GET /api/admin/checklists`, `GET /api/admin/checklists/:id`, `GET /api/admin/navigation-routes`, `GET /api/admin/navigation-routes/:id`, `GET /api/admin/form-templates`. Types: `ChecklistTemplate.is_protected`, `AdminRoute.is_protected`, `FormTemplateItemDTO.is_protected`.

- [ ] **Step 1: Write the failing API test**

Create `tests/api/admin-protected-items.spec.ts`:

```ts
import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract tests for is_protected on admin-managed entities.
 *
 * Prerequisites:
 *   docker compose up -d
 *   doppler run -- pnpm --filter api db:migrate
 *   doppler run -- pnpm --filter api db:seed
 *   doppler run -- pnpm --filter api dev
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login failed for ${email}: ${await res.text()}`).toBe(200);
}

test.describe('is_protected exposure', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('checklist templates expose is_protected and at least one seeded row is protected', async ({ request }) => {
    const res = await request.get('/api/admin/checklists');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const tpl of body.templates) expect(typeof tpl.is_protected).toBe('boolean');
    expect(body.templates.some((t: { is_protected: boolean }) => t.is_protected)).toBe(true);
  });

  test('navigation routes expose is_protected', async ({ request }) => {
    const res = await request.get('/api/admin/navigation-routes');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const r of body.routes) expect(typeof r.is_protected).toBe('boolean');
  });

  test('form templates expose is_protected', async ({ request }) => {
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const it of body.items) expect(typeof it.is_protected).toBe('boolean');
  });
});
```

> If `GET /api/admin/navigation-routes` returns the array under a key other than `routes`, correct the accessor to match the router — do not change the router to match the test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `doppler run -- pnpm exec playwright test tests/api/admin-protected-items.spec.ts --project=api`
Expected: FAIL, `expected "undefined" to be "boolean"`.

- [ ] **Step 3: Write the migration**

Create `apps/api/src/db/migrations/021_protected_admin_entities.sql`:

```sql
-- Protected system entities: rows an admin must never be able to delete.
-- Enforced server-side in the DELETE handlers; the UI checkbox-disable is cosmetic.
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE navigation_routes   ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE form_template_items ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
```

Append the identical three statements to the end of `apps/api/src/db/99-alters.sql` under a
`-- 021_protected_admin_entities` comment header, matching how that file already mirrors each migration.

- [ ] **Step 4: Run the migration**

Run: `doppler run -- pnpm --filter api db:migrate`
Expected: migration `021_protected_admin_entities` reported as applied.

- [ ] **Step 5: Expose the column in the checklists service and router**

In `apps/api/src/modules/admin/checklists.service.ts`, add `is_protected: boolean;` to the
`ChecklistTemplateRow` interface (after `archived`), and add `is_protected` to the column list of
both SELECTs in `listTemplates` and `getTemplate`:

```ts
`SELECT id, procedure_type, items_json, archived, is_protected, created_at, updated_at
 FROM checklist_templates
 ${includeArchived ? '' : 'WHERE archived = FALSE'}
 ORDER BY procedure_type ASC`
```

In `apps/api/src/modules/admin/checklists.router.ts`, add `is_protected: r.is_protected,` to the
`templates` map in `GET /checklists`, and `is_protected: row.is_protected,` to the response objects of
`GET /checklists/:id`, `POST /checklists` (line 75) and `PUT /checklists/:id` — all four return the
same template shape, so leaving one out would make the field intermittently `undefined` on the client.

- [ ] **Step 6: Do the same for navigation routes**

In `apps/api/src/modules/admin/navigation-routes.service.ts`, add `is_protected: boolean;` to
`NavigationRouteRow` (line 4), and `is_protected` to the two `navigation_routes` SELECT column lists
at lines 43 and 54 (list and get). Leave the `route_steps` queries untouched — steps have no
protection concept.

In `apps/api/src/modules/admin/navigation-routes.router.ts`, add `is_protected: row.is_protected,` to
`serializeRoute` (line 54 to 62) — every route-returning response (list, get, create, update) flows
through this one function, so this single change covers all of them.

Form templates need no service change: `listTemplateItems` already does `SELECT *`.

- [ ] **Step 7: Add the field to shared types**

`packages/shared-types/src/staff.ts` — in `AdminRouteDTO` (after `archived`) and `ChecklistTemplateDTO`
(after `archived`):

```ts
  is_protected: z.boolean().default(false),
```

`packages/shared-types/src/visit.ts` — add the same line to `FormTemplateItemDTOSchema`.

- [ ] **Step 8: Mark baseline rows protected in the seed**

In `apps/api/src/db/seed.ts`, after the navigation routes are inserted (the checklist template insert
is at line 164 to 168, inside the transaction, so use the same `client.query`):

```ts
// Baseline system entities: admins may edit them but never delete them.
await client.query(
  `UPDATE checklist_templates SET is_protected = TRUE
   WHERE procedure_type = 'pre-op-cardiac' AND hospital_id = $1`,
  [HOSPITAL_ID]
);
await client.query(
  `UPDATE navigation_routes SET is_protected = TRUE WHERE is_default = TRUE`
);
```

`'pre-op-cardiac'` is the procedure type the seed already inserts at line 166. Do not invent a new
template. Leave `form_template_items` unprotected: the seeded intake fields are content an admin is
expected to curate, and the column defaults to `FALSE` so nothing changes for them.

- [ ] **Step 9: Re-seed and run the test to verify it passes**

Run:
```bash
doppler run -- pnpm --filter api db:seed
doppler run -- pnpm exec playwright test tests/api/admin-protected-items.spec.ts --project=api
```
Expected: PASS, 3 tests.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/db/migrations/021_protected_admin_entities.sql apps/api/src/db/99-alters.sql apps/api/src/db/seed.ts apps/api/src/modules/admin/checklists.service.ts apps/api/src/modules/admin/checklists.router.ts apps/api/src/modules/admin/navigation-routes.service.ts apps/api/src/modules/admin/navigation-routes.router.ts packages/shared-types/src/staff.ts packages/shared-types/src/visit.ts tests/api/admin-protected-items.spec.ts
git commit -m "feat(admin): add is_protected flag to admin-managed entities"
```

---

## Task 2: Server-side delete guard for protected rows

**Files:**
- Modify: `apps/api/src/modules/admin/checklists.service.ts:114-154`, `apps/api/src/modules/admin/checklists.router.ts:119-138`
- Modify: `apps/api/src/modules/admin/navigation-routes.service.ts:199-224`, `apps/api/src/modules/admin/navigation-routes.router.ts:149-168`
- Modify: `apps/api/src/modules/admin/form-templates.service.ts:83-89`, `apps/api/src/modules/admin/form-templates.router.ts:64-67`
- Test: `tests/api/admin-protected-items.spec.ts` (extend)

**Interfaces:**
- Consumes: `is_protected` from Task 1.
- Produces: `409 { error: 'item_protected', message: 'פריט מערכת מוגן. לא ניתן למחוק.' }` from all three DELETE endpoints. This is the authoritative guard; the UI checkbox-disable is cosmetic.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/admin-protected-items.spec.ts`:

```ts
test.describe('protected rows cannot be deleted', () => {
  test.beforeEach(async ({ request }) => { await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD); });

  test('DELETE on a protected checklist template returns 409 item_protected', async ({ request }) => {
    const list = await request.get('/api/admin/checklists');
    const protectedTpl = (await list.json()).templates
      .find((t: { is_protected: boolean }) => t.is_protected);
    expect(protectedTpl, 'seed must contain a protected template').toBeTruthy();

    const res = await request.delete(`/api/admin/checklists/${protectedTpl.template_id}`);
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('item_protected');
  });

  test('the protected template still exists after the rejected delete', async ({ request }) => {
    const list = await request.get('/api/admin/checklists');
    const still = (await list.json()).templates
      .some((t: { is_protected: boolean }) => t.is_protected);
    expect(still).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then immediately re-seed**

This test genuinely deletes the protected seed row while the guard is missing, so the re-seed is part
of the same step. Run both commands together:

```bash
doppler run -- pnpm exec playwright test tests/api/admin-protected-items.spec.ts --project=api; doppler run -- pnpm --filter api db:seed
```

Expected: FAIL, received `200` instead of `409`. After the re-seed the protected template is back;
do not move on until `GET /api/admin/checklists` shows an `is_protected: true` row again.

- [ ] **Step 3: Guard `deleteTemplate`**

In `apps/api/src/modules/admin/checklists.service.ts`, widen the return type error union and insert
the guard immediately after the existence check:

```ts
export async function deleteTemplate(
  id: string
): Promise<{ deleted: boolean; archived?: boolean; active_count?: number; error?: string }> {
  const existing = await getTemplate(id);
  if (!existing) return { deleted: false, error: 'not_found' };
  if (existing.is_protected) return { deleted: false, error: 'item_protected' };
  // ... existing active-use / history logic unchanged
```

- [ ] **Step 4: Map it to 409 in the checklists router**

In `apps/api/src/modules/admin/checklists.router.ts`, inside the `DELETE /checklists/:id` handler,
insert directly after the `not_found` branch:

```ts
    if (result.error === 'item_protected') {
      res.status(409).json({
        error: 'item_protected',
        message: 'פריט מערכת מוגן. לא ניתן למחוק.',
      });
      return;
    }
```

- [ ] **Step 5: Guard navigation routes identically**

In `navigation-routes.service.ts` `deleteRoute`, after `if (!existing) return { deleted: false, error: 'not_found' };`:

```ts
  if (existing.is_protected) return { deleted: false, error: 'item_protected' };
```

In `navigation-routes.router.ts` `DELETE /navigation-routes/:id`, after the `not_found` branch, add
the same `item_protected` 409 block as Step 4 (repeat it verbatim).

- [ ] **Step 6: Guard form templates**

`form-templates.service.ts` uses the throw-with-status convention, so:

```ts
export async function softDeleteTemplateItem(id: string) {
  const { rows: existing } = await query<{ is_protected: boolean }>(
    `SELECT is_protected FROM form_template_items WHERE id = $1`,
    [id],
  );
  if (!existing[0]) throw Object.assign(new Error('Not found'), { status: 404 });
  if (existing[0].is_protected) {
    throw Object.assign(new Error('פריט מערכת מוגן. לא ניתן למחוק.'), { status: 409 });
  }
  const { rows } = await query(
    `UPDATE form_template_items SET is_active = false WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 });
}
```

In `form-templates.router.ts`, make the DELETE handler emit the same error slug the other two use:

```ts
router.delete('/form-templates/:id', async (req, res, next) => {
  try { await svc.softDeleteTemplateItem(req.params.id); res.sendStatus(204); }
  catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409) { res.status(409).json({ error: 'item_protected', message: e.message }); return; }
    next(err);
  }
});
```

- [ ] **Step 7: Re-seed and run the tests to verify they pass**

Run:
```bash
doppler run -- pnpm --filter api db:seed
doppler run -- pnpm exec playwright test tests/api/admin-protected-items.spec.ts --project=api
```
Expected: PASS, 5 tests.

- [ ] **Step 8: Run the existing admin suites for regressions**

Run: `doppler run -- pnpm exec playwright test tests/api/admin-checklists.spec.ts tests/api/admin-navigation-routes.spec.ts tests/api/admin-form-templates.spec.ts --project=api`
Expected: PASS, no new failures.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/admin tests/api/admin-protected-items.spec.ts
git commit -m "feat(admin): reject delete of protected entities with 409"
```

---

## Task 3: Pure selection state (`lib/rowSelection.ts`)

**Files:**
- Create: `apps/staff-backoffice/src/lib/rowSelection.ts`
- Test: `apps/staff-backoffice/tests/rowSelection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SelectableRow { id: string; protected: boolean }
  export function toSelectable<T>(rows: T[], getId: (r: T) => string, isProtected: (r: T) => boolean): SelectableRow[]
  export function selectableIds(rows: SelectableRow[]): string[]
  export function toggleId(selected: ReadonlySet<string>, id: string): Set<string>
  export function pruneSelection(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string>
  export function toggleAll(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string>
  export function selectionState(selected: ReadonlySet<string>, rows: SelectableRow[]): 'none' | 'some' | 'all'
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/staff-backoffice/tests/rowSelection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  toSelectable, selectableIds, toggleId, pruneSelection, toggleAll, selectionState,
  type SelectableRow,
} from '../src/lib/rowSelection';

const rows: SelectableRow[] = [
  { id: 'a', protected: false },
  { id: 'b', protected: false },
  { id: 'p', protected: true },
];

describe('toSelectable', () => {
  it('maps arbitrary rows through the id and protection accessors', () => {
    const src = [{ key: 'x', sys: true }, { key: 'y', sys: false }];
    expect(toSelectable(src, (r) => r.key, (r) => r.sys)).toEqual([
      { id: 'x', protected: true },
      { id: 'y', protected: false },
    ]);
  });
});

describe('selectableIds', () => {
  it('excludes protected rows', () => {
    expect(selectableIds(rows)).toEqual(['a', 'b']);
  });
});

describe('toggleId', () => {
  it('adds an absent id', () => {
    expect([...toggleId(new Set(), 'a')]).toEqual(['a']);
  });
  it('removes a present id', () => {
    expect([...toggleId(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });
  it('does not mutate the input set', () => {
    const src = new Set(['a']);
    toggleId(src, 'b');
    expect([...src]).toEqual(['a']);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer rendered', () => {
    expect([...pruneSelection(new Set(['a', 'gone']), rows)]).toEqual(['a']);
  });
  it('drops ids that became protected', () => {
    expect([...pruneSelection(new Set(['a', 'p']), rows)]).toEqual(['a']);
  });
  it('returns an empty set when nothing is rendered', () => {
    expect([...pruneSelection(new Set(['a']), [])]).toEqual([]);
  });
});

describe('toggleAll', () => {
  it('selects every selectable row when none are selected', () => {
    expect([...toggleAll(new Set(), rows)]).toEqual(['a', 'b']);
  });
  it('never selects a protected row', () => {
    expect([...toggleAll(new Set(), rows)]).not.toContain('p');
  });
  it('clears the selection when all selectable rows are already selected', () => {
    expect([...toggleAll(new Set(['a', 'b']), rows)]).toEqual([]);
  });
  it('completes a partial selection', () => {
    expect([...toggleAll(new Set(['a']), rows)]).toEqual(['a', 'b']);
  });
});

describe('selectionState', () => {
  it('reports none', () => { expect(selectionState(new Set(), rows)).toBe('none'); });
  it('reports some', () => { expect(selectionState(new Set(['a']), rows)).toBe('some'); });
  it('reports all when every selectable row is selected', () => {
    expect(selectionState(new Set(['a', 'b']), rows)).toBe('all');
  });
  it('reports none when there is nothing selectable', () => {
    expect(selectionState(new Set(), [{ id: 'p', protected: true }])).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `doppler run -- pnpm --filter staff-backoffice exec vitest run tests/rowSelection.test.ts`
Expected: FAIL, "Failed to resolve import ../src/lib/rowSelection".

- [ ] **Step 3: Write the implementation**

Create `apps/staff-backoffice/src/lib/rowSelection.ts`:

```ts
/**
 * Pure selection-state helpers for admin tables.
 *
 * These tables have no pagination: the rendered set is the full list minus the
 * "show archived" filter. So "select all" means all currently rendered rows, and
 * the selection must be pruned whenever that rendered set changes, or a hidden
 * row could be swept into a bulk delete.
 */

export interface SelectableRow {
  id: string;
  protected: boolean;
}

export function toSelectable<T>(
  rows: T[],
  getId: (row: T) => string,
  isProtected: (row: T) => boolean,
): SelectableRow[] {
  return rows.map((row) => ({ id: getId(row), protected: isProtected(row) }));
}

export function selectableIds(rows: SelectableRow[]): string[] {
  return rows.filter((r) => !r.protected).map((r) => r.id);
}

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function pruneSelection(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string> {
  const allowed = new Set(selectableIds(rows));
  return new Set([...selected].filter((id) => allowed.has(id)));
}

export function toggleAll(selected: ReadonlySet<string>, rows: SelectableRow[]): Set<string> {
  const ids = selectableIds(rows);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return allSelected ? new Set() : new Set(ids);
}

export function selectionState(
  selected: ReadonlySet<string>,
  rows: SelectableRow[],
): 'none' | 'some' | 'all' {
  const ids = selectableIds(rows);
  const hits = ids.filter((id) => selected.has(id)).length;
  if (hits === 0) return 'none';
  return hits === ids.length ? 'all' : 'some';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `doppler run -- pnpm --filter staff-backoffice exec vitest run tests/rowSelection.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/staff-backoffice/src/lib/rowSelection.ts apps/staff-backoffice/tests/rowSelection.test.ts
git commit -m "feat(backoffice): add pure row-selection helpers"
```

---

## Task 4: Bulk delete runner (`lib/bulkDelete.ts`)

**Files:**
- Create: `apps/staff-backoffice/src/lib/bulkDelete.ts`
- Test: `apps/staff-backoffice/tests/bulkDelete.test.ts`

**Interfaces:**
- Consumes: nothing (the caller injects `deleteOne`).
- Produces:
  ```ts
  export type BulkOutcome = 'deleted' | 'archived' | 'failed';
  export interface BulkResult { id: string; label: string; outcome: BulkOutcome; reason?: string }
  export interface BulkSummary { deleted: number; archived: number; failed: number; results: BulkResult[] }
  export function classifyOutcome(value: unknown): BulkOutcome
  export function summarize(results: BulkResult[]): BulkSummary
  export function summaryMessage(summary: BulkSummary): string
  export function runBulkDelete(
    items: { id: string; label: string }[],
    deleteOne: (id: string) => Promise<unknown>,
  ): Promise<BulkSummary>
  ```

Deletion is **sequential**, not `Promise.all`: it keeps the result order stable and avoids hammering
the API on long lists. `runBulkDelete` never rejects; every id gets an outcome.

- [ ] **Step 1: Write the failing test**

Create `apps/staff-backoffice/tests/bulkDelete.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  classifyOutcome, summarize, summaryMessage, runBulkDelete, type BulkResult,
} from '../src/lib/bulkDelete';

describe('classifyOutcome', () => {
  it('treats {archived:true} as archived', () => {
    expect(classifyOutcome({ deleted: false, archived: true })).toBe('archived');
  });
  it('treats {deleted:true, archived:false} as deleted', () => {
    expect(classifyOutcome({ deleted: true, archived: false })).toBe('deleted');
  });
  it('treats a 204 void response as deleted', () => {
    expect(classifyOutcome(undefined)).toBe('deleted');
  });
});

describe('summarize', () => {
  it('counts each outcome', () => {
    const results: BulkResult[] = [
      { id: '1', label: 'a', outcome: 'deleted' },
      { id: '2', label: 'b', outcome: 'archived' },
      { id: '3', label: 'c', outcome: 'failed', reason: 'in use' },
      { id: '4', label: 'd', outcome: 'deleted' },
    ];
    expect(summarize(results)).toEqual({ deleted: 2, archived: 1, failed: 1, results });
  });
});

describe('summaryMessage', () => {
  it('reports only the non-zero buckets, in Hebrew', () => {
    const msg = summaryMessage(summarize([
      { id: '1', label: 'a', outcome: 'deleted' },
      { id: '2', label: 'b', outcome: 'archived' },
    ]));
    expect(msg).toContain('נמחקו 1');
    expect(msg).toContain('הועברו לארכיון 1');
    expect(msg).not.toContain('נכשלו');
  });
});

describe('runBulkDelete', () => {
  it('returns one result per item and never throws', async () => {
    const summary = await runBulkDelete(
      [{ id: 'ok', label: 'A' }, { id: 'boom', label: 'B' }],
      async (id) => { if (id === 'boom') throw new Error('nope'); return { deleted: true, archived: false }; },
    );
    expect(summary.results).toHaveLength(2);
    expect(summary.deleted).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results[1].reason).toBe('nope');
  });

  it('deletes sequentially, preserving input order', async () => {
    const seen: string[] = [];
    const summary = await runBulkDelete(
      [{ id: '1', label: 'A' }, { id: '2', label: 'B' }, { id: '3', label: 'C' }],
      async (id) => { seen.push(id); return undefined; },
    );
    expect(seen).toEqual(['1', '2', '3']);
    expect(summary.results.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('maps a rejected ApiError to failed and keeps the server message as the reason', async () => {
    // apiRequest throws ApiError on any non-ok response, so a 409 item_protected
    // never reaches classifyOutcome. It must surface as a failure with the
    // server's Hebrew message intact.
    class FakeApiError extends Error {
      constructor(public status: number, public code: string, message: string) { super(message); }
    }
    const summary = await runBulkDelete(
      [{ id: 'p', label: 'תבנית מערכת' }],
      async () => { throw new FakeApiError(409, 'item_protected', 'פריט מערכת מוגן. לא ניתן למחוק.'); },
    );
    expect(summary.failed).toBe(1);
    expect(summary.results[0].outcome).toBe('failed');
    expect(summary.results[0].reason).toBe('פריט מערכת מוגן. לא ניתן למחוק.');
  });

  it('records an archived outcome without counting it as deleted', async () => {
    const summary = await runBulkDelete(
      [{ id: '1', label: 'A' }],
      async () => ({ deleted: false, archived: true }),
    );
    expect(summary).toMatchObject({ deleted: 0, archived: 1, failed: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `doppler run -- pnpm --filter staff-backoffice exec vitest run tests/bulkDelete.test.ts`
Expected: FAIL, "Failed to resolve import ../src/lib/bulkDelete".

- [ ] **Step 3: Write the implementation**

Create `apps/staff-backoffice/src/lib/bulkDelete.ts`:

```ts
/**
 * Sequential fan-out over the existing per-row DELETE endpoints.
 *
 * There is deliberately no bulk API route: the per-row handlers already encode
 * active-use checks, archive fallback, S3 cleanup and the manual appointment
 * cascade. Batches are single-table, so semantics are uniform inside one run,
 * but outcomes still vary per row (deleted / archived / rejected) and the caller
 * must report the split rather than a blanket success.
 */

export type BulkOutcome = 'deleted' | 'archived' | 'failed';

export interface BulkResult {
  id: string;
  label: string;
  outcome: BulkOutcome;
  reason?: string;
}

export interface BulkSummary {
  deleted: number;
  archived: number;
  failed: number;
  results: BulkResult[];
}

export function classifyOutcome(value: unknown): BulkOutcome {
  if (value && typeof value === 'object' && (value as { archived?: boolean }).archived === true) {
    return 'archived';
  }
  return 'deleted';
}

export function summarize(results: BulkResult[]): BulkSummary {
  return {
    deleted: results.filter((r) => r.outcome === 'deleted').length,
    archived: results.filter((r) => r.outcome === 'archived').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
    results,
  };
}

export function summaryMessage(summary: BulkSummary): string {
  const parts: string[] = [];
  if (summary.deleted) parts.push(`נמחקו ${summary.deleted}`);
  if (summary.archived) parts.push(`הועברו לארכיון ${summary.archived}`);
  if (summary.failed) parts.push(`נכשלו ${summary.failed}`);
  return parts.length ? parts.join(', ') : 'לא בוצעו שינויים';
}

export async function runBulkDelete(
  items: { id: string; label: string }[],
  deleteOne: (id: string) => Promise<unknown>,
): Promise<BulkSummary> {
  const results: BulkResult[] = [];
  for (const item of items) {
    try {
      const value = await deleteOne(item.id);
      results.push({ id: item.id, label: item.label, outcome: classifyOutcome(value) });
    } catch (err) {
      results.push({
        id: item.id,
        label: item.label,
        outcome: 'failed',
        reason: err instanceof Error ? err.message : 'שגיאה לא ידועה',
      });
    }
  }
  return summarize(results);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `doppler run -- pnpm --filter staff-backoffice exec vitest run tests/bulkDelete.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/staff-backoffice/src/lib/bulkDelete.ts apps/staff-backoffice/tests/bulkDelete.test.ts
git commit -m "feat(backoffice): add sequential bulk-delete runner"
```

---

## Task 5: `useRowSelection` hook and the two shared components

**Files:**
- Create: `apps/staff-backoffice/src/hooks/useRowSelection.ts`
- Create: `apps/staff-backoffice/src/components/ConfirmDialog/index.tsx`
- Create: `apps/staff-backoffice/src/components/BulkActionBar/index.tsx`

**Interfaces:**
- Consumes: everything from `src/lib/rowSelection.ts`.
- Produces:
  ```ts
  useRowSelection<T>(rows: T[], getId: (r: T) => string, isProtected?: (r: T) => boolean): {
    selected: Set<string>;
    selectedCount: number;
    headerState: 'none' | 'some' | 'all';
    isSelected(id: string): boolean;
    toggle(id: string): void;
    toggleAllVisible(): void;
    clear(): void;
    remove(id: string): void;
  }

  <ConfirmDialog title body confirmLabel danger busy error onConfirm onCancel />
  <BulkActionBar count onDelete onClear />   // renders null when count <= 1
  ```

No test task of its own: the logic under these is already covered by Tasks 3 and 4, and the rendered
behaviour is covered by the E2E in Task 10. Per CLAUDE.md, no happy-dom component tests.

- [ ] **Step 1: Write the hook**

Create `apps/staff-backoffice/src/hooks/useRowSelection.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  toSelectable, toggleId, toggleAll, pruneSelection, selectionState,
} from '../lib/rowSelection';

export function useRowSelection<T>(
  rows: T[],
  getId: (row: T) => string,
  isProtected: (row: T) => boolean = () => false,
) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = useMemo(
    () => toSelectable(rows, getId, isProtected),
    // getId / isProtected are inline arrows recreated every render; rows drives this
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  // Every refetch produces a fresh `rows` array, so `selectable` is a new object
  // reference on each load even when the content is identical. Keying the prune
  // effect on a primitive digest instead of the array stops it re-firing forever.
  const selectableKey = useMemo(
    () => selectable.map((r) => `${r.id}:${r.protected ? 1 : 0}`).join('|'),
    [selectable],
  );

  // The rendered set changes when the "show archived" filter flips or after a
  // refetch. Without this prune, a stale id could be swept into a bulk delete
  // even though its row is no longer on screen.
  useEffect(() => {
    setSelected((prev) => {
      const next = pruneSelection(prev, selectable);
      // Compare content, not size: a row can flip to protected without the count
      // changing, and that id must still be dropped.
      const unchanged = next.size === prev.size && [...prev].every((id) => next.has(id));
      return unchanged ? prev : next;
    });
    // selectable is intentionally read but not depended on; selectableKey is its digest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectableKey]);

  const toggle = useCallback((id: string) => setSelected((prev) => toggleId(prev, id)), []);
  const toggleAllVisible = useCallback(
    () => setSelected((prev) => toggleAll(prev, selectable)),
    [selectable],
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const remove = useCallback((id: string) => setSelected((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  }), []);

  return {
    selected,
    selectedCount: selected.size,
    headerState: selectionState(selected, selectable),
    isSelected: (id: string) => selected.has(id),
    toggle,
    toggleAllVisible,
    clear,
    remove,
  };
}
```

- [ ] **Step 2: Write ConfirmDialog**

Create `apps/staff-backoffice/src/components/ConfirmDialog/index.tsx`. Copy the inline style values
verbatim from the duplicated block in `src/pages/Admin/index.tsx` (`backdrop`, `modal`, `modalHeader`,
`modalTitle`, `modalBody`, `modalActions`, `closeBtn`, `dangerBtn`) so nothing shifts visually:

```tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, body, confirmLabel, danger = true, busy = false, error = null, onConfirm, onCancel,
}: Props) {
  return (
    <div style={s.backdrop} onClick={onCancel}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{title}</h2>
          <button onClick={onCancel} style={s.closeBtn}>×</button>
        </div>
        <div style={s.modalBody}>
          {body}
          {error && <p style={s.error}>{error}</p>}
          <div style={s.modalActions}>
            <button onClick={onCancel} style={s.cancelBtn} disabled={busy}>ביטול</button>
            <button
              onClick={onConfirm}
              style={danger ? s.dangerBtn : s.primaryBtn}
              disabled={busy}
            >
              {busy ? 'מבצע...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Values lifted verbatim from src/pages/Admin/index.tsx so nothing shifts visually.
const s: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, width: 'min(640px, 90vw)', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: { background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280', lineHeight: 1 },
  modalBody: { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-start', marginTop: 8 },
  cancelBtn: { padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer' },
  dangerBtn: { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#b91c1c', fontSize: 13, margin: 0 },
};
```

> `modalActions` and the error line stay **inside** `modalBody`, exactly as in the original markup,
> so they inherit its `padding: 20` and nothing shifts. Every value above is copied character for
> character from `Admin/index.tsx` (`errorMsg` becomes `error`).

- [ ] **Step 3: Write BulkActionBar**

Create `apps/staff-backoffice/src/components/BulkActionBar/index.tsx`:

```tsx
interface Props {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * Renders only above 1 selected row: a single selected row already has its own
 * per-row delete button, so a bulk action there would be redundant. Change the
 * threshold to `count < 1` if that turns out to feel wrong in use.
 */
export function BulkActionBar({ count, onDelete, onClear }: Props) {
  if (count <= 1) return null;
  return (
    <div style={s.bar}>
      <span style={s.count}>{count} נבחרו</span>
      <button onClick={onDelete} style={s.dangerBtn}>מחק נבחרים</button>
      <button onClick={onClear} style={s.clearBtn}>נקה בחירה</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    direction: 'rtl', display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', marginBottom: 12, borderRadius: 8,
    background: '#F0FDFA', border: '1px solid #5EEAD4',
  },
  count: { fontWeight: 600, color: '#0F766E', marginInlineEnd: 'auto' },
  dangerBtn: {
    padding: '8px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    background: '#dc2626', color: '#fff', fontSize: 14,
  },
  clearBtn: {
    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
    background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', fontSize: 14,
  },
};
```

- [ ] **Step 4: Verify it type-checks and lints**

Run: `doppler run -- pnpm --filter staff-backoffice exec tsc --noEmit && doppler run -- pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/staff-backoffice/src/hooks apps/staff-backoffice/src/components/ConfirmDialog apps/staff-backoffice/src/components/BulkActionBar
git commit -m "feat(backoffice): add selection hook, shared confirm dialog and bulk action bar"
```

---

## Task 6: Wire checklist templates (`/admin/checklists`)

**Files:**
- Modify: `apps/staff-backoffice/src/pages/Admin/index.tsx` (table ~line 169, delete handler ~line 131)

**Interfaces:**
- Consumes: `useRowSelection`, `BulkActionBar`, `ConfirmDialog`, `runBulkDelete`, `summaryMessage`, `deleteChecklist` from `../../services/api`, `ChecklistTemplate.is_protected`.
- Produces: the reference wiring pattern that Tasks 7 to 9 repeat.

- [ ] **Step 1: Add the selection hook and bulk state**

Inside the `Admin` component, after the existing `templates` state:

```tsx
const selection = useRowSelection(
  templates,
  (t) => t.template_id,
  (t) => t.is_protected,
);
const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
const [bulkBusy, setBulkBusy] = useState(false);
```

- [ ] **Step 2: Add the bulk delete handler**

```tsx
async function handleBulkDelete() {
  const items = templates
    .filter((t) => selection.isSelected(t.template_id))
    .map((t) => ({ id: t.template_id, label: t.procedure_type }));

  setBulkBusy(true);
  const summary = await runBulkDelete(items, deleteChecklist);
  setBulkBusy(false);
  setBulkConfirmOpen(false);
  selection.clear();

  const failed = summary.results.filter((r) => r.outcome === 'failed');
  setError(
    failed.length
      ? `${summaryMessage(summary)}. נכשלו: ${failed.map((r) => r.label).join(', ')}`
      : summaryMessage(summary)
  );
  await fetchTemplates();
}
```

- [ ] **Step 3: Drop the deleted id from the selection on single-row delete**

In the existing `handleDelete`, immediately after `setConfirmDeleteId(null);`:

```tsx
      selection.remove(templateId);
```

This is what keeps a per-row delete independent: the other selected rows stay selected and no bulk
action fires.

- [ ] **Step 4: Render the bulk bar above the table**

Directly before `<div style={s.tableWrap}>`:

```tsx
<BulkActionBar
  count={selection.selectedCount}
  onDelete={() => setBulkConfirmOpen(true)}
  onClear={selection.clear}
/>
```

- [ ] **Step 5: Add the checkbox column**

In `<thead>`, as the **first** `<th>`:

```tsx
<th style={s.th}>
  <input
    type="checkbox"
    aria-label="בחר הכל"
    checked={selection.headerState === 'all'}
    ref={(el) => { if (el) el.indeterminate = selection.headerState === 'some'; }}
    onChange={selection.toggleAllVisible}
  />
</th>
```

In `<tbody>`, as the **first** `<td>` of each row:

```tsx
<td style={s.td}>
  <input
    type="checkbox"
    aria-label={`בחר ${tpl.procedure_type}`}
    disabled={tpl.is_protected}
    checked={selection.isSelected(tpl.template_id)}
    onChange={() => selection.toggle(tpl.template_id)}
  />
</td>
```

- [ ] **Step 6: Show a protected badge and hide the row delete for protected rows**

In the status cell, before the archived/active badge:

```tsx
{tpl.is_protected && <span style={s.archivedBadge}>מערכת</span>}
```

In the actions cell, change the delete button's guard from `!tpl.archived` to
`!tpl.archived && !tpl.is_protected`. Keep the edit button available for protected rows.

- [ ] **Step 7: Add the confirmation dialog**

Next to the existing confirm modal:

```tsx
{bulkConfirmOpen && (
  <ConfirmDialog
    title="מחיקת תבניות"
    body={`למחוק ${selection.selectedCount} תבניות? תבניות שנמצאות בשימוש יועברו לארכיון.`}
    confirmLabel="מחק"
    busy={bulkBusy}
    onConfirm={handleBulkDelete}
    onCancel={() => setBulkConfirmOpen(false)}
  />
)}
```

Do not write "לא ניתן לשחזר" here. Archiving is reversible through the "הצג מאורכבים" filter, so that
copy would be false.

- [ ] **Step 8: Verify by hand**

Run the stack (see Verification below), open `http://localhost:5174/admin/checklists`, then:
select 1 row (no bar), select 2 (bar appears), confirm, read the split banner; select 3 and click one
row's own "מחיקה" (only that row goes, 2 stay selected); toggle "הצג מאורכבים" (selection prunes);
confirm the protected row's checkbox is disabled and carries the "מערכת" badge.

- [ ] **Step 9: Commit**

```bash
git add apps/staff-backoffice/src/pages/Admin/index.tsx
git commit -m "feat(backoffice): bulk delete for checklist templates"
```

---

## Task 7: Wire navigation routes (`/admin/navigation-routes`)

**Files:**
- Modify: `apps/staff-backoffice/src/pages/Admin/NavigationRoutes/index.tsx` (table ~line 257)

**Interfaces:**
- Consumes: the same set as Task 6, but `deleteNavigationRoute` and `AdminRoute.is_protected`.
- Produces: nothing new.

- [ ] **Step 1: Apply the Task 6 pattern**

Repeat every step of Task 6 against this file, substituting:

| Task 6 | Task 7 |
|---|---|
| `templates` state | `routes` state (line 28) |
| `t.template_id` | `r.route_id` |
| `t.procedure_type` (label) | `r.name` |
| `deleteChecklist` | `deleteNavigationRoute` |
| `fetchTemplates()` | `fetchData()` (the `useCallback` used at line 58) |
| title `מחיקת תבניות` | `מחיקת מסלולים` |
| body `למחוק N תבניות? תבניות שנמצאות בשימוש יועברו לארכיון.` | `למחוק N מסלולים? מסלולים בשימוש יועברו לארכיון.` |

- [ ] **Step 2: Replace the local confirm modal with ConfirmDialog**

This page carries the second verbatim copy of the modal markup (styles ~480-486). Swap its
`confirmDeleteId` block for `<ConfirmDialog>` so the two copies collapse into one component. Keep the
existing Hebrew copy and the 409 error text.

- [ ] **Step 3: Verify by hand**

Same checks as Task 6 Step 8, on `/admin/navigation-routes`. Additionally confirm the default route
(seeded `is_default = TRUE`, therefore protected) has a disabled checkbox.

- [ ] **Step 4: Commit**

```bash
git add apps/staff-backoffice/src/pages/Admin/NavigationRoutes/index.tsx
git commit -m "feat(backoffice): bulk delete for navigation routes"
```

---

## Task 8: Wire form templates (`/admin/form-templates`)

**Files:**
- Modify: `apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx` (table ~line 317, `handleDelete` ~line 122)

**Interfaces:**
- Consumes: `deleteFormTemplate`, `FormTemplateItemDTO.is_protected`.
- Produces: nothing new.

- [ ] **Step 1: Replace `window.confirm` with ConfirmDialog**

`handleDelete` currently calls `window.confirm('למחוק תבנית זו?')`. Replace it with a
`confirmDeleteId` state plus a `<ConfirmDialog>`, matching Task 6. This also gives the page the
modal styling the other admin pages already use.

- [ ] **Step 2: Apply the Task 6 pattern**

Substituting:

| Task 6 | Task 8 |
|---|---|
| `templates` state | `items` state (line 59) |
| `t.template_id` | `item.id` |
| `t.procedure_type` (label) | `item.label` |
| `deleteChecklist` | `deleteFormTemplate` |
| `fetchTemplates()` | `load()` (called from the `useEffect` at line 84) |
| `setError(...)` | the page's existing `setError` |
| body copy | `להסיר ${selection.selectedCount} תבניות טפסים?` |

`deleteFormTemplate` returns `Promise<void>`, and `classifyOutcome(undefined)` maps that to
`'deleted'`, so no special handling is needed.

- [ ] **Step 3: Verify by hand**

Same checks, on `/admin/form-templates`.

- [ ] **Step 4: Commit**

```bash
git add apps/staff-backoffice/src/pages/Admin/FormTemplates/index.tsx
git commit -m "feat(backoffice): bulk delete for form templates"
```

---

## Task 9: Wire trash (`/admin/trash`)

**Files:**
- Modify: `apps/staff-backoffice/src/pages/Admin/Trash/index.tsx` (table ~line 74)

**Interfaces:**
- Consumes: `hardDeleteAppointment`, `TrashEntry`.
- Produces: nothing new.

- [ ] **Step 1: Apply the Task 6 pattern, with no protection predicate**

Trash rows are already-deleted patient records; nothing there is a system default. Omit the third
argument to `useRowSelection`, keep every checkbox enabled, and render no "מערכת" badge:

```tsx
const selection = useRowSelection(entries, (e) => e.appointment_id);
```

The rows state is `entries` (line 16), the refetch is `load()` (line 21). Label rows with
`entry.patient_name`. Delete function: `hardDeleteAppointment`.

- [ ] **Step 2: Use permanent-deletion copy**

This is the one table where the delete is genuinely irreversible, so the warning is accurate here and
only here:

```tsx
body={`למחוק לצמיתות ${selection.selectedCount} מטופלים? לא ניתן לשחזר.`}
```

- [ ] **Step 3: Replace the row-level `window.confirm` with ConfirmDialog**

Same swap as Task 8 Step 1, keeping the existing hard-delete warning text.

- [ ] **Step 4: Verify by hand**

Same checks, on `/admin/trash`. Confirm the copy reads "לא ניתן לשחזר" here and nowhere else.

- [ ] **Step 5: Commit**

```bash
git add apps/staff-backoffice/src/pages/Admin/Trash/index.tsx
git commit -m "feat(backoffice): bulk delete for trash"
```

---

## Task 10: E2E coverage

**Files:**
- Create: `tests/e2e/staff/admin-bulk-delete.spec.ts`

**Interfaces:**
- Consumes: the wired UI from Tasks 6 to 9.
- Produces: regression coverage for the four behaviours that unit tests cannot reach.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/staff/admin-bulk-delete.spec.ts`. Follow the login and selector conventions already
used in `tests/e2e/staff/admin-departments.spec.ts` (read it first, and reuse its login helper rather
than writing a new one):

```ts
import { test, expect } from '@playwright/test';

// Reuse the login helper / storageState pattern from admin-departments.spec.ts.

test.describe('admin bulk delete — checklist templates', () => {
  test.beforeEach(async ({ page }) => {
    // log in as admin, then:
    await page.goto('/admin/checklists');
  });

  test('bulk bar is hidden at one selection and shown above one', async ({ page }) => {
    const boxes = page.locator('tbody input[type="checkbox"]:not([disabled])');
    await boxes.nth(0).check();
    await expect(page.getByRole('button', { name: 'מחק נבחרים' })).toBeHidden();
    await boxes.nth(1).check();
    await expect(page.getByRole('button', { name: 'מחק נבחרים' })).toBeVisible();
    await expect(page.getByText('2 נבחרו')).toBeVisible();
  });

  test('a protected row cannot be selected', async ({ page }) => {
    const protectedRow = page.locator('tbody tr', { hasText: 'מערכת' }).first();
    await expect(protectedRow.locator('input[type="checkbox"]')).toBeDisabled();
  });

  test('select-all skips protected rows', async ({ page }) => {
    await page.locator('thead input[type="checkbox"]').check();
    const enabled = await page.locator('tbody input[type="checkbox"]:not([disabled])').count();
    await expect(page.getByText(`${enabled} נבחרו`)).toBeVisible();
  });

  test('bulk delete removes the selected rows and reports the outcome', async ({ page }) => {
    // Create two throwaway templates over the API so the test is self-contained
    // and never deletes seeded data. Unused templates have zero checklist_progress
    // rows, so they hard-delete rather than archive: the expected split is "נמחקו 2".
    // page.request (not the standalone `request` fixture) shares the logged-in
    // browser context's session cookie.
    const names = ['בדיקה-מחיקה-א', 'בדיקה-מחיקה-ב'];
    for (const procedure_type of names) {
      const res = await page.request.post('/api/admin/checklists', {
        data: { procedure_type, items: [] },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
    await page.reload();

    for (const name of names) {
      await page.locator('tbody tr', { hasText: name }).locator('input[type="checkbox"]').check();
    }
    await page.getByRole('button', { name: 'מחק נבחרים' }).click();
    await expect(page.getByText('למחוק 2 תבניות?')).toBeVisible();
    await page.getByRole('button', { name: 'מחק' }).click();

    await expect(page.getByText('נמחקו 2')).toBeVisible();
    for (const name of names) {
      await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
    }
  });
});
```

Use realistic Hebrew names for any test data you create, per project convention — never "PLAYWRIGHT TEST".

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `doppler run -- pnpm exec playwright test tests/e2e/staff/admin-bulk-delete.spec.ts --project=staff-backoffice-desktop`
Expected: FAIL before Tasks 6 to 9 are merged; PASS after. If it fails after, fix the selectors
against the real DOM, not by weakening the assertions.

- [ ] **Step 3: Run the full suite**

Run: `doppler run -- pnpm test`
Expected: PASS, no regressions.

- [ ] **Step 4: Commit and merge**

```bash
git add tests/e2e/staff/admin-bulk-delete.spec.ts
git commit -m "test(backoffice): e2e coverage for admin bulk delete"
git checkout feat/final-figma-redesign
git merge --no-ff feat/admin-batch-delete
```

---

## Verification

Full stack, from cold:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
docker compose up -d
doppler run -- pnpm --filter api db:migrate
doppler run -- pnpm --filter api db:seed
doppler run -- pnpm dev
```

Then, logged in at `http://localhost:5174`, on each of `/admin/checklists`,
`/admin/navigation-routes`, `/admin/form-templates`, `/admin/trash`:

1. Select 2 rows, the bulk bar appears, confirm, the banner reports the split (`נמחקו N, הועברו לארכיון M`).
2. Select exactly 1 row, the bulk bar does **not** appear.
3. Select 3 rows, click one row's own delete: only that row goes, the other 2 stay selected.
4. Select rows, toggle "הצג מאורכבים": the selection prunes and bulk delete never touches hidden rows.
5. A protected row's checkbox is disabled, it shows the "מערכת" badge, and its per-row delete is hidden.
6. `curl -X DELETE` against a protected row's id returns `409 item_protected`.

Automated:

```powershell
doppler run -- pnpm test
```

---

## Addendum (2026-08-10): checkbox-only rule, retroactively enforced

Scope clarification found missing during implementation: "bulk delete" means **only rows the
admin explicitly checked**, everywhere in the back office, no exceptions. A single button that
deletes an entire filtered set (e.g. "every patient in department X") without a per-row checkbox
is not bulk delete under this feature, it is a blast-radius footgun, even if scoped by a filter
and even if the delete is soft/reversible.

This surfaced because `/admin` Queue page (`apps/staff-backoffice/src/pages/Queue/index.tsx`) had
a pre-existing "נקה מחלקה" (clear department) button, added in an earlier, unrelated session
(commit `19aabc9`, predates this plan) that called `POST /admin/trash/bulk-clear` to soft-delete
every non-deleted appointment in whichever department was selected in the filter dropdown, one
click, no per-row selection. It was not part of this plan's 4-table scope, but it violates the
same principle the rest of this feature enforces, so it is now fixed to match: `Queue` gets the
same `useRowSelection` / `BulkActionBar` / `ConfirmDialog` wiring as the four admin tables,
selecting individual patients and bulk-trashing only those via the existing per-row
`softDeleteAppointment` (no new bulk API route, same sequential fan-out pattern). The
`bulk-clear` route and `bulkSoftDeleteByDepartment` service function are deleted outright, not
deprecated, since nothing else called them.

If a future page wants a "select everything visible" convenience, that is exactly what
`toggleAllVisible` / the header checkbox already provide, checked rows, not a standalone
delete-by-filter button.

---

## Deferred: Part 2, the Desktop BO UI/UX audit

Part 2 of the original request (system-wide back-office UI/UX audit plus a standalone HTML document
comparing the current state against 2 to 3 variants per screen, built with the `frontend-design`
skill) runs **next, in its own session, on its own branch** off `feat/final-figma-redesign`, after
this merges. Auditing UI that is about to change wastes the audit.

Note for that session: the highest-value finding is already known from exploration — staff-backoffice
has **no token layer and no primitive component set at all**, only inline `CSSProperties` with
hardcoded hex repeated across files (patient-pwa's `theme.css` is not shared). This feature adds the
first three shared components (`ConfirmDialog`, `BulkActionBar`, plus the `useRowSelection` hook), so
the audit should be framed as extending that seam, not as page-by-page repaints.
