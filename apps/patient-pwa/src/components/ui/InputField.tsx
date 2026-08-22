interface InputFieldProps {
  label: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}

export function InputField({ label, placeholder, error, helperText, value, onChange, onBlur }: InputFieldProps) {
  return (
    <div className="w-full">
      <label className="block text-[16px] leading-[24px] text-[#1E293B] mb-2 font-medium text-right">
        {label}
      </label>
      <input
        type="text"
        dir="rtl"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        className={`w-full h-[52px] px-4 text-[16px] leading-[24px] text-[#1E293B] text-right bg-white rounded-lg transition-colors duration-150 placeholder:text-[#94A3B8] ${
          error
            ? 'border-2 border-error focus:outline-none focus:border-error'
            : 'border border-border focus:outline-none focus:border-teal focus:border-2'
        }`}
      />
      {error && <div className="mt-2 text-[14px] leading-[20px] font-medium text-error text-right">{error}</div>}
      {helperText && !error && (
        <div className="mt-2 text-[14px] leading-[20px] font-medium text-text-muted text-right">{helperText}</div>
      )}
    </div>
  );
}
