import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, ApiError } from '../../services/api';
import { useAuth } from '../../main';
import logo from '../../assets/medassist-logo.png';

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
        <img src={logo} alt="MedAssist" style={styles.logo} />
        <p style={styles.subtitle}>כניסה לצוות רפואי</p>

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
    background: 'linear-gradient(160deg, #F0FDFA 0%, #f4f6f8 60%)',
    fontFamily: 'system-ui, sans-serif',
    direction: 'rtl',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '40px 48px',
    boxShadow: '0 12px 32px rgba(15,23,42,0.10)',
    border: '1px solid #e2e8f0',
    width: '100%',
    maxWidth: 400,
  },
  logo: {
    display: 'block',
    height: 34,
    margin: '0 auto',
    objectFit: 'contain',
  },
  subtitle: {
    margin: '12px 0 28px',
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 15,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    padding: '10px 14px',
    minHeight: 44,
    borderRadius: 8,
    border: '1.5px solid #d1d5db',
    fontSize: 15,
    outline: 'none',
    transition: 'border-color 0.15s',
    direction: 'ltr',
    boxSizing: 'border-box',
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
    marginTop: 8,
    minHeight: 44,
    padding: '12px',
    background: '#0D9488',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};
