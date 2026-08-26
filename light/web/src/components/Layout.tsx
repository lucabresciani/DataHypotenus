/**
 * Impalcatura dell'applicazione: barra laterale, barra superiore, ricerca
 * globale e bottone di aggiunta rapida sempre a portata di mano.
 * Sotto gli 860px la barra laterale diventa un pannello che scorre da sinistra.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Icon, type IconName } from './Icon.tsx';
import { ItemForm } from './ItemForm.tsx';
import { CommandPalette } from './CommandPalette.tsx';

type NavItem = { to: string; label: string; icon: IconName; badge?: number; tone?: 'alert' };

function useTheme() {
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem('dh.theme');
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  });

  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('dh.theme');
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('dh.theme', theme);
    }
  }, [theme]);

  const isDark =
    theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return { theme, isDark, toggle: () => setTheme(isDark ? 'light' : 'dark') };
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggle } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  // La dashboard alimenta anche i contatori del menu: una sola richiesta.
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 30_000 });

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      // Scorciatoie a tasto singolo, solo fuori dai campi di testo.
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setAddingItem(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totals = dashboard.data?.totals;
  const primaryNav: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: 'dashboard' },
    { to: '/inventario', label: 'Inventario', icon: 'box', badge: totals?.items },
    { to: '/categorie', label: 'Categorie', icon: 'folder', badge: totals?.categories },
    { to: '/posizioni', label: 'Posizioni', icon: 'pin', badge: totals?.locations },
  ];
  const secondaryNav: NavItem[] = [
    { to: '/acquisti', label: 'Acquisti', icon: 'cart', badge: dashboard.data?.to_buy.count },
    {
      to: '/scadenze',
      label: 'Scadenze e garanzie',
      icon: 'clock',
      badge: dashboard.data?.attention_count,
      tone: 'alert',
    },
    { to: '/statistiche', label: 'Statistiche', icon: 'chart' },
    { to: '/impostazioni', label: 'Impostazioni', icon: 'settings' },
  ];

  const renderLink = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <Icon name={item.icon} size={17} />
      <span className="grow truncate">{item.label}</span>
      {item.badge ? <span className={`nav-badge${item.tone === 'alert' ? ' alert' : ''}`}>{item.badge}</span> : null}
    </NavLink>
  );

  return (
    <div className="app">
      {drawerOpen ? <div className="backdrop" onClick={() => setDrawerOpen(false)} /> : null}

      <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
              <path d="M4 19 12 5l8 14z" />
            </svg>
          </span>
          <span className="col" style={{ gap: 0 }}>
            <span className="brand-name">datahypotenus</span>
            <span className="xs faint">il database della casa</span>
          </span>
        </div>

        <nav className="nav" aria-label="Navigazione principale">
          {primaryNav.map(renderLink)}
          <div className="nav-section">Gestione</div>
          {secondaryNav.map(renderLink)}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggle} aria-label="Cambia tema">
            <Icon name={isDark ? 'sun' : 'moon'} size={16} />
            <span>{isDark ? 'Chiaro' : 'Scuro'}</span>
          </button>
          {totals?.trash ? (
            <NavLink to="/cestino" className="btn btn-sm btn-ghost">
              <Icon name="trash" size={15} />
              {totals.trash}
            </NavLink>
          ) : null}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-icon btn-ghost mobile-only"
            onClick={() => setDrawerOpen(true)}
            aria-label="Apri menu"
          >
            <Icon name="menu" size={20} />
          </button>

          <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={16} />
            <span className="grow hide-sm" style={{ textAlign: 'left' }}>
              Cerca oggetti, stanze, categorie...
            </span>
            <kbd className="kbd hide-sm">Ctrl K</kbd>
          </button>

          <button type="button" className="btn btn-primary" onClick={() => setAddingItem(true)}>
            <Icon name="plus" size={16} />
            <span className="hide-sm">Aggiungi oggetto</span>
          </button>
        </header>

        <main>{children}</main>
      </div>

      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(to) => navigate(to)} /> : null}
      {addingItem ? <ItemForm onClose={() => setAddingItem(false)} onSaved={(item) => navigate(`/oggetti/${item.id}`)} /> : null}
    </div>
  );
}
