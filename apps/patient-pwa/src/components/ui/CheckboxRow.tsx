interface CheckboxRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxRow({ label, description, checked, onChange }: CheckboxRowProps) {
  return (
    <div
      className={`flex gap-4 flex-row-reverse cursor-pointer ${description ? 'items-start' : 'items-center'}`}
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <div className="flex-1">
        <div className="text-right">
          <div className={`text-[18px] leading-[26px] font-semibold text-text ${checked ? 'line-through' : ''}`}>
            {label}
          </div>
          {description && (
            <div className={`text-[16px] leading-[24px] text-text-muted mt-1 ${checked ? 'line-through' : ''}`}>
              {description}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0">
        <div
          className={`w-[44px] h-[44px] rounded-lg flex items-center justify-center transition-colors duration-150 border-2 ${
            checked ? 'bg-teal border-teal' : 'bg-white border-border hover:border-teal'
          }`}
        >
          {checked && (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
