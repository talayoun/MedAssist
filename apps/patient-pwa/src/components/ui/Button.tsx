import type { ReactNode } from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'large' | 'medium';
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'large',
  children,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}: ButtonProps) {
  const baseStyles = 'font-bold transition-colors duration-150 ease-out';

  const sizeStyles = {
    large: 'h-[64px] px-6 text-[20px] leading-[24px] rounded-xl',
    medium: 'h-[48px] px-5 text-[20px] leading-[24px] rounded-xl',
  };

  const variantStyles = {
    primary: disabled
      ? 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'
      : 'bg-teal text-white hover:bg-teal-hover active:bg-teal-hover',
    secondary: disabled
      ? 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'
      : 'bg-[#E2E8F0] text-[#1E293B] hover:bg-[#F1F5F9] active:bg-[#E2E8F0]',
    destructive: disabled
      ? 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'
      : 'bg-error text-white hover:bg-[#B91C1C] active:bg-[#B91C1C]',
    ghost: disabled
      ? 'bg-transparent text-[#94A3B8] cursor-not-allowed'
      : 'bg-transparent text-teal hover:bg-[#F0FDFA] active:bg-[#CCFBF1]',
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
