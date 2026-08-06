import React from 'react';
import logo from '../../assets/medassist-logo.png';

const TEAL = '#0D9488';

const styles = {
  header: {
    background: TEAL,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  } as React.CSSProperties,
  logoBadge: {
    background: '#fff',
    borderRadius: '10px',
    padding: '6px 12px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  } as React.CSSProperties,
  logo: { height: '26px', objectFit: 'contain', display: 'block' } as React.CSSProperties,
};

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header style={styles.header}>
      <span style={styles.logoBadge}>
        <img src={logo} alt="MedAssist" style={styles.logo} />
      </span>
      {children}
    </header>
  );
}
