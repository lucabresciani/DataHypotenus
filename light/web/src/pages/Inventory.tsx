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
import { api, type BulkPayload } from '../lib/api.ts';
import type { Item, ItemFilters } from '../lib/types.ts';
import { money, plural } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { ItemRow } from '../components/ItemRow.tsx';
import { ItemForm } from '../components/ItemForm.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Skeleton, useToast } from '../components/ui.tsx';

const SORTS: Array<{ value: string; label: string }> = [
  { value: 'updated_at', label: 'Ultima modifica' },
  { value: 'created_at', label: 'Data inserimento' },
  { value: 'name', label: 'Nome' },
  { value: 'purchase_price', label: 'Prezzo' },
  { value: 'purchase_date', label: 'Data acquisto' },
  { value: 'quantity', label: 'Quantità' },
  { value: 'category', label: 'Categoria' },
  { value: 'location', label: 'Posizione' },
];

const PAGE_SIZE = 50;

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [term, setTerm] = useState(() => params.get('q') ?? '');
  const firstRender = useRef(true);

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations });
  const statuses = useQuery({ queryKey: ['statuses'], queryFn: api.statuses });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags });

  const filters = useMemo<ItemFilters>(() => {
    const get = (key: string) => params.get(key) ?? undefined;
    const numberOf = (key: string) => (params.get(key) ? Number(params.get(key)) : undefined);
    const listOf = (key: string) =>
      params.get(key)
        ? params
            .get(key)!
            .split(',')
            .map(Number)
            .filter(Number.isFinite)
        : undefined;

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
    if (value === undefined || value === '') next.delete(key);
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

  const activeFilterCount = ['category_id', 'location_id', 'status_ids', 'tag_ids', 'brand', 'price_min', 'price_max', 'below_min', 'is_consumable', 'has_attachments', 'warranty', 'no_location'].filter(
    (key) => params.get(key),
  ).length;

  const bulk = useMutation({
    mutationFn: (action: BulkPayload) => api.bulk([...selection], action),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(`${plural(result.affected, 'oggetto aggiornato', 'oggetti aggiornati')}`);
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
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Inventario</h1>
          <p className="muted">
            {items.isLoading ? 'Caricamento…' : plural(total, 'oggetto', 'oggetti')}
            {items.data && items.data.total_value > 0 ? ` · ${money(items.data.total_value)} di valore` : ''}
          </p>
        </div>
      </header>

      {/* --- Ricerca e filtri --------------------------------------------- */}
      <div className="col" style={{ gap: 'var(--space-3)' }}>
        <div className="filter-bar">
          <div className="row grow" style={{ maxWidth: 420, position: 'relative' }}>
            <Icon name="search" size={15} className="faint" style={{ position: 'absolute', left: 10 }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Filtra per nome, marca, seriale..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Filtra gli oggetti"
            />
          </div>

          <button
            type="button"
            className={`chip${showFilters || activeFilterCount > 0 ? ' active' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            <Icon name="filter" size={13} />
            Filtri
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          <select className="select" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Ordina per">
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setFilter('direction', filters.direction === 'asc' ? 'desc' : 'asc')}
            aria-label={filters.direction === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
            title={filters.direction === 'asc' ? 'Crescente' : 'Decrescente'}
          >
            <Icon name="chevron" size={15} style={{ transform: filters.direction === 'asc' ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
          </button>

          {activeFilterCount > 0 ? (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              <Icon name="close" size={14} /> Azzera filtri
            </button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="panel">
            <div className="panel-body form-grid">
              <label className="field">
                <span className="label">Categoria</span>
                <select className="select" value={params.get('category_id') ?? ''} onChange={(e) => setFilter('category_id', e.target.value)}>
                  <option value="">Tutte</option>
                  {(categories.data?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.path}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Posizione</span>
                <select className="select" value={params.get('location_id') ?? ''} onChange={(e) => setFilter('location_id', e.target.value)}>
                  <option value="">Tutte</option>
                  {(locations.data?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Stato</span>
                <select className="select" value={params.get('status_ids') ?? ''} onChange={(e) => setFilter('status_ids', e.target.value)}>
                  <option value="">Tutti</option>
                  {(statuses.data?.statuses ?? []).map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Tag</span>
                <select className="select" value={params.get('tag_ids') ?? ''} onChange={(e) => setFilter('tag_ids', e.target.value)}>
                  <option value="">Tutti</option>
                  {(tags.data?.tags ?? []).map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name} ({tag.item_count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Marca</span>
                <input className="input" defaultValue={params.get('brand') ?? ''} onBlur={(e) => setFilter('brand', e.target.value || undefined)} />
              </label>

              <label className="field">
                <span className="label">Prezzo minimo</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  defaultValue={params.get('price_min') ?? ''}
                  onBlur={(e) => setFilter('price_min', e.target.value || undefined)}
                />
              </label>

              <label className="field">
                <span className="label">Prezzo massimo</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  defaultValue={params.get('price_max') ?? ''}
                  onBlur={(e) => setFilter('price_max', e.target.value || undefined)}
                />
              </label>

              <label className="field">
                <span className="label">Garanzia</span>
                <select className="select" value={params.get('warranty') ?? ''} onChange={(e) => setFilter('warranty', e.target.value)}>
                  <option value="">Indifferente</option>
                  <option value="active">Attiva</option>
                  <option value="expiring">In scadenza</option>
                  <option value="expired">Scaduta</option>
                  <option value="none">Senza garanzia</option>
                </select>
              </label>
            </div>

            <div className="panel-body row wrap" style={{ borderTop: '1px solid var(--border)', gap: 'var(--space-2)' }}>
              {[
                { key: 'below_min', label: 'Sotto scorta' },
                { key: 'is_consumable', label: 'Solo consumabili' },
                { key: 'has_attachments', label: 'Con documenti' },
                { key: 'no_location', label: 'Senza posizione' },
              ].map((toggle) => (
                <button
                  key={toggle.key}
                  type="button"
                  className={`chip${params.get(toggle.key) === '1' ? ' active' : ''}`}
                  onClick={() => setFilter(toggle.key, params.get(toggle.key) === '1' ? undefined : '1')}
                >
                  {toggle.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* --- Elenco -------------------------------------------------------- */}
      {items.error ? (
        <ErrorBox error={items.error} onRetry={() => void items.refetch()} />
      ) : (
        <div className="panel">
          <div className="panel-header">
            <label className="checkbox small">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelection(e.target.checked ? new Set(list.map((item) => item.id)) : new Set())}
                aria-label="Seleziona tutti gli oggetti visibili"
              />
              <span className="muted">{selection.size > 0 ? plural(selection.size, 'selezionato', 'selezionati') : 'Seleziona'}</span>
            </label>
            <span className="small muted">
              {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} di ${total}` : ''}
            </span>
          </div>

          {items.isLoading ? (
            <Skeleton rows={6} height={52} />
          ) : list.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nessun oggetto corrisponde ai filtri"
              description="Prova ad allargare la ricerca, oppure azzera i filtri per vedere tutto l'inventario."
              action={
                activeFilterCount > 0 || params.get('q') ? (
                  <button type="button" className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Azzera i filtri
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="item-list">
              {list.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selected={selection.has(item.id)}
                  onSelect={toggleSelect}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}

          {total > PAGE_SIZE ? (
            <div className="panel-body row-between">
              <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Precedenti
              </button>
              <span className="small muted">Pagina {page + 1} di {Math.ceil(total / PAGE_SIZE)}</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Successivi
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* --- Azioni multiple ----------------------------------------------- */}
      {selection.size > 0 ? (
        <div className="bulk-bar">
          <strong className="small">{plural(selection.size, 'selezionato', 'selezionati')}</strong>

          <select
            className="select btn-sm"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              bulk.mutate({ action: 'move', location_id: Number(e.target.value) });
              e.target.value = '';
            }}
            aria-label="Sposta in"
          >
            <option value="">Sposta in...</option>
            {(locations.data?.locations ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.path}
              </option>
            ))}
          </select>

          <select
            className="select btn-sm"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              bulk.mutate({ action: 'status', status_id: Number(e.target.value) });
              e.target.value = '';
            }}
            aria-label="Cambia stato"
          >
            <option value="">Stato...</option>
            {(statuses.data?.statuses ?? []).map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const value = window.prompt('Tag da aggiungere (separati da virgola)');
              if (value?.trim()) {
                bulk.mutate({ action: 'add_tags', tags: value.split(',').map((t) => t.trim()).filter(Boolean) });
              }
            }}
          >
            <Icon name="tag" size={14} /> Tag
          </button>

          <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} /> Cestino
          </button>

          <button type="button" className="btn btn-sm" onClick={() => setSelection(new Set())} aria-label="Annulla selezione">
            <Icon name="close" size={14} />
          </button>
        </div>
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
    </div>
  );
}
