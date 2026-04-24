import type { PoolClient } from 'pg';
import { query, transaction } from '../../db/db';

export interface NavigationRouteRow {
  id: string;
  name: string;
  from_department_id: string | null;
  to_department_id: string;
  is_default: boolean;
  archived: boolean;
  steps_count: number;
  created_at: string;
  updated_at: string;
}

export interface NavigationStepRow {
  id: string;
  route_id: string;
  step_order: number;
  image_url: string;
  instruction_text: string;
  created_at: string;
}

export interface CreateRouteInput {
  name: string;
  from_department_id: string | null;
  to_department_id: string;
  is_default: boolean;
  steps: Array<{ image_url: string; instruction_text: string }>;
}

export interface UpdateRouteInput {
  name?: string;
  from_department_id?: string | null;
  to_department_id?: string;
  is_default?: boolean;
  archived?: boolean;
}

export async function listRoutes(includeArchived = false): Promise<NavigationRouteRow[]> {
  const { rows } = await query<NavigationRouteRow>(
    `SELECT id, name, from_department_id, to_department_id, is_default, archived,
            steps_count, created_at, updated_at
     FROM navigation_routes
     ${includeArchived ? '' : 'WHERE archived = FALSE'}
     ORDER BY to_department_id ASC, is_default DESC, name ASC`
  );
  return rows;
}

export async function getRoute(id: string): Promise<NavigationRouteRow | null> {
  const { rows } = await query<NavigationRouteRow>(
    `SELECT id, name, from_department_id, to_department_id, is_default, archived,
            steps_count, created_at, updated_at
     FROM navigation_routes WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getRouteSteps(routeId: string): Promise<NavigationStepRow[]> {
  const { rows } = await query<NavigationStepRow>(
    `SELECT id, route_id, step_order, image_url, instruction_text, created_at
     FROM route_steps WHERE route_id = $1 ORDER BY step_order ASC`,
    [routeId]
  );
  return rows;
}

/** Unset is_default on any other route sharing the same (from, to) pair. */
async function unsetPeersDefault(
  client: PoolClient,
  routeId: string | null,
  fromDeptId: string | null,
  toDeptId: string
): Promise<void> {
  const fromClause = fromDeptId === null
    ? 'from_department_id IS NULL'
    : 'from_department_id = $2';
  const params: (string | null)[] = fromDeptId === null
    ? [toDeptId]
    : [toDeptId, fromDeptId];
  const excludeClause = routeId ? `AND id <> $${params.length + 1}` : '';
  if (routeId) params.push(routeId);

  await client.query(
    `UPDATE navigation_routes
     SET is_default = FALSE, updated_at = NOW()
     WHERE to_department_id = $1
       AND ${fromClause}
       AND is_default = TRUE
       ${excludeClause}`,
    params
  );
}

export async function createRoute(input: CreateRouteInput): Promise<NavigationRouteRow> {
  return transaction(async (client) => {
    if (input.is_default) {
      await unsetPeersDefault(client, null, input.from_department_id, input.to_department_id);
    }

    const { rows: [routeRow] } = await client.query<NavigationRouteRow>(
      `INSERT INTO navigation_routes
         (name, from_department_id, to_department_id, is_default, archived, steps_count)
       VALUES ($1, $2, $3, $4, FALSE, $5)
       RETURNING id, name, from_department_id, to_department_id, is_default, archived,
                 steps_count, created_at, updated_at`,
      [
        input.name,
        input.from_department_id,
        input.to_department_id,
        input.is_default,
        input.steps.length,
      ]
    );

    for (let i = 0; i < input.steps.length; i++) {
      const step = input.steps[i];
      await client.query(
        `INSERT INTO route_steps (route_id, step_order, image_url, instruction_text)
         VALUES ($1, $2, $3, $4)`,
        [routeRow.id, i + 1, step.image_url, step.instruction_text]
      );
    }

    return routeRow;
  });
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<NavigationRouteRow | null> {
  const existing = await getRoute(id);
  if (!existing) return null;

  const nextName = input.name ?? existing.name;
  const nextFrom = input.from_department_id === undefined ? existing.from_department_id : input.from_department_id;
  const nextTo = input.to_department_id ?? existing.to_department_id;
  const nextIsDefault = input.is_default ?? existing.is_default;
  const nextArchived = input.archived ?? existing.archived;

  return transaction(async (client) => {
    if (nextIsDefault && !nextArchived) {
      await unsetPeersDefault(client, id, nextFrom, nextTo);
    }

    const { rows } = await client.query<NavigationRouteRow>(
      `UPDATE navigation_routes
       SET name = $1,
           from_department_id = $2,
           to_department_id = $3,
           is_default = $4,
           archived = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, from_department_id, to_department_id, is_default, archived,
                 steps_count, created_at, updated_at`,
      [nextName, nextFrom, nextTo, nextIsDefault, nextArchived, id]
    );
    return rows[0] ?? null;
  });
}

export interface DeleteRouteResult {
  deleted: boolean;
  archived?: boolean;
  active_count?: number;
  error?: 'not_found' | 'route_in_active_use';
}

/**
 * "Actively using" = appointments in non-terminal phase that would resolve to
 * this route, via either explicit override OR the default-for-(NULL,to_dept) path.
 */
async function countActiveAppointments(routeId: string): Promise<number> {
  const { rows } = await query<{ active_count: string }>(
    `WITH r AS (
       SELECT id, from_department_id, to_department_id, is_default, archived
       FROM navigation_routes WHERE id = $1
     )
     SELECT COUNT(*)::text AS active_count
     FROM appointments a, r
     WHERE a.current_phase NOT IN ('done', 'expired')
       AND (
         a.navigation_route_id = r.id
         OR (
           a.navigation_route_id IS NULL
           AND r.is_default = TRUE
           AND r.archived = FALSE
           AND r.from_department_id IS NULL
           AND a.department_id = r.to_department_id
         )
       )`,
    [routeId]
  );
  return parseInt(rows[0].active_count, 10);
}

export async function deleteRoute(id: string): Promise<DeleteRouteResult> {
  const existing = await getRoute(id);
  if (!existing) return { deleted: false, error: 'not_found' };

  const activeCount = await countActiveAppointments(id);
  if (activeCount > 0) {
    return { deleted: false, active_count: activeCount, error: 'route_in_active_use' };
  }

  const { rows: historyRows } = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM appointments WHERE navigation_route_id = $1`,
    [id]
  );
  const historyCount = parseInt(historyRows[0].total, 10);

  if (historyCount > 0) {
    await query(
      `UPDATE navigation_routes SET archived = TRUE, is_default = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return { deleted: false, archived: true };
  }

  await query('DELETE FROM navigation_routes WHERE id = $1', [id]);
  return { deleted: true, archived: false };
}

// ─── Step CRUD ────────────────────────────────────────────────────────────────

async function refreshStepsCount(routeId: string): Promise<void> {
  await query(
    `UPDATE navigation_routes
     SET steps_count = (SELECT COUNT(*) FROM route_steps WHERE route_id = $1),
         updated_at = NOW()
     WHERE id = $1`,
    [routeId]
  );
}

export async function addStep(
  routeId: string,
  input: { image_url: string; instruction_text: string }
): Promise<NavigationStepRow | null> {
  const route = await getRoute(routeId);
  if (!route) return null;

  const { rows: maxRows } = await query<{ max_order: number | null }>(
    `SELECT MAX(step_order) AS max_order FROM route_steps WHERE route_id = $1`,
    [routeId]
  );
  const nextOrder = (maxRows[0].max_order ?? 0) + 1;

  if (nextOrder > 20) {
    throw Object.assign(new Error('too_many_steps'), { status: 400 });
  }

  const { rows } = await query<NavigationStepRow>(
    `INSERT INTO route_steps (route_id, step_order, image_url, instruction_text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, route_id, step_order, image_url, instruction_text, created_at`,
    [routeId, nextOrder, input.image_url, input.instruction_text]
  );

  await refreshStepsCount(routeId);
  return rows[0];
}

export async function updateStep(
  routeId: string,
  stepId: string,
  input: { image_url?: string; instruction_text?: string }
): Promise<NavigationStepRow | null> {
  const { rows: existing } = await query<NavigationStepRow>(
    `SELECT id, route_id, step_order, image_url, instruction_text, created_at
     FROM route_steps WHERE id = $1 AND route_id = $2`,
    [stepId, routeId]
  );
  if (!existing[0]) return null;

  const nextUrl = input.image_url ?? existing[0].image_url;
  const nextText = input.instruction_text ?? existing[0].instruction_text;

  const { rows } = await query<NavigationStepRow>(
    `UPDATE route_steps SET image_url = $1, instruction_text = $2
     WHERE id = $3
     RETURNING id, route_id, step_order, image_url, instruction_text, created_at`,
    [nextUrl, nextText, stepId]
  );
  return rows[0];
}

export async function deleteStep(routeId: string, stepId: string): Promise<boolean> {
  return transaction(async (client) => {
    const { rows: stepRows } = await client.query<{ step_order: number }>(
      `SELECT step_order FROM route_steps WHERE id = $1 AND route_id = $2`,
      [stepId, routeId]
    );
    if (!stepRows[0]) return false;
    const removedOrder = stepRows[0].step_order;

    await client.query('DELETE FROM route_steps WHERE id = $1', [stepId]);

    // Repack step_order contiguously using two-phase offset to avoid clashing with
    // the (route_id, step_order) unique constraint mid-update.
    await client.query(
      `UPDATE route_steps SET step_order = step_order + 10000
       WHERE route_id = $1 AND step_order > $2`,
      [routeId, removedOrder]
    );
    await client.query(
      `UPDATE route_steps SET step_order = step_order - 10001
       WHERE route_id = $1 AND step_order > 10000`,
      [routeId]
    );

    await client.query(
      `UPDATE navigation_routes
       SET steps_count = (SELECT COUNT(*) FROM route_steps WHERE route_id = $1),
           updated_at = NOW()
       WHERE id = $1`,
      [routeId]
    );

    return true;
  });
}

export async function reorderSteps(routeId: string, orderedIds: string[]): Promise<boolean> {
  const route = await getRoute(routeId);
  if (!route) return false;

  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM route_steps WHERE route_id = $1`,
    [routeId]
  );
  const existingIds = new Set(existing.map((r) => r.id));
  if (existingIds.size !== orderedIds.length) {
    throw Object.assign(new Error('step_id_set_mismatch'), { status: 400 });
  }
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw Object.assign(new Error('step_id_set_mismatch'), { status: 400 });
    }
  }

  return transaction(async (client) => {
    await client.query(
      `UPDATE route_steps SET step_order = step_order + 10000 WHERE route_id = $1`,
      [routeId]
    );

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE route_steps SET step_order = $1 WHERE id = $2 AND route_id = $3`,
        [i + 1, orderedIds[i], routeId]
      );
    }

    await client.query(
      `UPDATE navigation_routes SET updated_at = NOW() WHERE id = $1`,
      [routeId]
    );

    return true;
  });
}
