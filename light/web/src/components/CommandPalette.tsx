/**
 * Ricerca globale (Ctrl+K).
 *
 * Cerca in un colpo solo fra oggetti, categorie, posizioni, tag e lista
 * acquisti: chi cerca "cassetto 2" o "Dyson" non deve prima decidere in quale
 * sezione guardare. Tutto si guida da tastiera.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { Icon, type IconName } from './Icon.tsx';
import { money, plural, quantity } from '../lib/format.ts';

type Entry = { key: string; icon: IconName; title: string; subtitle?: string; to: string; group: string };

export function CommandPalette({ onClose, onNavigate }: { onClose: () => void; onNavigate: (to: string) => void }) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 160);
    return () => clearTimeout(timer);
  }, [term]);

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });

  const shortcuts: Entry[] = useMemo(
    () => [
      { key: 'nav-inv', icon: 'box', title: 'Inventario', to: '/inventario', group: 'Vai a' },
      { key: 'nav-cat', icon: 'folder', title: 'Categorie', to: '/categorie', group: 'Vai a' },
      { key: 'nav-loc', icon: 'pin', title: 'Posizioni', to: '/posizioni', group: 'Vai a' },
      { key: 'nav-shop', icon: 'cart', title: 'Lista acquisti', to: '/acquisti', group: 'Vai a' },
      { key: 'nav-exp', icon: 'clock', title: 'Scadenze e garanzie', to: '/scadenze', group: 'Vai a' },
      { key: 'nav-stats', icon: 'chart', title: 'Statistiche', to: '/statistiche', group: 'Vai a' },
      { key: 'nav-set', icon: 'settings', title: 'Impostazioni', to: '/impostazioni', group: 'Vai a' },
    ],
    [],
  );

  const entries: Entry[] = useMemo(() => {
    if (debounced.length < 2) {
      return shortcuts;
    }
    const data = results.data;
    if (!data) return [];

    const items: Entry[] = data.items.map((item) => ({
      key: `item-${item.id}`,
      icon: 'box',
      title: item.name,
      subtitle: [item.location?.path, quantity(item.quantity, item.unit), money(item.purchase_price, item.currency)]
        .filter((part) => part && part !== '—')
        .join(' · '),
      to: `/oggetti/${item.id}`,
      group: `Oggetti${data.items_total > data.items.length ? ` (${data.items_total})` : ''}`,
    }));

    const locations: Entry[] = data.locations.map((location) => ({
      key: `loc-${location.id}`,
      icon: location.kind === 'container' ? 'container' : location.kind === 'room' ? 'room' : 'pin',
      title: location.name,
      subtitle: `${location.path} · ${plural(location.item_count, 'oggetto', 'oggetti')}`,
      to: `/posizioni/${location.id}`,
      group: 'Posizioni',
    }));

    const categories: Entry[] = data.categories.map((category) => ({
      key: `cat-${category.id}`,
      icon: 'folder',
      title: category.name,
      subtitle: `${category.path} · ${plural(category.item_count, 'oggetto', 'oggetti')}`,
      to: `/inventario?category_id=${category.id}`,
      group: 'Categorie',
    }));

    const tags: Entry[] = data.tags.map((tag) => ({
      key: `tag-${tag.id}`,
      icon: 'tag',
      title: tag.name,
      to: `/inventario?tag_ids=${tag.id}`,
      group: 'Tag',
    }));

    const shopping: Entry[] = data.shopping.map((entry) => ({
      key: `shop-${entry.id}`,
      icon: 'cart',
      title: entry.name,
      subtitle: `Lista acquisti · ${entry.priority}`,
      to: '/acquisti',
      group: 'Acquisti',
    }));

    return [...items, ...locations, ...categories, ...tags, ...shopping];
  }, [debounced, results.data, shortcuts]);

  useEffect(() => setCursor(0), [debounced, results.data]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onNavigate(entry.to);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(entries[cursor]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  let lastGroup = '';

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ricerca globale">
        <input
          className="input palette-input"
          placeholder="Cerca un oggetto, una stanza, una scatola, un tag..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          aria-label="Testo da cercare"
        />

        <div className="palette-results" ref={listRef}>
          {debounced.length >= 2 && results.isLoading ? <p className="muted small" style={{ padding: 12 }}>Ricerca in corso...</p> : null}
          {debounced.length >= 2 && !results.isLoading && entries.length === 0 ? (
            <p className="muted small" style={{ padding: 12 }}>
              Nessun risultato per "{debounced}".
            </p>
          ) : null}

          {entries.map((entry, index) => {
            const showGroup = entry.group !== lastGroup;
            lastGroup = entry.group;
            return (
              <div key={entry.key}>
                {showGroup ? <div className="palette-group-title">{entry.group}</div> : null}
                <button
                  type="button"
                  className="palette-item"
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => choose(entry)}
                >
                  <Icon name={entry.icon} size={16} />
                  <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                    <span className="truncate">{entry.title}</span>
                    {entry.subtitle ? <span className="xs muted truncate">{entry.subtitle}</span> : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', gap: 14 }}>
          <span className="xs muted row" style={{ gap: 5 }}>
            <kbd className="kbd">↑↓</kbd> naviga
          </span>
          <span className="xs muted row" style={{ gap: 5 }}>
            <kbd className="kbd">Invio</kbd> apri
          </span>
          <span className="xs muted row" style={{ gap: 5 }}>
            <kbd className="kbd">Esc</kbd> chiudi
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
