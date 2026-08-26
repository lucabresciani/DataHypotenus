import { useEffect, useState } from 'react';

/**
 * Tema dell'applicazione.
 *
 * Regola unica: `<html data-theme>` contiene SEMPRE il tema risolto ("light"
 * oppure "dark"), anche quando la preferenza e' "automatico". Lo scrive lo
 * script in `index.html` prima del primo paint, e da li' in poi questo modulo.
 * Cosi' CSS, componenti e libreria delle notifiche guardano un posto solo.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'dh.theme';

export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === 'auto' ? systemTheme() : preference;
}

function apply(preference: ThemePreference): ResolvedTheme {
  const resolved = resolve(preference);
  document.documentElement.dataset.theme = resolved;
  try {
    if (preference === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Navigazione privata: il tema vale per questa sessione e basta.
  }
  return resolved;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readPreference()));

  useEffect(() => {
    setResolved(apply(preference));
    if (preference !== 'auto') return;

    // In automatico si segue il sistema anche mentre l'app e' aperta.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('auto'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return {
    preference,
    resolved,
    isDark: resolved === 'dark',
    set: setPreference,
    toggle: () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
  };
}

/** Solo lettura, per chi deve sapere in che tema sta disegnando. */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(
    () => (document.documentElement.dataset.theme as ResolvedTheme | undefined) ?? 'light',
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme((document.documentElement.dataset.theme as ResolvedTheme | undefined) ?? 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
