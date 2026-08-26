/**
 * "Cosa c'e' dentro questa stanza / questo scatolone".
 * La domanda per cui esiste tutta la gerarchia delle posizioni.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { LOCATION_KIND_LABELS, type Item, type LocationKind } from '@/lib/types.ts';
import { money } from '@/lib/format.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { ItemRow } from '@/components/ItemRow.tsx';
import { ItemForm } from '@/components/ItemForm.tsx';
import { Attachments } from '@/components/Attachments.tsx';
import { EmptyState, ErrorState, LoadingRows, Page, Section } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';

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
    queryFn: () =>
      api.items({ location_id: locationId, include_sublocations: true, limit: 500, sort: 'location', direction: 'asc' }),
    enabled: deep && Number.isFinite(locationId),
  });

  if (contents.error) {
    return (
      <Page>
        <ErrorState error={contents.error} onRetry={() => void contents.refetch()} />
      </Page>
    );
  }

  if (contents.isLoading || !contents.data) {
    return (
      <Page>
        <LoadingRows rows={5} height={48} />
      </Page>
    );
  }

  const { location, breadcrumb, children, items, items_total, value } = contents.data;
  const shownItems = deep ? (nested.data?.items ?? []) : items;
  const shownTotal = deep ? (nested.data?.total ?? 0) : items_total;

  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" aria-label="Percorso">
            <Link to="/posizioni" className="hover:text-primary-ink">
              Posizioni
            </Link>
            {breadcrumb.slice(0, -1).map((crumb) => (
              <span key={crumb.id} className="flex items-center gap-1.5">
                <Icon name="chevron" size={12} className="text-faint" />
                <Link to={`/posizioni/${crumb.id}`} className="hover:text-primary-ink">
                  {crumb.name}
                </Link>
              </span>
            ))}
          </nav>

          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-[-0.02em]">
            <Icon name={iconForKind(location.kind)} size={22} className="text-faint" />
            {location.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {LOCATION_KIND_LABELS[location.kind as LocationKind] ?? location.kind}
            </span>
            {location.code ? (
              <span className="rounded-full border border-primary-soft-border bg-primary-soft px-2 py-0.5 font-mono text-xs text-primary-ink">
                {location.code}
              </span>
            ) : null}
            {location.room_name && location.room_name !== location.name ? (
              <span className="text-sm text-muted-foreground">in {location.room_name}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/inventario?location_id=${location.id}`}>
              <Icon name="search" size={15} /> Filtra nell’inventario
            </Link>
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Aggiungi qui
          </Button>
        </div>
      </header>

      {location.notes ? <p className="-mt-4 max-w-[70ch] text-base text-muted-foreground">{location.notes}</p> : null}

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {[
          { value: String(items_total), label: 'Oggetti qui' },
          { value: String(children.length), label: 'Sotto-posizioni' },
          { value: money(value), label: 'Valore qui' },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-0.5 bg-background px-4 py-3.5">
            <dd className="text-xl font-semibold tracking-[-0.02em] tabular-nums">{cell.value}</dd>
            <dt className="text-sm text-muted-foreground">{cell.label}</dt>
          </div>
        ))}
      </dl>

      {children.length > 0 ? (
        <Section title="Contiene">
          <div className="flex flex-wrap gap-2 pt-1">
            {children.map((child) => (
              <Button key={child.id} variant="outline" size="sm" asChild>
                <Link to={`/posizioni/${child.id}`}>
                  <Icon name={iconForKind(child.kind)} size={13} />
                  {child.name}
                  {child.item_count > 0 ? <span className="font-mono text-2xs text-faint">{child.item_count}</span> : null}
                </Link>
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title={deep ? 'Oggetti, anche nelle sotto-posizioni' : 'Oggetti qui dentro'}
        actions={
          <>
            <span className="text-sm text-muted-foreground tabular-nums">{shownTotal}</span>
            {children.length > 0 ? (
              <Button variant={deep ? 'default' : 'outline'} size="sm" aria-pressed={deep} onClick={() => setDeep(!deep)}>
                {deep ? <Icon name="check" size={13} /> : null}
                Includi sotto-posizioni
              </Button>
            ) : null}
          </>
        }
      >
        {deep && nested.isLoading ? (
          <LoadingRows rows={4} height={48} />
        ) : shownItems.length === 0 ? (
          <EmptyState
            icon="box"
            title="Qui non c’è ancora niente"
            description={
              children.length > 0
                ? 'Prova ad attivare «Includi sotto-posizioni», oppure aggiungi un oggetto direttamente qui.'
                : 'Aggiungi il primo oggetto di questa posizione.'
            }
            action={<Button onClick={() => setAdding(true)}>Aggiungi un oggetto</Button>}
          />
        ) : (
          <div className="divide-y divide-border">
            {shownItems.map((item) => (
              <ItemRow key={item.id} item={item} onEdit={setEditing} showSelection={false} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Documenti della posizione" description="Foto della stanza, planimetrie, istruzioni di montaggio.">
        <Attachments entityType="location" entityId={location.id} />
      </Section>

      {adding ? (
        <ItemForm defaults={{ location_id: location.id }} onClose={() => setAdding(false)} onSaved={() => void contents.refetch()} />
      ) : null}
      {editing ? <ItemForm item={editing} onClose={() => setEditing(null)} onSaved={() => void contents.refetch()} /> : null}
    </Page>
  );
}
