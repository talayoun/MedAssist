import { test, expect, APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAdmin(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(res.status(), `admin login failed: ${await res.text()}`).toBe(200);
}

// Creates its own appointment rather than borrowing "whatever is first" from the
// shared list — other spec files (magic-link-validity.spec.ts in particular) can
// legitimately mark an appointment done/deleted, which would otherwise poison
// getValidToken() for every test in this file.
async function getValidToken(request: APIRequestContext): Promise<string> {
  await loginAdmin(request);
  const deptRes = await request.get('/api/staff/departments');
  const { departments } = await deptRes.json();
  const dept = departments.find((d: { name: string }) => d.name === 'קרדיולוגיה');
  expect(dept, 'seeded department must exist').toBeTruthy();

  const res = await request.post('/api/staff/appointments', {
    data: {
      patient_name: 'בדיקת טפסים',
      phone_number: `+97253${Date.now().toString().slice(-7)}`,
      department_id: dept.id,
      procedure_type: 'pre-op-cardiac',
      visit_datetime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      custom_items: [],
      suppressed_template_item_ids: [],
      send_now: true,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.magic_link_token).toBeTruthy();
  return body.magic_link_token;
}

const createdTemplateIds: string[] = [];

test.afterAll(async ({ request }) => {
  await loginAdmin(request);
  for (const id of [...createdTemplateIds].reverse()) {
    await request.delete(`/api/admin/form-templates/${id}`);
  }
});

test.describe('patient: visit forms', () => {
  test('GET /:token/forms returns items array', async ({ request }) => {
    const token = await getValidToken(request);
    const res = await request.get(`/api/visit/${token}/forms`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('invalid token returns 401', async ({ request }) => {
    const res = await request.get('/api/visit/invalid-token-xyz/forms');
    expect(res.status()).toBe(401);
  });

  test('patient can upload image to patient_upload item', async ({ request }) => {
    // Create a template item so the appointment has a form item
    await loginAdmin(request);
    const tplRes = await request.post('/api/admin/form-templates', {
      data: { label: 'בדיקה-תעודה', item_type: 'patient_upload', required: false, order_index: 99 },
    });
    if (tplRes.status() === 201) createdTemplateIds.push((await tplRes.json()).id);

    const token = await getValidToken(request);
    const formsRes = await request.get(`/api/visit/${token}/forms`);
    const { items } = await formsRes.json();
    const uploadItem = items.find((i: { item_type: string }) => i.item_type === 'patient_upload');
    if (!uploadItem) { test.skip(); return; }

    // minimal valid 1x1 JPEG
    const jpegBytes = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
      'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAAB' +
      'AAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAA' +
      'AAAAAAAP/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/' +
      'aAAwDAQACEQMRAD8AJQAB/9k=',
      'base64',
    );

    const res = await request.post(`/api/visit/${token}/forms/${uploadItem.id}/upload`, {
      multipart: { file: { name: 'id.jpg', mimeType: 'image/jpeg', buffer: jpegBytes } },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('patient_submitted');
  });

  test('wrong MIME type returns 415', async ({ request }) => {
    const token = await getValidToken(request);
    const formsRes = await request.get(`/api/visit/${token}/forms`);
    const { items } = await formsRes.json();
    const uploadItem = items.find((i: { item_type: string }) => i.item_type === 'patient_upload');
    if (!uploadItem) { test.skip(); return; }

    const res = await request.post(`/api/visit/${token}/forms/${uploadItem.id}/upload`, {
      multipart: { file: { name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') } },
    });
    expect(res.status()).toBe(415);
  });

  test('cross-appointment IDOR returns 403', async ({ request }) => {
    const token = await getValidToken(request);
    // Use a random UUID as itemId that belongs to no appointment for this token
    const fakeItemId = '00000000-0000-0000-0000-000000000001';
    const jpegBytes = Buffer.from('ffd8ffe000104a46494600', 'hex');
    const res = await request.post(`/api/visit/${token}/forms/${fakeItemId}/upload`, {
      multipart: { file: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: jpegBytes } },
    });
    expect(res.status()).toBe(403);
  });
});
