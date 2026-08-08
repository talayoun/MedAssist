interface CheckboxRowProps {
  label: string;
  description?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Detect date/time mentions in Hebrew or numbers, to offer a "add to calendar" shortcut.
const DATE_TIME_RE = /\d{1,2}[:/]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|בתאריך|בשעה|עד מחר|ב-\d{1,2}:\d{2}/;

function exportToCalendar(label: string, description: string | undefined | null) {
  const fullText = `${label} ${description || ''}`;
  const dateMatch = fullText.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  const timeMatch = fullText.match(/(\d{1,2}):(\d{2})/);

  let calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(label)}`;
  if (description) {
    calendarUrl += `&details=${encodeURIComponent(description)}`;
  }

  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const year = dateMatch[3];
    const hour = timeMatch ? timeMatch[1].padStart(2, '0') : '09';
    const minute = timeMatch ? timeMatch[2] : '00';
    const startDateTime = `${year}${month}${day}T${hour}${minute}00`;
    const endHour = timeMatch ? String(parseInt(timeMatch[1], 10) + 1).padStart(2, '0') : '10';
    const endDateTime = `${year}${month}${day}T${endHour}${minute}00`;
    calendarUrl += `&dates=${startDateTime}/${endDateTime}`;
  }

  window.open(calendarUrl, '_blank');
}

export function CheckboxRow({ label, description, checked, onChange }: CheckboxRowProps) {
  const hasDateTime = DATE_TIME_RE.test(`${label} ${description || ''}`);

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
      {hasDateTime && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            exportToCalendar(label, description);
          }}
          title="ייצא ליומן Google"
          className="flex-shrink-0 w-[44px] h-[44px] flex items-center justify-center rounded-lg text-teal hover:bg-[#F0FDFA] transition-colors duration-150"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      )}

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
