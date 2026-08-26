/**
 * Inventario: la pagina dove si passa piu' tempo.
 *
 * I filtri vivono nella query string, non nello stato del componente: un
 * elenco filtrato e' un indirizzo condivisibile e sopravvive al ricaricamento
 * della pagina (e i collegamenti dalla dashboard funzionano da soli).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';

import { api, type BulkPayload } from '@/lib/api.ts';
import type { Item, ItemFilters } from '@/lib/types.ts';
import { money, plural } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon.tsx';
import { ItemRow } from '@/components/ItemRow.tsx';
import { ItemForm } from '@/components/ItemForm.tsx';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingRows, Page, PageHeader, toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SORTS = [
  { value: 'updated_at', label: 'Ultima modifica' },
  { value: 'created_at', label: 'Data inserimento' },
  { value: 'name', label: 'Nome' },
  { value: 'purchase_price', label: 'Prezzo' },
  { value: 'purchase_date', label: 'Data acquisto' },
  { value: 'quantity', label: 'Quantità' },
  { value: 'category', label: 'Categoria' },
  { value: 'location', label: 'Posizione' },
];

const TOGGLES = [
  { key: 'below_min', label: 'Sotto scorta' },
  { key: 'is_consumable', label: 'Solo consumabili' },
  { key: 'has_attachments', label: 'Con documenti' },
  { key: 'no_location', label: 'Senza posizione' },
];

const FILTER_KEYS = [
  'category_id',
  'location_id',
  'status_ids',
  'tag_ids',
  'brand',
  'price_min',
  'price_max',
  'below_min',
  'is_consumable',
  'has_attachments',
  'warranty',
  'no_location',
];

const PAGE_SIZE = 50;
const ALL = '__tutti__';

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [term, setTerm] = useState(() => params.get('q') ?? '');
  const [newTags, setNewTags] = useState('');
  const firstRender = useRef(true);
  const reduceMotion = useReducedMotion();

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations });
  const statuses = useQuery({ queryKey: ['statuses'], queryFn: api.statuses });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags });

  const filters = useMemo<ItemFilters>(() => {
    const get = (key: string) => params.get(key) ?? undefined;
    const numberOf = (key: string) => (params.get(key) ? Number(params.get(key)) : undefined);
    const listOf = (key: string) =>
      params.get(key) ? params.get(key)!.split(',').map(Number).filter(Number.isFinite) : undefined;

    return {
      q: get('q'),
      category_id: numberOf('category_id'),
      location_id: numberOf('location_id'),
      status_ids: listOf('status_ids'),
      tag_ids: listOf('tag_ids'),
      brand: get('brand'),
      price_min: numberOf('price_min'),
      price_max: numberOf('price_max'),
      below_min: params.get('below_min') === '1' || undefined,
      is_consumable: params.get('is_consumable') === '1' || undefined,
      has_attachments: params.get('has_attachments') === '1' || undefined,
      warranty: (get('warranty') as ItemFilters['warranty']) ?? undefined,
      no_location: params.get('no_location') === '1' || undefined,
      sort: get('sort') ?? 'updated_at',
      direction: (get('direction') as 'asc' | 'desc') ?? 'desc',
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
  }, [params, page]);

  const items = useQuery({
    queryKey: ['items', filters],
    queryFn: () => api.items(filters),
    placeholderData: keepPreviousData,
  });

  const setFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value === undefined || value === '' || value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setPage(0);
    setSelection(new Set());
  };

  // La ricerca scrive nell'indirizzo con un piccolo ritardo: si digita senza
  // che l'elenco tremi a ogni lettera.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => setFilter('q', term.trim() || undefined), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const activeFilterCount = FILTER_KEYS.filter((key) => params.get(key)).length;
  const clearAll = () => {
    setParams(new URLSearchParams(), { replace: true });
    setTerm('');
  };

  const bulk = useMutation({
    mutationFn: (action: BulkPayload) => api.bulk([...selection], action),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(plural(result.affected, 'oggetto aggiornato', 'oggetti aggiornati'));
      setSelection(new Set());
    },
    onError: (error) => toast.fail(error, 'Azione multipla non riuscita'),
  });

  const list = items.data?.items ?? [];
  const total = items.data?.total ?? 0;
  const allSelected = list.length > 0 && list.every((item) => selection.has(item.id));

  const toggleSelect = (id: number, selected: boolean) => {
    setSelection((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Page className="pb-24">
      <PageHeader
        title="Inventario"
        description={
          <>
            {items.isLoading ? 'Caricamento…' : plural(total, 'oggetto', 'oggetti')}
            {items.data && items.data.total_value > 0 ? ` · ${money(items.data.total_value)} di valore` : ''}
          </>
        }
      />

      {/* --- Ricerca e filtri --------------------------------------------- */}
      <div className="-mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Icon name="search" size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <Input
              className="pl-8"
              placeholder="Filtra per nome, marca, seriale…"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              aria-label="Filtra gli oggetti"
            />
          </div>

          <Button
            variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'outline'}
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className={cn(activeFilterCount > 0 && 'border-primary-soft-border text-primary-ink')}
          >
            <Icon name="filter" size={14} />
            Filtri
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary-soft px-1.5 font-mono text-2xs text-primary-ink">{activeFilterCount}</span>
            ) : null}
          </Button>

          <Select value={filters.sort} onValueChange={(value) => setFilter('sort', value)}>
            <SelectTrigger className="w-[11.5rem]" aria-label="Ordina per">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((sort) => (
                <SelectItem key={sort.value} value={sort.value}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setFilter('direction', filters.direction === 'asc' ? 'desc' : 'asc')}
            aria-label={filters.direction === 'asc' ? 'Ordine crescente, passa a decrescente' : 'Ordine decrescente, passa a crescente'}
          >
            <Icon
              name="chevron"
              size={15}
              className={cn('transition-transform duration-200', filters.direction === 'asc' ? '-rotate-90' : 'rotate-90')}
            />
          </Button>

          {activeFilterCount > 0 || params.get('q') ? (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Icon name="close" size={14} /> Azzera
            </Button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="rounded-lg border border-border bg-surface">
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Categoria">
                <Select value={params.get('category_id') ?? ALL} onValueChange={(value) => setFilter('category_id', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tutte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tutte</SelectItem>
                    {(categories.data?.categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Posizione">
                <Select value={params.get('location_id') ?? ALL} onValueChange={(value) => setFilter('location_id', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tutte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tutte</SelectItem>
                    {(locations.data?.locations ?? []).map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Stato">
                <Select value={params.get('status_ids') ?? ALL} onValueChange={(value) => setFilter('status_ids', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tutti</SelectItem>
                    {(statuses.data?.statuses ?? []).map((status) => (
                      <SelectItem key={status.id} value={String(status.id)}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tag">
                <Select value={params.get('tag_ids') ?? ALL} onValueChange={(value) => setFilter('tag_ids', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tutti</SelectItem>
                    {(tags.data?.tags ?? []).map((tag) => (
                      <SelectItem key={tag.id} value={String(tag.id)}>
                        {tag.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Marca">
                <Input
                  defaultValue={params.get('brand') ?? ''}
                  onBlur={(event) => setFilter('brand', event.target.value || undefined)}
                  placeholder="Es. Bosch"
                />
              </Field>

              <Field label="Prezzo minimo">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  defaultValue={params.get('price_min') ?? ''}
                  onBlur={(event) => setFilter('price_min', event.target.value || undefined)}
                />
              </Field>

              <Field label="Prezzo massimo">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  defaultValue={params.get('price_max') ?? ''}
                  onBlur={(event) => setFilter('price_max', event.target.value || undefined)}
                />
              </Field>

              <Field label="Garanzia">
                <Select value={params.get('warranty') ?? ALL} onValueChange={(value) => setFilter('warranty', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Indifferente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Indifferente</SelectItem>
                    <SelectItem value="active">Attiva</SelectItem>
                    <SelectItem value="expiring">In scadenza</SelectItem>
                    <SelectItem value="expired">Scaduta</SelectItem>
                    <SelectItem value="none">Senza garanzia</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              {TOGGLES.map((toggle) => {
                const on = params.get(toggle.key) === '1';
                return (
                  <Button
                    key={toggle.key}
                    variant={on ? 'default' : 'outline'}
                    size="sm"
                    aria-pressed={on}
                    onClick={() => setFilter(toggle.key, on ? undefined : '1')}
                  >
                    {on ? <Icon name="check" size={13} /> : null}
                    {toggle.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* --- Elenco -------------------------------------------------------- */}
      {items.error ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => setSelection(checked ? new Set(list.map((item) => item.id)) : new Set())}
                aria-label="Seleziona tutti gli oggetti visibili"
              />
              {selection.size > 0 ? plural(selection.size, 'selezionato', 'selezionati') : 'Seleziona'}
            </label>
            {total > 0 ? (
              <span className="text-sm text-muted-foreground tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} di {total}
              </span>
            ) : null}
          </div>

          {items.isLoading ? (
            <LoadingRows rows={8} height={54} className="pt-2" />
          ) : list.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nessun oggetto corrisponde ai filtri"
              description="Prova ad allargare la ricerca, oppure azzera i filtri per vedere tutto l’inventario."
              action={
                activeFilterCount > 0 || params.get('q') ? (
                  <Button variant="outline" onClick={clearAll}>
                    Azzera i filtri
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {list.map((item) => (
                <ItemRow key={item.id} item={item} selected={selection.has(item.id)} onSelect={toggleSelect} onEdit={setEditing} />
              ))}
            </div>
          )}

          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                Precedenti
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Pagina {page + 1} di {Math.ceil(total / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Successivi
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* --- Azioni multiple ------------------------------------------------
          Compare dal basso quando la selezione esiste: l'entrata dice da dove
          arriva, e chiudendola torna da dove e' venuta. */}
      {selection.size > 0 ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 shadow-[var(--shadow-float)]"
          role="region"
          aria-label="Azioni sugli oggetti selezionati"
        >
          <strong className="px-1 text-sm">{plural(selection.size, 'selezionato', 'selezionati')}</strong>

          <Select value="" onValueChange={(value) => bulk.mutate({ action: 'move', location_id: Number(value) })}>
            <SelectTrigger size="sm" className="w-[10.5rem]" aria-label="Sposta gli oggetti selezionati">
              <SelectValue placeholder="Sposta in…" />
            </SelectTrigger>
            <SelectContent>
              {(locations.data?.locations ?? []).map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value="" onValueChange={(value) => bulk.mutate({ action: 'status', status_id: Number(value) })}>
            <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Cambia stato agli oggetti selezionati">
              <SelectValue placeholder="Stato…" />
            </SelectTrigger>
            <SelectContent>
              {(statuses.data?.statuses ?? []).map((status) => (
                <SelectItem key={status.id} value={String(status.id)}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="tag" size={14} /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-72">
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const list = newTags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  if (list.length > 0) bulk.mutate({ action: 'add_tags', tags: list });
                  setNewTags('');
                }}
              >
                <Field label="Tag da aggiungere" hint="Separati da virgola. Quelli nuovi vengono creati.">
                  <Input value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="fragile, trasloco" autoFocus />
                </Field>
                <Button type="submit" disabled={!newTags.trim()}>
                  Applica
                </Button>
              </form>
            </PopoverContent>
          </Popover>

          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} /> Cestino
          </Button>

          <Button variant="ghost" size="icon-sm" onClick={() => setSelection(new Set())} aria-label="Annulla la selezione">
            <Icon name="close" size={15} />
          </Button>
        </motion.div>
      ) : null}

      {editing ? <ItemForm item={editing} onClose={() => setEditing(null)} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Spostare nel cestino?"
          message={
            selection.size === 1
              ? 'L’oggetto va nel cestino. Potrai ripristinarlo in qualsiasi momento.'
              : `${selection.size} oggetti vanno nel cestino. Potrai ripristinarli in qualsiasi momento.`
          }
          confirmLabel="Sposta nel cestino"
          destructive
          onConfirm={() => bulk.mutateAsync({ action: 'delete' })}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </Page>
  );
}
