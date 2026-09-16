'use client';
import { useEffect, useState } from 'react';
import { BriefcaseMedical, Moon, Sun } from 'lucide-react';
import { useAuth } from './auth';
import { AppLink, useNavigation } from './navigation';
export function Header() {
  const { identity, logout, pending } = useAuth();
  const navigation = useNavigation();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    try {
      const setting = localStorage.getItem('medapp-partner-theme');
      const next = setting
        ? setting === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDark(next);
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
    } catch {
      /* Theme preference is optional. */
    }
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('medapp-partner-theme', next ? 'dark' : 'light');
    } catch {
      /* Theme still changes without storage. */
    }
  }
  return (
    <header className="site-header">
      <AppLink href="/" className="brand">
        <BriefcaseMedical size={38} strokeWidth={1.8} aria-hidden="true" />
        <span>MedApp Partner</span>
      </AppLink>
      <nav aria-label="Main navigation">
        <AppLink href="/">Applications</AppLink>
        {identity?.returnAvailable && (
          <AppLink href="/return-to-app">Return to MedApp</AppLink>
        )}
        <button
          className="theme-button"
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggle}
        >
          {dark ? <Moon /> : <Sun />}
        </button>
        {identity ? (
          <button
            className="text-button"
            disabled={pending}
            onClick={() =>
              navigation.ask(() => {
                void logout();
              })
            }
          >
            Sign out
          </button>
        ) : (
          <AppLink href="/">Sign in</AppLink>
        )}
      </nav>
    </header>
  );
}
