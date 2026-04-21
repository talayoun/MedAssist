import { defineConfig } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const PATIENT_PWA_URL = process.env.PATIENT_PWA_URL ?? 'http://localhost:5173';
const STAFF_APP_URL = process.env.STAFF_APP_URL ?? 'http://localhost:5174';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: API_URL },
    },
    {
      name: 'staff-backoffice-desktop',
      testDir: './tests/e2e/staff',
      use: {
        baseURL: STAFF_APP_URL,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'patient-pwa-mobile',
      testDir: './tests/e2e/patient',
      use: {
        baseURL: PATIENT_PWA_URL,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        locale: 'he-IL',
      },
    },
  ],
});
