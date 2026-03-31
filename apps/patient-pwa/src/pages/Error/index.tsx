import React from 'react';
import { useParams } from 'react-router-dom';

const errorMessages: Record<string, { title: string; body: string }> = {
  link_expired: {
    title: 'הקישור פג תוקף',
    body: 'הקישור שקיבלת כבר לא בתוקף. פנה לצוות המחלקה לקבלת קישור חדש.',
  },
  link_used: {
    title: 'הקישור כבר נפתח',
    body: 'הקישור הזה כבר שומש. אם אתה זקוק לגישה מחדש, פנה לצוות המחלקה.',
  },
  not_found: {
    title: 'הקישור לא נמצא',
    body: 'לא מצאנו את הקישור הזה. ודא שהעתקת את הקישור המלא מהסמס.',
  },
  server_error: {
    title: 'שגיאה זמנית',
    body: 'אירעה שגיאה זמנית. נסה שנית בעוד מספר דקות. אם הבעיה נמשכת, פנה לצוות המחלקה.',
  },
};

const styles: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '24px',
  textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

export default function ErrorPage() {
  const { type } = useParams<{ type: string }>();
  const content = (type ? errorMessages[type] : undefined) ?? errorMessages.not_found;

  return (
    <div style={styles}>
      <div style={{ maxWidth: '400px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px', color: '#1a1a1a' }}>
          {content.title}
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#555', lineHeight: 1.6 }}>{content.body}</p>
      </div>
    </div>
  );
}
