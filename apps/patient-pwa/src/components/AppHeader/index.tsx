import React from 'react';
import logo from '../../assets/medassist-logo.png';

const styles = {
  header: {
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  } as React.CSSProperties,
  logo: { height: '36px', objectFit: 'contain' } as React.CSSProperties,
};

export default function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header style={styles.header}>
      <img src={logo} alt="MedAssist" style={styles.logo} />
      {children}
    </header>
  );
}
