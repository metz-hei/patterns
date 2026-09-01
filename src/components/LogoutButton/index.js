import React from 'react';
import styles from './styles.module.css';

export default function LogoutButton() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) {
          if (!cancelled) setVisible(false);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setVisible(Boolean(data.authenticated));
        }
      } catch (e) {
        if (!cancelled) setVisible(false);
      }
    }
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {method: 'POST', credentials: 'include'});
    } catch (e) {}
    window.location.href = '/login.html';
  }

  return (
    <button
      className={styles.logoutButton}
      onClick={handleLogout}
      aria-label="Выйти"
      title="Выйти"
      type="button"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16,17 21,12 16,7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    </button>
  );
}
