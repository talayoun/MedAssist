import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * API contract test for POST /api/staff/appointments (elective onboarding).
 *
 * Prerequisites (developer must run before invoking these tests):
 *   docker compose up -d
 *   pnpm --filter api db:migrate
 *   pnpm --filter api db:seed
 *   pnpm --filter api dev
 *
 * The seeded admin account is used so the request can target any department.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAsAdmin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function getSeededDepartmentId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/staff/departments');
  expect(res.status()).toBe(200);
  const body = await res.json();
  const dept = body.departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'expected seeded department קרדיולוגיה to exist').toBeTruthy();
  return dept.id;
}

test.describe('POST /api/staff/appointments', () => {
  test.beforeEach(async ({ request }) => {
    await loginAsAdmin(request);
  });

  test('creates elective appointment and queues magic link when send_now=true', async ({ request }) => {
    const departmentId = await getSeededDepartmentId(request);
    const phone = `+97252${Date.now().toString().slice(-7)}`;
    const visitAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'Playwright Test Patient',
        phone_number: phone,
        department_id: departmentId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: visitAt,
        custom_items: [
          { text: 'הביא מכתב הפניה', category: 'bring', time_sensitive: false },
        ],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });

    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.appointment_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.patient_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.sms_status).toBe('queued_now');
    expect(body.magic_link_token).toMatch(/^[0-9a-f-]{36}$/);

    // Magic link should resolve to the checklist phase with the custom item present
    const visitRes = await request.get(`/api/visit/${body.magic_link_token}`);
    expect(visitRes.status()).toBe(200);
    const visit = await visitRes.json();
    expect(visit.track).toBe('elective');
    expect(visit.phase).toBe('checklist');

    const checklistRes = await request.get(`/api/visit/${body.magic_link_token}/checklist`);
    expect(checklistRes.status()).toBe(200);
    const checklist = await checklistRes.json();
    const customItem = checklist.items.find((i: { text: string }) => i.text === 'הביא מכתב הפניה');
    expect(customItem, 'custom item should be visible to patient').toBeTruthy();
    expect(customItem.source).toBe('custom');
  });

  test('suppresses a template item for one appointment without affecting the template', async ({ request }) => {
    const departmentId = await getSeededDepartmentId(request);
    const phone = `+97253${Date.now().toString().slice(-7)}`;

    // First, create a baseline appointment to discover template item IDs
    const baselineRes = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'Baseline Patient',
        phone_number: phone,
        department_id: departmentId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(baselineRes.status()).toBe(201);
    const baseline = await baselineRes.json();
    const baselineChecklist = await (await request.get(`/api/visit/${baseline.magic_link_token}/checklist`)).json();
    const firstTemplateItem = baselineChecklist.items.find((i: { source: string }) => i.source === 'template');
    expect(firstTemplateItem, 'template must have items').toBeTruthy();

    // Create a second appointment that suppresses that item
    const phone2 = `+97254${Date.now().toString().slice(-7)}`;
    const suppressedRes = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'Suppressed Patient',
        phone_number: phone2,
        department_id: departmentId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [firstTemplateItem.id],
        send_now: true,
      },
    });
    expect(suppressedRes.status()).toBe(201);
    const suppressed = await suppressedRes.json();
    const suppressedChecklist = await (await request.get(`/api/visit/${suppressed.magic_link_token}/checklist`)).json();
    const stillPresent = suppressedChecklist.items.some((i: { id: string }) => i.id === firstTemplateItem.id);
    expect(stillPresent, 'suppressed item must not appear in this appointment').toBe(false);

    // Baseline appointment must still see the suppressed item
    const baselineAgain = await (await request.get(`/api/visit/${baseline.magic_link_token}/checklist`)).json();
    const baselineStillHasIt = baselineAgain.items.some((i: { id: string }) => i.id === firstTemplateItem.id);
    expect(baselineStillHasIt, 'other appointments must be unaffected').toBe(true);
  });

  test('rejects phone not in E.164', async ({ request }) => {
    const departmentId = await getSeededDepartmentId(request);
    const res = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'Bad Phone',
        phone_number: '0501234567',
        department_id: departmentId,
        procedure_type: 'pre-op-cardiac',
        visit_datetime: new Date(Date.now() + 86400000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects unknown procedure_type', async ({ request }) => {
    const departmentId = await getSeededDepartmentId(request);
    const res = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'Unknown Proc',
        phone_number: `+97255${Date.now().toString().slice(-7)}`,
        department_id: departmentId,
        procedure_type: 'nonexistent-procedure',
        visit_datetime: new Date(Date.now() + 86400000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(res.status()).toBe(400);
  });
});
