export function OfflineBanner() {
  return (
    <div className="w-full bg-warning-bg border-b border-warning py-3 px-4 sticky top-0 z-50">
      <div className="flex items-center justify-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="text-[14px] leading-[20px] font-medium text-warning">
          אין חיבור - מציג מידע שמור
        </span>
      </div>
    </div>
  );
}
