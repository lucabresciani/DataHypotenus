/**
 * "Cosa c'e' dentro questa stanza / questo scatolone".
 * La domanda per cui esiste tutta la gerarchia delle posizioni.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { LOCATION_KIND_LABELS, type Item, type LocationKind } from '../lib/types.ts';
import { money } from '../lib/format.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { ItemRow } from '../components/ItemRow.tsx';
import { ItemForm } from '../components/ItemForm.tsx';
import { Attachments } from '../components/Attachments.tsx';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui.tsx';

const iconForKind = (kind: string): IconName =>
  kind === 'container' ? 'container' : kind === 'room' || kind === 'building' ? 'room' : 'pin';

export function LocationDetailPage() {
  const { id } = useParams();
  const locationId = Number(id);
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [deep, setDeep] = useState(false);

  const contents = useQuery({
    queryKey: ['location-contents', locationId],
    queryFn: () => api.locationContents(locationId),
    enabled: Number.isFinite(locationId),
  });

  const nested = useQuery({
    queryKey: ['items', { location_id: locationId, deep: true }],
    queryFn: () => api.items({ location_id: locationId, include_sublocations: true, limit: 500, sort: 'location', direction: 'asc' }),
    enabled: deep && Number.isFinite(locationId),
  });

  if (contents.error) {
    return (
      <div className="page">
        <ErrorBox error={contents.error} onRetry={() => void contents.refetch()} />
      </div>
    );
  }

  if (contents.isLoading || !contents.data) {
    return (
      <div className="page">
        <div className="panel">
          <Skeleton rows={5} height={40} />
        </div>
      </div>
    );
  }

  const { location, breadcrumb, children, items, items_total, value } = contents.data;
  const shownItems = deep ? (nested.data?.items ?? []) : items;
  const shownTotal = deep ? (nested.data?.total ?? 0) : items_total;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title" style={{ minWidth: 0 }}>
          <nav className="row small muted wrap" style={{ gap: 6 }} aria-label="Percorso">
            <Link to="/posizioni" className="muted">
              Posizioni
            </Link>
            {breadcrumb.slice(0, -1).map((crumb) => (
              <span key={crumb.id} className="row" style={{ gap: 6 }}>
                <Icon name="chevron" size={12} />
                <Link to={`/posizioni/${crumb.id}`} className="muted">
                  {crumb.name}
                </Link>
              </span>
            ))}
          </nav>
          <h1 className="row" style={{ gap: 10 }}>
            <Icon name={iconForKind(location.kind)} size={22} className="faint" />
            {location.name}
          </h1>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge">{LOCATION_KIND_LABELS[location.kind as LocationKind] ?? location.kind}</span>
            {location.code ? <span className="badge accent mono">{location.code}</span> : null}
            {location.room_name && location.room_name !== location.name ? (
              <span className="small muted">in {location.room_name}</span>
            ) : null}
          </div>
        </div>

        <div className="row wrap">
          <Link to={`/inventario?location_id=${location.id}`} className="btn">
            <Icon name="search" size={15} /> Filtra nell’inventario
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Aggiungi qui
          </button>
        </div>
      </header>

      {location.notes ? (
        <p className="muted" style={{ maxWidth: '70ch' }}>
          {location.notes}
        </p>
      ) : null}

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-value">{items_total}</span>
          <span className="stat-label">Oggetti qui</span>
        </div>
        <div className="stat">
          <span className="stat-value">{children.length}</span>
          <span className="stat-label">Sotto-posizioni</span>
        </div>
        <div className="stat">
          <span className="stat-value">{money(value)}</span>
          <span className="stat-label">Valore qui</span>
        </div>
      </div>

      {children.length > 0 ? (
        <section className="panel">
          <header className="panel-header">
            <h3 className="panel-title">Contiene</h3>
          </header>
          <div className="panel-body row wrap" style={{ gap: 'var(--space-2)' }}>
            {children.map((child) => (
              <Link key={child.id} to={`/posizioni/${child.id}`} className="chip">
                <Icon name={iconForKind(child.kind)} size={13} />
                {child.name}
                <span className="faint">{child.item_count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <header className="panel-header">
          <h3 className="panel-title">Oggetti {deep ? '(anche nelle sotto-posizioni)' : 'qui dentro'}</h3>
          <div className="row">
            <span className="small muted">{shownTotal}</span>
            {children.length > 0 ? (
              <button type="button" className={`chip${deep ? ' active' : ''}`} onClick={() => setDeep(!deep)}>
                Includi sotto-posizioni
              </button>
            ) : null}
          </div>
        </header>

        {deep && nested.isLoading ? (
          <Skeleton rows={4} height={48} />
        ) : shownItems.length === 0 ? (
          <EmptyState
            icon="box"
            title="Qui non c’è ancora niente"
            description={
              children.length > 0
                ? 'Prova ad attivare "Includi sotto-posizioni", oppure aggiungi un oggetto direttamente qui.'
                : 'Aggiungi il primo oggetto di questa posizione.'
            }
            action={
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Aggiungi un oggetto
              </button>
            }
          />
        ) : (
          <div className="item-list">
            {shownItems.map((item) => (
              <ItemRow key={item.id} item={item} onEdit={setEditing} showSelection={false} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h3 className="panel-title">Documenti della posizione</h3>
        </header>
        <div className="panel-body">
          <Attachments entityType="location" entityId={location.id} />
        </div>
      </section>

      {adding ? (
        <ItemForm defaults={{ location_id: location.id }} onClose={() => setAdding(false)} onSaved={() => void contents.refetch()} />
      ) : null}
      {editing ? <ItemForm item={editing} onClose={() => setEditing(null)} onSaved={() => void contents.refetch()} /> : null}
    </div>
  );
}
