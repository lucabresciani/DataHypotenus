/**
 * L'impalcatura: rail di sinistra, barra di ricerca in alto, contenuto.
 *
 * Il rail e' un foglio piu' scuro/piu' chiaro del contenuto separato da un
 * filetto, non una scatola con ombra: la gerarchia la fa il tono, non
 * l'elevazione. Sotto gli 860px diventa un pannello che scorre da sinistra.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { ItemForm } from '@/components/ItemForm.tsx';
import { CommandPalette } from '@/components/CommandPalette.tsx';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

type NavItem = { to: string; label: string; icon: IconName; badge?: number; tone?: 'alert' };

function BrandMark() {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
      aria-hidden
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M4 19 12 5l8 14z" />
      </svg>
    </span>
  );
}

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-base transition-colors duration-150',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
          isActive
            ? 'bg-sidebar-accent font-medium text-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} size={17} className={isActive ? 'text-primary' : 'text-faint group-hover:text-muted-foreground'} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span
              className={cn(
                'rounded-full px-1.5 py-px font-mono text-2xs tabular-nums',
                item.tone === 'alert' ? 'bg-warn-soft text-warn' : 'bg-secondary text-muted-foreground',
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
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
      const typing = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
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
    { to: '/scadenze', label: 'Scadenze e garanzie', icon: 'clock', badge: dashboard.data?.attention_count, tone: 'alert' },
    { to: '/statistiche', label: 'Statistiche', icon: 'chart' },
    { to: '/impostazioni', label: 'Impostazioni', icon: 'settings' },
  ];

  const rail = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <BrandMark />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-base font-semibold tracking-[-0.01em]">datahypotenus</span>
          <span className="truncate text-2xs text-faint">il database della casa</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3" aria-label="Navigazione principale">
        {primaryNav.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
        <div className="px-2.5 pt-4 pb-1 text-2xs font-medium tracking-[0.04em] text-faint uppercase">Gestione</div>
        {secondaryNav.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="flex items-center gap-1 border-t border-sidebar-border px-2.5 py-2.5">
        <Button variant="ghost" size="sm" onClick={toggle} aria-label={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}>
          <Icon name={isDark ? 'sun' : 'moon'} size={15} />
          {isDark ? 'Chiaro' : 'Scuro'}
        </Button>
        {totals?.trash ? (
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <NavLink to="/cestino" onClick={onNavigate}>
              <Icon name="trash" size={15} />
              <span className="font-mono tabular-nums">{totals.trash}</span>
            </NavLink>
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border bg-sidebar md:block" data-print-hide>
        {rail()}
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[17rem] bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigazione</SheetTitle>
          {rail(() => setDrawerOpen(false))}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-8"
          data-print-hide
        >
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawerOpen(true)} aria-label="Apri il menu">
            <Icon name="menu" size={19} />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'flex h-[2.125rem] max-w-md flex-1 items-center gap-2 rounded-md border border-input bg-background px-2.5',
              'text-base text-faint transition-colors duration-150 outline-none',
              'hover:border-border-strong hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
            )}
          >
            <Icon name="search" size={16} />
            <span className="hidden flex-1 text-left sm:block">Cerca oggetti, stanze, categorie…</span>
            <kbd className="ml-auto hidden rounded border border-border bg-secondary px-1.5 py-px font-mono text-2xs text-muted-foreground sm:block">
              Ctrl&nbsp;K
            </kbd>
          </button>

          <Button variant="default" className="ml-auto" onClick={() => setAddingItem(true)}>
            <Icon name="plus" size={16} />
            <span className="hidden sm:inline">Aggiungi oggetto</span>
          </Button>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={(to) => navigate(to)} />
      {addingItem ? <ItemForm onClose={() => setAddingItem(false)} onSaved={(item) => navigate(`/oggetti/${item.id}`)} /> : null}
    </div>
  );
}
