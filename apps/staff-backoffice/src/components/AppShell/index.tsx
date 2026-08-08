import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../main';
import { logout } from '../../services/api';
import logo from '../../assets/medassist-logo.png';

const TEAL = '#0D9488';
const TEAL_SOFT = '#F0FDFA';

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'row-reverse',
    background: '#f4f6f8',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    direction: 'rtl',
  },
  sidebar: {
    width: '256px',
    flexShrink: 0,
    background: '#fff',
    borderInlineStart: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px 20px' },
  logoImg: { height: '30px', objectFit: 'contain' },
  logoSub: { fontSize: '0.75rem', color: '#718096', fontWeight: 600 },
  navGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  navGroupLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '16px 12px 6px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '10px',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#374151',
    textDecoration: 'none',
    minHeight: '44px',
  },
  navLinkActive: { background: TEAL_SOFT, color: TEAL },
  spacer: { flex: 1 },
  userBox: { borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' },
  userName: { fontSize: '0.875rem', fontWeight: 700, color: '#1a202c' },
  userDept: { fontSize: '0.75rem', color: '#718096' },
  logoutBtn: {
    marginTop: '8px',
    minHeight: '40px',
    padding: '8px 12px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    color: '#374151',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  main: { flex: 1, minWidth: 0, overflowY: 'auto' },
};

function linkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return { ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) };
}

export default function AppShell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout().catch(() => {});
    setUser(null);
    navigate('/login', { replace: true });
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logoRow}>
          <img src={logo} alt="MedAssist" style={styles.logoImg} />
          <span style={styles.logoSub}>צוות</span>
        </div>

        <nav style={styles.navGroup}>
          <NavLink to="/queue" style={linkStyle}>
            תור מטופלים
          </NavLink>
        </nav>

        {user?.role === 'admin' && (
          <>
            <div style={styles.navGroupLabel}>ניהול</div>
            <nav style={styles.navGroup}>
              <NavLink to="/admin/checklists" style={linkStyle}>
                תבניות צ׳קליסט
              </NavLink>
              <NavLink to="/admin/navigation-routes" style={linkStyle}>
                מסלולי ניווט
              </NavLink>
              <NavLink to="/admin/form-templates" style={linkStyle}>
                תבניות טפסים
              </NavLink>
              <NavLink to="/admin/departments" style={linkStyle}>
                פרטי הגעה
              </NavLink>
              <NavLink to="/admin/trash" style={linkStyle}>
                פח אשפה
              </NavLink>
            </nav>
          </>
        )}

        <div style={styles.spacer} />

        <div style={styles.userBox}>
          <span style={styles.userName}>{user?.name}</span>
          <span style={styles.userDept}>
            {user?.role === 'admin' ? 'מנהל מערכת' : (user?.department_name ?? 'צוות מחלקה')}
          </span>
          <button type="button" style={styles.logoutBtn} onClick={handleLogout}>
            יציאה
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
