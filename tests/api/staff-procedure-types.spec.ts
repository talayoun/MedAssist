import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * The procedure a patient is booked for must be a real one.
 *
 * It used to be free text in the back office, with a suggestion list that did
 * not match the seeded templates. The modal now picks from this endpoint.
 *
 * E4 claimed a typo could leave a patient with a checklist that does not exist,
 * reaching them as a raw 500. Two guards already prevent that and this file pins
 * both: creating an appointment rejects a procedure with no template, and a
 * template in use by an active appointment cannot be deleted. The null check
 * added alongside these tests is defence behind those guards, not a live hole.
 */

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL ?? 'staff@medassist.test';
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? 'StaffPassword123';

async function login(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
}

test.describe('GET /api/staff/procedure-types', () => {
  test('rejects an unauthenticated request', async ({ playwright, baseURL }) => {
    // A fresh context, so no session cookie from another test leaks in.
    const anon = await playwright.request.newContext({ baseURL });
    const res = await anon.get('/api/staff/procedure-types');
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test('lists the seeded procedures for non-admin staff', async ({ request }) => {
    // The demo is driven by a department staff account, not an admin, so this
    // must not be behind the admin gate the way /api/admin/checklists is.
    await login(request, STAFF_EMAIL, STAFF_PASSWORD);

    const res = await request.get('/api/staff/procedure-types');
    expect(res.status()).toBe(200);

    const { procedures } = await res.json();
    expect(Array.isArray(procedures)).toBe(true);

    const slugs = procedures.map((p: { procedure_type: string }) => p.procedure_type);
    expect(slugs).toContain('cataract-surgery');
    expect(slugs).toContain('pre-op-cardiac');

    for (const p of procedures) {
      expect(typeof p.procedure_type).toBe('string');
      expect(typeof p.item_count).toBe('number');
    }
  });
});

test.describe('E4: a patient can never be left without a checklist', () => {
  test('an appointment cannot be created for a procedure with no template', async ({ request }) => {
    await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const { departments } = await (await request.get('/api/staff/departments')).json();
    const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
    expect(dept, 'seeded department must exist').toBeTruthy();

    const res = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'ישראל ישראלי',
        phone_number: `+97250${Date.now().toString().slice(-7)}`,
        department_id: dept.id,
        procedure_type: 'no-such-procedure',
        visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('a template in use by an active appointment cannot be deleted out from under it', async ({ request }) => {
    await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const { departments } = await (await request.get('/api/staff/departments')).json();
    const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');

    const procedure = `e4-pin-${Date.now()}`;
    const tmplRes = await request.post('/api/admin/checklists', {
      data: { procedure_type: procedure, items: [{ text: 'פריט בדיקה', category: 'other', time_sensitive: false }] },
    });
    expect(tmplRes.status(), 'create template').toBe(201);
    const templateId = (await tmplRes.json()).template_id;

    const apptRes = await request.post('/api/staff/appointments', {
      data: {
        patient_name: 'רחל כהן',
        phone_number: `+97250${Date.now().toString().slice(-7)}`,
        department_id: dept.id,
        procedure_type: procedure,
        visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        custom_items: [],
        suppressed_template_item_ids: [],
        send_now: true,
      },
    });
    expect(apptRes.status(), 'create appointment').toBe(201);
    const token = (await apptRes.json()).magic_link_token;

    const delRes = await request.delete(`/api/admin/checklists/${templateId}`);
    expect(delRes.status()).toBe(409);
    expect((await delRes.json()).error).toBe('template_in_active_use');

    // And the patient's checklist still works.
    const progress = await request.post(`/api/visit/${token}/checklist/progress`, {
      data: { completed_item_ids: [] },
    });
    expect(progress.status()).toBe(200);
  });
});
