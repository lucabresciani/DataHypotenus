/**
 * Ricerca globale (Ctrl+K), su cmdk.
 *
 * Cerca in un colpo solo fra oggetti, categorie, posizioni, tag e lista
 * acquisti: chi cerca "cassetto 2" o "Dyson" non deve prima decidere in quale
 * sezione guardare.
 *
 * Il filtro di cmdk e' disattivato: i risultati arrivano gia' ordinati dal
 * server (FTS5 + LIKE sui riferimenti collegati), e rifiltrarli lato client
 * scarterebbe le corrispondenze fatte sul percorso o sul negozio.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { money, plural, quantity } from '@/lib/format.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

type Entry = { key: string; icon: IconName; title: string; subtitle?: string; to: string; group: string };

const SHORTCUTS: Entry[] = [
  { key: 'nav-inv', icon: 'box', title: 'Inventario', to: '/inventario', group: 'Vai a' },
  { key: 'nav-cat', icon: 'folder', title: 'Categorie', to: '/categorie', group: 'Vai a' },
  { key: 'nav-loc', icon: 'pin', title: 'Posizioni', to: '/posizioni', group: 'Vai a' },
  { key: 'nav-shop', icon: 'cart', title: 'Lista acquisti', to: '/acquisti', group: 'Vai a' },
  { key: 'nav-exp', icon: 'clock', title: 'Scadenze e garanzie', to: '/scadenze', group: 'Vai a' },
  { key: 'nav-stats', icon: 'chart', title: 'Statistiche', to: '/statistiche', group: 'Vai a' },
  { key: 'nav-set', icon: 'settings', title: 'Impostazioni', to: '/impostazioni', group: 'Vai a' },
];

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (to: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 160);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const searching = debounced.length >= 2;
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: searching && open,
    staleTime: 15_000,
  });

  const groups = useMemo(() => {
    if (!searching) return [{ name: 'Vai a', entries: SHORTCUTS }];
    const data = results.data;
    if (!data) return [];

    const built: Array<{ name: string; entries: Entry[] }> = [];
    const add = (name: string, entries: Entry[]) => {
      if (entries.length > 0) built.push({ name, entries });
    };

    add(
      `Oggetti${data.items_total > data.items.length ? ` · primi ${data.items.length} di ${data.items_total}` : ''}`,
      data.items.map((item) => ({
        key: `item-${item.id}`,
        icon: 'box' as const,
        title: item.name,
        subtitle: [item.location?.path, quantity(item.quantity, item.unit), money(item.purchase_price, item.currency)]
          .filter((part) => part && part !== '—')
          .join(' · '),
        to: `/oggetti/${item.id}`,
        group: 'Oggetti',
      })),
    );

    add(
      'Posizioni',
      data.locations.map((location) => ({
        key: `loc-${location.id}`,
        icon: (location.kind === 'container' ? 'container' : location.kind === 'room' ? 'room' : 'pin') as IconName,
        title: location.name,
        subtitle: `${location.path} · ${plural(location.item_count, 'oggetto', 'oggetti')}`,
        to: `/posizioni/${location.id}`,
        group: 'Posizioni',
      })),
    );

    add(
      'Categorie',
      data.categories.map((category) => ({
        key: `cat-${category.id}`,
        icon: 'folder' as const,
        title: category.name,
        subtitle: `${category.path} · ${plural(category.item_count, 'oggetto', 'oggetti')}`,
        to: `/inventario?category_id=${category.id}`,
        group: 'Categorie',
      })),
    );

    add(
      'Tag',
      data.tags.map((tag) => ({
        key: `tag-${tag.id}`,
        icon: 'tag' as const,
        title: tag.name,
        to: `/inventario?tag_ids=${tag.id}`,
        group: 'Tag',
      })),
    );

    add(
      'Lista acquisti',
      data.shopping.map((entry) => ({
        key: `shop-${entry.id}`,
        icon: 'cart' as const,
        title: entry.name,
        subtitle: `Priorità ${entry.priority}`,
        to: '/acquisti',
        group: 'Acquisti',
      })),
    );

    return built;
  }, [searching, results.data]);

  const choose = (to: string) => {
    onOpenChange(false);
    onNavigate(to);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ricerca globale"
      description="Cerca fra oggetti, posizioni, categorie, tag e lista acquisti"
      shouldFilter={false}
      className="top-[12vh] translate-y-0 sm:max-w-2xl"
    >
      <CommandInput
        placeholder="Cerca un oggetto, una stanza, una scatola, un tag…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList className="max-h-[min(28rem,60vh)]">
        {searching && results.isLoading ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Ricerca in corso…</div>
        ) : null}
        {searching && !results.isLoading && groups.length === 0 ? (
          <CommandEmpty>Nessun risultato per «{debounced}».</CommandEmpty>
        ) : null}

        {groups.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.entries.map((entry) => (
              <CommandItem key={entry.key} value={entry.key} onSelect={() => choose(entry.to)} className="gap-2.5">
                <Icon name={entry.icon} size={16} className="text-faint" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{entry.title}</span>
                  {entry.subtitle ? <span className="truncate text-xs text-muted-foreground">{entry.subtitle}</span> : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>

      <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Kbd>↑↓</Kbd> naviga
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Invio</Kbd> apri
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> chiudi
        </span>
      </div>
    </CommandDialog>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1.5 py-px font-mono text-2xs text-muted-foreground">
      {children}
    </kbd>
  );
}
