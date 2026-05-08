import { query } from '../../db/db';
import { advanceAppointmentPhase } from '../appointments/phase.service';

export interface NavigationStepResponse {
  step_id: string;
  order: number;
  image_url: string;
  instruction: string;
  is_current: boolean;
}

export interface NavigationRouteResponse {
  route_id: string;
  route_name: string;
  total_steps: number;
  current_step: number;
  parking_coordinates: { lat: number; lng: number } | null;
  steps: NavigationStepResponse[];
  completed?: boolean;
}

export interface StepConfirmResult {
  next_step?: NavigationStepResponse;
  total_steps?: number;
  current_step?: number;
  phase?: 'waiting';
  message?: string;
}

interface RouteRow {
  route_id: string;
  route_name: string;
  steps_count: number;
  dept_lat: number | null;
  dept_lng: number | null;
}

interface StepRow {
  id: string;
  step_order: number;
  image_url: string;
  instruction_text: string;
}

/** Get the current and next step for this appointment's navigation route */
export async function getNavigation(appointmentId: string): Promise<NavigationRouteResponse> {
  // Resolve route for this appointment:
  //   1. Per-appointment override (a.navigation_route_id) if set.
  //   2. Else the default route to this department from the main entrance
  //      (from_department_id IS NULL, is_default = TRUE, not archived).
  const { rows: [routeRow] } = await query<RouteRow>(`
    SELECT nr.id AS route_id, nr.name AS route_name, nr.steps_count,
           NULL::float AS dept_lat, NULL::float AS dept_lng
    FROM appointments a
    JOIN navigation_routes nr
      ON nr.id = COALESCE(
           a.navigation_route_id,
           (
             SELECT dr.id FROM navigation_routes dr
             WHERE dr.to_department_id = a.department_id
               AND dr.from_department_id IS NULL
               AND dr.is_default = TRUE
               AND dr.archived = FALSE
             LIMIT 1
           )
         )
    WHERE a.id = $1
  `, [appointmentId]);

  if (!routeRow) {
    throw Object.assign(new Error('route_not_found'), { status: 404 });
  }

  // Determine current step from WaitingQueue or default to 1
  // (Navigation progress tracked via appointment status / separate approach: use a simple column)
  // For MVP: current_step stored in a transient way — check if waiting_queue exists (arrived = done)
  const { rows: queueRows } = await query<{ arrival_time: Date }>(
    'SELECT arrival_time FROM waiting_queue WHERE appointment_id = $1',
    [appointmentId]
  );

  // Patient already in waiting queue — return full route for review (read-only, no confirm)
  if (queueRows.length > 0) {
    const { rows: allSteps } = await query<StepRow>(`
      SELECT id, step_order, image_url, instruction_text
      FROM route_steps
      WHERE route_id = $1
      ORDER BY step_order ASC
    `, [routeRow.route_id]);

    const responseSteps: NavigationStepResponse[] = allSteps.map(s => ({
      step_id: s.id,
      order: s.step_order,
      image_url: s.image_url,
      instruction: s.instruction_text,
      is_current: s.step_order === routeRow.steps_count,
    }));

    return {
      route_id: routeRow.route_id,
      route_name: routeRow.route_name,
      total_steps: routeRow.steps_count,
      current_step: routeRow.steps_count,
      parking_coordinates: null,
      steps: responseSteps,
      completed: true,
    };
  }

  const currentStepOrder = await getCurrentStepOrder(appointmentId);

  await advanceAppointmentPhase(appointmentId, 'navigation');

  // Fetch current + next step only (not full route)
  const { rows: steps } = await query<StepRow>(`
    SELECT id, step_order, image_url, instruction_text
    FROM route_steps
    WHERE route_id = $1 AND step_order >= $2
    ORDER BY step_order ASC
    LIMIT 2
  `, [routeRow.route_id, currentStepOrder]);

  const responseSteps: NavigationStepResponse[] = steps.map((s, idx) => ({
    step_id: s.id,
    order: s.step_order,
    image_url: s.image_url,
    instruction: s.instruction_text,
    is_current: idx === 0,
  }));

  return {
    route_id: routeRow.route_id,
    route_name: routeRow.route_name,
    total_steps: routeRow.steps_count,
    current_step: currentStepOrder,
    parking_coordinates: null, // populated when dept has coordinates
    steps: responseSteps,
  };
}

/** Confirm arrival at a step; advance to next or transition to waiting */
export async function confirmStep(
  appointmentId: string,
  stepId: string
): Promise<StepConfirmResult> {
  // Verify step belongs to this appointment's route
  // Step must belong to the appointment's resolved route (override or dept default).
  const { rows: [stepRow] } = await query<{
    step_order: number;
    route_id: string;
    route_steps_count: number;
  }>(`
    SELECT rs.step_order, rs.route_id, nr.steps_count AS route_steps_count
    FROM route_steps rs
    JOIN navigation_routes nr ON nr.id = rs.route_id
    JOIN appointments a ON a.id = $2
    WHERE rs.id = $1
      AND nr.id = COALESCE(
        a.navigation_route_id,
        (
          SELECT dr.id FROM navigation_routes dr
          WHERE dr.to_department_id = a.department_id
            AND dr.from_department_id IS NULL
            AND dr.is_default = TRUE
            AND dr.archived = FALSE
          LIMIT 1
        )
      )
  `, [stepId, appointmentId]);

  if (!stepRow) {
    throw Object.assign(new Error('step_not_found'), { status: 404 });
  }

  const nextStepOrder = stepRow.step_order + 1;

  // Record progress
  await recordNavProgress(appointmentId, nextStepOrder);

  // Last step confirmed → transition to waiting
  if (stepRow.step_order >= stepRow.route_steps_count) {
    // Create waiting queue entry
    await query(`
      INSERT INTO waiting_queue (appointment_id, department_id, arrival_time, status)
      SELECT a.id, a.department_id, NOW(), 'waiting'
      FROM appointments a WHERE a.id = $1
      ON CONFLICT (appointment_id) DO NOTHING
    `, [appointmentId]);

    await query(
      "UPDATE appointments SET status = 'active', updated_at = NOW() WHERE id = $1",
      [appointmentId]
    );

    await advanceAppointmentPhase(appointmentId, 'waiting');

    return { phase: 'waiting', message: 'הגעת! הצוות יודע שאתה כאן.' };
  }

  // Fetch next step
  const { rows: [next] } = await query<StepRow>(`
    SELECT id, step_order, image_url, instruction_text
    FROM route_steps
    WHERE route_id = $1 AND step_order = $2
  `, [stepRow.route_id, nextStepOrder]);

  return {
    next_step: {
      step_id: next.id,
      order: next.step_order,
      image_url: next.image_url,
      instruction: next.instruction_text,
      is_current: true,
    },
    total_steps: stepRow.route_steps_count,
    current_step: nextStepOrder,
  };
}

// ─── Nav progress helpers (stored in a simple approach via appointments.updated_at metadata) ──

async function getCurrentStepOrder(appointmentId: string): Promise<number> {
  // Use a dedicated nav_progress table approach via appointments table notes field
  // For MVP: check if there's a nav_step_progress record in the DB
  const { rows } = await query<{ current_step: number }>(
    `SELECT current_step FROM nav_progress WHERE appointment_id = $1`,
    [appointmentId]
  );
  return rows[0]?.current_step ?? 1;
}

async function recordNavProgress(appointmentId: string, nextStep: number): Promise<void> {
  await query(`
    INSERT INTO nav_progress (appointment_id, current_step)
    VALUES ($1, $2)
    ON CONFLICT (appointment_id) DO UPDATE SET current_step = $2
  `, [appointmentId, nextStep]);
}
