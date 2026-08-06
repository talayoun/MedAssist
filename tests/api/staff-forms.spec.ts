import { test, expect, APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAdmin(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(res.status(), `admin login failed: ${await res.text()}`).toBe(200);
}

async function getFirstAppointmentId(request: APIRequestContext): Promise<string> {
  const appts = await request.get('/api/staff/appointments');
  expect(appts.status()).toBe(200);
  const { appointments } = await appts.json();
  expect(appointments.length).toBeGreaterThan(0);
  return appointments[0].id as string;
}

const createdTemplateIds: string[] = [];

test.afterAll(async ({ request }) => {
  await loginAdmin(request);
  for (const id of [...createdTemplateIds].reverse()) {
    await request.delete(`/api/admin/form-templates/${id}`);
  }
});

test.describe('staff: forms summary', () => {
  test.beforeEach(async ({ request }) => {
    await loginAdmin(request);
  });

  test('GET /api/staff/patients/:id/forms returns items array and export metadata', async ({ request }) => {
    const appointmentId = await getFirstAppointmentId(request);
    const res = await request.get(`/api/staff/patients/${appointmentId}/forms`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.new_since_last_export).toBe('number');
    // latest_export is null or an object with pdf_url, generated_at, item_count
    if (body.latest_export !== null) {
      expect(body.latest_export.pdf_url).toBeTruthy();
      expect(typeof body.latest_export.item_count).toBe('number');
    }
  });

  test('non-existent appointment returns empty items array', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const res = await request.get(`/api/staff/patients/${fakeId}/forms`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get('/api/staff/patients/00000000-0000-0000-0000-000000000001/forms', {
      headers: { cookie: '' },
    });
    expect(res.status()).toBe(401);
  });

  test('staff can upload consent PDF to staff_upload_sign item', async ({ request }) => {
    // Create a template item
    const tplRes = await request.post('/api/admin/form-templates', {
      data: { label: 'הסכמה-בדיקה', item_type: 'staff_upload_sign', required: false, order_index: 98 },
    });
    if (tplRes.status() === 201) createdTemplateIds.push((await tplRes.json()).id);

    const appointmentId = await getFirstAppointmentId(request);

    // Check if there's a staff_upload_sign item to upload to
    const formsRes = await request.get(`/api/staff/patients/${appointmentId}/forms`);
    const { items } = await formsRes.json();
    const signItem = items.find((i: { item_type: string }) => i.item_type === 'staff_upload_sign');
    if (!signItem) { test.skip(); return; }

    // Minimal valid PDF
    const minimalPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n' +
      'xref\n0 4\n0000000000 65535 f\n' +
      '0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n' +
      'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
    );

    const res = await request.post(`/api/staff/patients/${appointmentId}/forms/${signItem.id}/consent`, {
      multipart: { file: { name: 'consent.pdf', mimeType: 'application/pdf', buffer: minimalPdf } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('staff_uploaded');
  });
});
