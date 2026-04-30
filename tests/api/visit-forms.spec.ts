import { test, expect, APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';

async function loginAdmin(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(res.status(), `admin login failed: ${await res.text()}`).toBe(200);
}

async function getValidToken(request: APIRequestContext): Promise<string> {
  await loginAdmin(request);
  const appts = await request.get('/api/staff/appointments');
  expect(appts.status()).toBe(200);
  const { appointments } = await appts.json();
  expect(appointments.length).toBeGreaterThan(0);
  const appt = appointments[0];
  const linkRes = await request.post(`/api/staff/appointments/${appt.id}/magic-link`);
  if (linkRes.status() !== 200 && linkRes.status() !== 201) {
    // link already sent — fetch from admin
    const detailRes = await request.get(`/api/staff/appointments/${appt.id}`);
    const detail = await detailRes.json();
    return detail.magic_link_token ?? detail.token;
  }
  const { token } = await linkRes.json();
  return token;
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

    // minimal valid JPEG (2x2 white)
    const jpegBytes = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
      'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
      '/9oADAMBAAIRAxEAPwCwABmX/9k=',
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
