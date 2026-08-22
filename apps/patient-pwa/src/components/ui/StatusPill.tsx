import type { ReactNode } from 'react';

interface StatusPillProps {
  status: 'pending' | 'completed' | 'warning' | 'info';
  children: ReactNode;
}

export function StatusPill({ status, children }: StatusPillProps) {
  const statusStyles = {
    pending: 'bg-warning-bg text-warning',
    completed: 'bg-success-bg text-success',
    warning: 'bg-error-bg text-error',
    info: 'bg-[#F0FDFA] text-teal',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-[14px] leading-[20px] font-medium ${statusStyles[status]}`}>
      {children}
    </span>
  );
}
