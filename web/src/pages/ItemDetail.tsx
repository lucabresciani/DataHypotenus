/**
 * Scheda di un oggetto: tutto quello che si sa di quella cosa, in un posto
 * solo. L'ordine segue le domande reali: dove sta, quanto ne ho, quanto e'
 * costato, e' ancora in garanzia, dove sono i documenti.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { date, dateTime, daysPhrase, money, plural, quantity, relativeTime } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon.tsx';
import { ItemForm } from '@/components/ItemForm.tsx';
import { Attachments } from '@/components/Attachments.tsx';
import {
  AlertBadge,
  ConfirmDialog,
  ErrorState,
  LoadingRows,
  Page,
  Section,
  StatusBadge,
  toast,
} from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const EVENT_LABELS: Record<string, string> = {
  created: 'Oggetto creato',
  updated: 'Modificato',
  quantity: 'Quantità aggiornata',
  moved: 'Spostato',
  status: 'Stato cambiato',
  deleted: 'Spostato nel cestino',
  restored: 'Ripristinato dal cestino',
  purchased: 'Acquistato',
};

/** Riga di una scheda tecnica: etichetta a sinistra, valore a destra. */
function Spec({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(7.5rem,auto)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('m-0 min-w-0 break-words', mono && 'font-mono text-sm')}>{children}</dd>
    </div>
  );
}

export function ItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const item = useQuery({ queryKey: ['item', itemId], queryFn: () => api.item(itemId), enabled: Number.isFinite(itemId) });
  const history = useQuery({
    queryKey: ['history', itemId],
    queryFn: () => api.itemHistory(itemId),
    enabled: Number.isFinite(itemId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['item', itemId] });
    void queryClient.invalidateQueries({ queryKey: ['history', itemId] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const adjust = useMutation({
    mutationFn: (delta: number) => api.adjustQuantity(itemId, delta),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const favorite = useMutation({
    mutationFn: (value: boolean) => api.updateItem(itemId, { is_favorite: value }),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicateItem(itemId),
    onSuccess: (copy) => {
      invalidate();
      toast.success('Copia creata');
      navigate(`/oggetti/${copy.id}`);
    },
    onError: (error) => toast.fail(error),
  });

  const restock = useMutation({
    mutationFn: () => api.restock(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shopping'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Aggiunto alla lista acquisti', { label: 'Vai alla lista', run: () => navigate('/acquisti') });
    },
    onError: (error) => toast.fail(error),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteItem(itemId),
    onSuccess: () => {
      invalidate();
      toast.info('Spostato nel cestino', { label: 'Annulla', run: () => void api.restoreItem(itemId).then(invalidate) });
      navigate('/inventario');
    },
    onError: (error) => toast.fail(error),
  });

  if (item.error) {
    return (
      <Page>
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
        <Button variant="outline" asChild className="self-start">
          <Link to="/inventario">Torna all’inventario</Link>
        </Button>
      </Page>
    );
  }

  if (item.isLoading || !item.data) {
    return (
      <Page>
        <LoadingRows rows={6} height={44} />
      </Page>
    );
  }

  const data = item.data;
  const specs = Object.entries(data.specs);

  return (
    <Page>
      {/* --- Intestazione --------------------------------------------------- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground" aria-label="Percorso">
            <Link to="/inventario" className="hover:text-primary-ink">
              Inventario
            </Link>
            {data.category ? (
              <>
                <Icon name="chevron" size={12} className="text-faint" />
                <Link to={`/inventario?category_id=${data.category.id}`} className="hover:text-primary-ink">
                  {data.category.path}
                </Link>
              </>
            ) : null}
          </nav>

          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.02em]">
            {data.name}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => favorite.mutate(!data.is_favorite)}
              aria-label={data.is_favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
            >
              <Icon name="star" size={17} filled={data.is_favorite} className={data.is_favorite ? 'text-warn' : 'text-faint'} />
            </Button>
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={data.status.label} color={data.status.color} />
            {data.warranty.status === 'active' ? <AlertBadge tone="ok">Garanzia attiva</AlertBadge> : null}
            {data.warranty.status === 'expiring' ? (
              <AlertBadge tone="warn">Garanzia {daysPhrase(data.warranty.days_left, true)}</AlertBadge>
            ) : null}
            {data.warranty.status === 'expired' ? <AlertBadge tone="neutral">Garanzia scaduta</AlertBadge> : null}
            {data.expiration_status === 'expiring' ? (
              <AlertBadge tone="warn">Scade {daysPhrase(data.expiration_days_left)}</AlertBadge>
            ) : null}
            {data.expiration_status === 'expired' ? <AlertBadge tone="danger">Scaduto</AlertBadge> : null}
            {data.below_min ? <AlertBadge tone="warn">Sotto la scorta minima</AlertBadge> : null}
            {data.deleted_at ? <AlertBadge tone="danger">Nel cestino</AlertBadge> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {data.is_consumable ? (
            <Button variant="outline" onClick={() => restock.mutate()} disabled={restock.isPending}>
              <Icon name="cart" size={15} /> Da ricomprare
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
            <Icon name="copy" size={15} /> Duplica
          </Button>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={15} /> Elimina
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} /> Modifica
          </Button>
        </div>
      </header>

      {/* --- I quattro numeri che si guardano sempre ------------------------ */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 bg-background px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">Quantità</dt>
          <dd className="m-0 flex items-center gap-2">
            <span className="flex items-center rounded-md border border-border">
              <button
                type="button"
                onClick={() => adjust.mutate(-1)}
                disabled={data.quantity <= 0}
                aria-label="Diminuisci la quantità"
                className="grid size-7 place-items-center rounded-l-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-35"
              >
                <Icon name="minus" size={14} />
              </button>
              <span className={cn('min-w-9 px-1 text-center font-mono tabular-nums', data.below_min && 'font-semibold text-warn')}>
                {quantity(data.quantity)}
              </span>
              <button
                type="button"
                onClick={() => adjust.mutate(1)}
                aria-label="Aumenta la quantità"
                className="grid size-7 place-items-center rounded-r-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon name="plus" size={14} />
              </button>
            </span>
            <span className="text-sm text-muted-foreground">{data.unit}</span>
          </dd>
          {data.min_quantity !== null ? (
            <span className="text-xs text-faint">soglia minima {quantity(data.min_quantity)}</span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 bg-background px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">Posizione</dt>
          <dd className="m-0 min-w-0">
            {data.location ? (
              <Link to={`/posizioni/${data.location.id}`} className="flex items-center gap-1.5 font-medium hover:text-primary-ink">
                <Icon name={data.location.kind === 'container' ? 'container' : 'pin'} size={15} className="text-faint" />
                <span className="truncate">{data.location.name}</span>
              </Link>
            ) : (
              <span className="text-muted-foreground">Non assegnata</span>
            )}
          </dd>
          {data.location ? <span className="truncate text-xs text-faint">{data.location.path}</span> : null}
        </div>

        <div className="flex flex-col gap-1 bg-background px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">Valore</dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">{money(data.total_value, data.currency)}</dd>
          {data.purchase_price !== null && data.quantity !== 1 ? (
            <span className="text-xs text-faint">{money(data.purchase_price, data.currency)} l’uno</span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 bg-background px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">Acquistato</dt>
          <dd className="m-0 font-medium">{date(data.purchase_date)}</dd>
          {data.vendor ? <span className="truncate text-xs text-faint">presso {data.vendor.name}</span> : null}
        </div>
      </dl>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        {/* --- Colonna principale ------------------------------------------ */}
        <div className="flex min-w-0 flex-col gap-8">
          {data.description || data.notes ? (
            <div className="flex flex-col gap-3">
              {data.description ? <p className="max-w-[70ch] text-md">{data.description}</p> : null}
              {data.notes ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Note</span>
                  <p className="max-w-[70ch] whitespace-pre-wrap text-muted-foreground">{data.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <Section
            title="Foto e documenti"
            actions={
              <span className="text-sm text-muted-foreground">
                {plural(data.photo_count, 'foto', 'foto')} · {plural(data.document_count, 'documento', 'documenti')}
              </span>
            }
          >
            <Attachments entityType="item" entityId={data.id} />
          </Section>

          <Section
            title="Cronologia"
            actions={
              <span className="text-sm text-muted-foreground">{plural(history.data?.events.length ?? 0, 'evento', 'eventi')}</span>
            }
          >
            {history.isLoading ? (
              <LoadingRows rows={3} height={22} />
            ) : (history.data?.events.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun evento registrato.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {history.data?.events.map((event) => (
                  <li key={event.id} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-faint tabular-nums">{relativeTime(event.occurred_at)}</span>
                      </TooltipTrigger>
                      <TooltipContent>{dateTime(event.occurred_at)}</TooltipContent>
                    </Tooltip>
                    <span>
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                      {event.old_value !== null && event.new_value !== null ? (
                        <span className="text-muted-foreground">
                          {' '}
                          da <span className="font-mono">{event.old_value}</span> a{' '}
                          <span className="font-mono">{event.new_value}</span>
                        </span>
                      ) : null}
                      {event.note ? <span className="text-muted-foreground"> · {event.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* --- Colonna laterale --------------------------------------------- */}
        <aside className="flex min-w-0 flex-col gap-8">
          <Section title="Dati tecnici">
            <dl className="m-0 divide-y divide-border">
              <Spec label="Marca">{data.brand ?? '—'}</Spec>
              <Spec label="Modello">{data.model ?? '—'}</Spec>
              <Spec label="Numero di serie" mono={Boolean(data.serial_number)}>
                {data.serial_number ?? '—'}
              </Spec>
              <Spec label="SKU" mono={Boolean(data.sku)}>
                {data.sku ?? '—'}
              </Spec>
              <Spec label="Codice a barre" mono={Boolean(data.barcode)}>
                {data.barcode ?? '—'}
              </Spec>
              <Spec label="Categoria">{data.category?.path ?? '—'}</Spec>
              {specs.map(([key, value]) => (
                <Spec key={key} label={key}>
                  {value}
                </Spec>
              ))}
            </dl>
          </Section>

          <Section title="Acquisto e garanzia">
            <dl className="m-0 divide-y divide-border">
              <Spec label="Prezzo unitario">
                <span className="tabular-nums">{money(data.purchase_price, data.currency)}</span>
              </Spec>
              <Spec label="Valore attuale">
                <span className="tabular-nums">{money(data.current_value, data.currency)}</span>
              </Spec>
              <Spec label="Data acquisto">{date(data.purchase_date)}</Spec>
              <Spec label="Negozio">{data.vendor?.name ?? '—'}</Spec>
              <Spec label="Garanzia">
                {data.warranty.end ? (
                  <>
                    fino al {date(data.warranty.end)}
                    <span className="text-muted-foreground"> ({daysPhrase(data.warranty.days_left, true)})</span>
                  </>
                ) : data.warranty.months ? (
                  `${data.warranty.months} mesi`
                ) : (
                  '—'
                )}
              </Spec>
              <Spec label="Scadenza">{date(data.expiration_date)}</Spec>
              <Spec label="Durata prevista">
                {data.expected_lifespan_months ? `${data.expected_lifespan_months} mesi` : '—'}
              </Spec>
              {data.product_url ? (
                <Spec label="Prodotto">
                  <a
                    href={data.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-ink hover:underline"
                  >
                    Pagina del prodotto <Icon name="external" size={13} />
                  </a>
                </Spec>
              ) : null}
            </dl>
          </Section>

          <Section title="Tag">
            <div className="flex flex-wrap gap-2">
              {data.tags.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nessun tag.</span>
              ) : (
                data.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    to={`/inventario?tag_ids=${tag.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs transition-colors hover:border-primary-soft-border hover:bg-primary-soft hover:text-primary-ink"
                  >
                    <Icon name="tag" size={11} />
                    {tag.name}
                  </Link>
                ))
              )}
            </div>
          </Section>

          <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>
              Creato {relativeTime(data.created_at)} · aggiornato {relativeTime(data.updated_at)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-faint">uid {data.uid}</span>
              </TooltipTrigger>
              <TooltipContent>Identificatore stabile, usato da export e futuri QR code</TooltipContent>
            </Tooltip>
          </div>
        </aside>
      </div>

      {editing ? <ItemForm item={data} onClose={() => setEditing(false)} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={`Eliminare «${data.name}»?`}
          message="L’oggetto va nel cestino: potrai ripristinarlo, e i documenti allegati restano al loro posto."
          confirmLabel="Sposta nel cestino"
          destructive
          onConfirm={() => remove.mutateAsync()}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </Page>
  );
}
