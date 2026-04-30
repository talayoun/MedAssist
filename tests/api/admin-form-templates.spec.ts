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
    expect(Array.isArray(body)).toBe(true);
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
    expect(list.find((i: { id: string }) => i.id === id)).toBeUndefined();
  });

  test('non-admin staff cannot access form templates', async ({ request }) => {
    await loginAs(request, STAFF_EMAIL, STAFF_PASSWORD);
    const res = await request.get('/api/admin/form-templates');
    expect(res.status()).toBe(403);
  });
});
