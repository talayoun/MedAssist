import { useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';

const errorMessages: Record<string, { title: string; body: string; tone: 'warning' | 'error' }> = {
  link_expired: {
    title: 'הקישור פג תוקף',
    body: 'הקישור שקיבלת כבר לא בתוקף. פנה לצוות המחלקה לקבלת קישור חדש.',
    tone: 'warning',
  },
  link_used: {
    title: 'הקישור כבר נפתח',
    body: 'הקישור הזה כבר שומש. אם אתה זקוק לגישה מחדש, פנה לצוות המחלקה.',
    tone: 'warning',
  },
  not_found: {
    title: 'הקישור לא נמצא',
    body: 'לא מצאנו את הקישור הזה. ודא שהעתקת את הקישור המלא מהסמס.',
    tone: 'error',
  },
  server_error: {
    title: 'שגיאה זמנית',
    body: 'אירעה שגיאה זמנית. נסה שנית בעוד מספר דקות. אם הבעיה נמשכת, פנה לצוות המחלקה.',
    tone: 'error',
  },
};

export default function ErrorPage() {
  const { type } = useParams<{ type: string }>();
  const content = (type ? errorMessages[type] : undefined) ?? errorMessages.not_found;
  const isWarning = content.tone === 'warning';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-bg">
      <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${isWarning ? 'bg-warning-bg' : 'bg-error-bg'}`}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={isWarning ? '#D97706' : '#DC2626'} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <Card className="text-center max-w-[400px]">
        <h1 className="text-[28px] leading-9 font-bold text-text mb-3">{content.title}</h1>
        <p className="text-lg leading-7 text-text-muted">{content.body}</p>
      </Card>
    </div>
  );
}
