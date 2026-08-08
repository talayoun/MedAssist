import type { ReactNode } from 'react';

interface CardProps {
  variant?: 'default' | 'warning' | 'success' | 'error';
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ variant = 'default', children, className = '', onClick }: CardProps) {
  const variantStyles = {
    default: 'bg-white',
    warning: 'bg-warning-bg border-r-4 border-warning',
    success: 'bg-success-bg border-r-4 border-success',
    error: 'bg-error-bg border-r-4 border-error',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${variantStyles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
