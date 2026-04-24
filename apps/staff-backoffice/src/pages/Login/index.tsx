import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, ApiError } from '../../services/api';
import { useAuth } from '../../main';

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await login(email, password);
      setUser(user);
      navigate('/queue', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('אימייל או סיסמה שגויים');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('החשבון נעול. נסה שנית מאוחר יותר.');
      } else {
        setError('שגיאת שרת. נסה שנית.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h1 style={styles.title}>Med<span style={styles.titleAccent}>Assist</span> Staff</h1>
          <p style={styles.subtitle}>כניסה לצוות רפואי</p>
        </div>
        <div style={styles.accentBar} />

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            אימייל
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={styles.input}
              placeholder="staff@hospital.com"
              disabled={loading}
            />
          </label>

          <label style={styles.label}>
            סיסמה
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={styles.input}
              placeholder="••••••••••••"
              disabled={loading}
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );

}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#eef2f7',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    direction: 'rtl',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(27,58,107,0.15)',
    width: '100%',
    maxWidth: 420,
  },
  cardHeader: {
    background: '#1b3a6b',
    padding: '32px 40px 28px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.3px',
  },
  titleAccent: {
    color: '#3bc4c4',
  },
  subtitle: {
    margin: '6px 0 0',
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: 400,
  },
  accentBar: {
    height: 3,
    background: 'linear-gradient(to left, #3bc4c4, #2a9b9b)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '32px 40px 36px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    letterSpacing: '0.2px',
  },
  input: {
    padding: '11px 14px',
    borderRadius: 8,
    border: '1.5px solid #d1d5db',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.15s',
    direction: 'ltr',
    color: '#111827',
  },
  error: {
    margin: 0,
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    padding: '13px',
    background: '#3bc4c4',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.15s',
    letterSpacing: '0.3px',
  },
};
