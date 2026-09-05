module.exports = {
  apps: [
    {
      name: 'api',
      cwd: 'apps/api',
      script: 'pnpm',
      args: 'run start:prod',
    },
    {
      name: 'notifications-worker',
      cwd: 'apps/api',
      script: 'pnpm',
      args: 'run worker',
    },
    {
      name: 'patient-pwa',
      cwd: 'apps/patient-pwa',
      script: 'pnpm',
      args: 'exec vite preview --host 0.0.0.0 --port 5173',
    },
    {
      name: 'staff-backoffice',
      cwd: 'apps/staff-backoffice',
      script: 'pnpm',
      args: 'exec vite preview --host 0.0.0.0 --port 5174',
    },
  ],
};
