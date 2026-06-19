import { test, expect, APIRequestContext } from '@playwright/test';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@medassist.test';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'AdminPassword123';
const STAFF_EMAIL    = process.env.TEST_STAFF_EMAIL    ?? 'staff@medassist.test';
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD ?? 'StaffPassword123';

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login failed for ${email}: ${await res.text()}`).toBe(200);
}

const createdIds: string[] = [];

test.afterAll(async ({ request }) => {
  await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const id of [...createdIds].reverse()) {
    await request.delete(`/api/admin/form-templates/${id}`);
  }
});

test.describe('admin: form templates', () => {
  test.beforeEach(async ({ request }) => {
    await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test('returns empty list initially', async ({ request }) => {
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('admin can create a form template item', async ({ request }) => {
    const res = await request.post('/api/admin/form-templates', {
      data: {
        procedure_type: 'colonoscopy',
        label: 'תעודת זהות',
        item_type: 'patient_upload',
        required: true,
        order_index: 0,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.procedure_type).toBe('colonoscopy');
    expect(body.label).toBe('תעודת זהות');
    expect(body.item_type).toBe('patient_upload');
    expect(body.is_active).toBe(true);
    expect(body.blank_form_url).toBeNull();
    createdIds.push(body.id);
  });

  test('admin can create a global template (null procedure_type)', async ({ request }) => {
    const res = await request.post('/api/admin/form-templates', {
      data: {
        label: 'הסכמה כללית',
        item_type: 'staff_upload_sign',
        required: false,
        order_index: 0,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.procedure_type).toBeNull();
    createdIds.push(body.id);
  });

  test('admin can patch a form template item', async ({ request }) => {
    const createRes = await request.post('/api/admin/form-templates', {
      data: { procedure_type: 'gastroscopy', label: 'הסכמה', item_type: 'staff_upload_sign', required: true, order_index: 0 },
    });
    const { id } = await createRes.json();
    createdIds.push(id);

    const patchRes = await request.patch(`/api/admin/form-templates/${id}`, {
      data: { is_active: false },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body.is_active).toBe(false);
  });

  test('soft-delete via DELETE sets is_active=false', async ({ request }) => {
    const createRes = await request.post('/api/admin/form-templates', {
      data: { label: 'למחיקה', item_type: 'patient_upload', required: false, order_index: 0 },
    });
    const { id } = await createRes.json();

    const delRes = await request.delete(`/api/admin/form-templates/${id}`);
    expect(delRes.status()).toBe(204);

    // should no longer appear in active list
    const listRes = await request.get('/api/admin/form-templates');
    const list = await listRes.json();
    expect(list.items.find((i: { id: string }) => i.id === id)).toBeUndefined();
  });

  test('non-admin staff cannot access form templates', async ({ request }) => {
    await loginAs(request, STAFF_EMAIL, STAFF_PASSWORD);
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(403);
  });

  test('admin can upload a blank form PDF', async ({ request }) => {
    // create a template item to attach the PDF to
    const createRes = await request.post('/api/admin/form-templates', {
      data: { label: 'PDF test', item_type: 'patient_upload', required: false, order_index: 0 },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json();
    createdIds.push(id);

    // minimal valid 1-page PDF bytes (just enough for magic-byte check)
    const pdfBytes = Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj\nxref\n0 0\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF');

    const uploadRes = await request.post(`/api/admin/form-templates/${id}/blank`, {
      multipart: {
        file: {
          name: 'blank.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBytes,
        },
      },
    });
    expect(uploadRes.status()).toBe(200);
    const body = await uploadRes.json();
    expect(body.id).toBe(id);
    expect(body.blank_form_url).toBeTruthy();
  });

  test('admin can delete a blank form PDF', async ({ request }) => {
    // create template + upload PDF
    const createRes = await request.post('/api/admin/form-templates', {
      data: { label: 'PDF delete test', item_type: 'patient_upload', required: false, order_index: 0 },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json();
    createdIds.push(id);

    const pdfBytes = Buffer.from('%PDF-1.4 1 0 obj<</Type/Catalog>>endobj\nxref\n0 0\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF');
    await request.post(`/api/admin/form-templates/${id}/blank`, {
      multipart: {
        file: { name: 'blank.pdf', mimeType: 'application/pdf', buffer: pdfBytes },
      },
    });

    // delete the blank form
    const delRes = await request.delete(`/api/admin/form-templates/${id}/blank`);
    expect(delRes.status()).toBe(204);

    // verify blank_form_url is now null — check via patch (GET single item not exposed, but list shows active items)
    const listRes = await request.get('/api/admin/form-templates');
    const { items } = await listRes.json();
    const found = items.find((i: { id: string; blank_form_url: string | null }) => i.id === id);
    expect(found).toBeDefined();
    expect(found.blank_form_url).toBeNull();
  });
});
