/**
 * Scheda di un oggetto: tutto quello che si sa di quella cosa, in un posto
 * solo. L'ordine segue le domande reali: dove sta, quanto ne ho, quanto e'
 * costato, e' ancora in garanzia, dove sono i documenti.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { date, dateTime, daysPhrase, money, plural, quantity, relativeTime } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { ItemForm } from '../components/ItemForm.tsx';
import { Attachments } from '../components/Attachments.tsx';
import { AlertBadge, ConfirmDialog, ErrorBox, Skeleton, StatusBadge, useToast } from '../components/ui.tsx';

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

export function ItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const item = useQuery({ queryKey: ['item', itemId], queryFn: () => api.item(itemId), enabled: Number.isFinite(itemId) });
  const history = useQuery({ queryKey: ['history', itemId], queryFn: () => api.itemHistory(itemId), enabled: Number.isFinite(itemId) });

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
      toast.notify('Spostato nel cestino', { label: 'Annulla', run: () => void api.restoreItem(itemId).then(invalidate) });
      navigate('/inventario');
    },
    onError: (error) => toast.fail(error),
  });

  if (item.error) {
    return (
      <div className="page">
        <ErrorBox error={item.error} onRetry={() => void item.refetch()} />
        <Link to="/inventario" className="btn" style={{ alignSelf: 'flex-start' }}>
          Torna all’inventario
        </Link>
      </div>
    );
  }

  if (item.isLoading || !item.data) {
    return (
      <div className="page">
        <div className="panel">
          <Skeleton rows={6} height={40} />
        </div>
      </div>
    );
  }

  const data = item.data;
  const specs = Object.entries(data.specs);

  return (
    <div className="page">
      {/* --- Intestazione --------------------------------------------------- */}
      <header className="page-header">
        <div className="page-title" style={{ minWidth: 0 }}>
          <nav className="row small muted wrap" style={{ gap: 6 }} aria-label="Percorso">
            <Link to="/inventario" className="muted">
              Inventario
            </Link>
            {data.category ? (
              <>
                <Icon name="chevron" size={12} />
                <Link to={`/inventario?category_id=${data.category.id}`} className="muted">
                  {data.category.path}
                </Link>
              </>
            ) : null}
          </nav>
          <h1 className="row" style={{ gap: 10 }}>
            {data.name}
            <button
              type="button"
              className="btn btn-icon btn-ghost"
              onClick={() => favorite.mutate(!data.is_favorite)}
              aria-label={data.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              title={data.is_favorite ? 'Nei preferiti' : 'Aggiungi ai preferiti'}
            >
              <Icon name="star" size={18} filled={data.is_favorite} className={data.is_favorite ? 'accent-ink' : 'faint'} />
            </button>
          </h1>
          <div className="row wrap" style={{ gap: 6 }}>
            <StatusBadge label={data.status.label} color={data.status.color} />
            {data.warranty.status === 'active' ? <AlertBadge tone="ok">Garanzia attiva</AlertBadge> : null}
            {data.warranty.status === 'expiring' ? (
              <AlertBadge tone="warn">Garanzia {daysPhrase(data.warranty.days_left, true)}</AlertBadge>
            ) : null}
            {data.warranty.status === 'expired' ? <AlertBadge tone="danger">Garanzia scaduta</AlertBadge> : null}
            {data.expiration_status === 'expiring' ? <AlertBadge tone="warn">Scade {daysPhrase(data.expiration_days_left)}</AlertBadge> : null}
            {data.expiration_status === 'expired' ? <AlertBadge tone="danger">Scaduto</AlertBadge> : null}
            {data.below_min ? <AlertBadge tone="warn">Sotto la scorta minima</AlertBadge> : null}
            {data.deleted_at ? <AlertBadge tone="danger">Nel cestino</AlertBadge> : null}
          </div>
        </div>

        <div className="row wrap">
          {data.is_consumable ? (
            <button type="button" className="btn" onClick={() => restock.mutate()} disabled={restock.isPending}>
              <Icon name="cart" size={15} /> Da ricomprare
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
            <Icon name="copy" size={15} /> Duplica
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={15} /> Elimina
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} /> Modifica
          </button>
        </div>
      </header>

      <div className="detail-grid">
        {/* --- Colonna principale ------------------------------------------ */}
        <div className="col" style={{ gap: 'var(--space-4)' }}>
          <section className="panel">
            <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="col" style={{ gap: 4 }}>
                <span className="stat-label">Quantità</span>
                <div className="row">
                  <div className="qty-control">
                    <button type="button" onClick={() => adjust.mutate(-1)} disabled={data.quantity <= 0} aria-label="Diminuisci">
                      <Icon name="minus" size={14} />
                    </button>
                    <span className={`qty-value${data.below_min ? ' below' : ''}`}>{quantity(data.quantity)}</span>
                    <button type="button" onClick={() => adjust.mutate(1)} aria-label="Aumenta">
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                  <span className="muted small">{data.unit}</span>
                </div>
                {data.min_quantity !== null ? <span className="xs faint">soglia minima {quantity(data.min_quantity)}</span> : null}
              </div>

              <div className="col" style={{ gap: 4 }}>
                <span className="stat-label">Posizione</span>
                {data.location ? (
                  <Link to={`/posizioni/${data.location.id}`} className="row" style={{ gap: 6 }}>
                    <Icon name={data.location.kind === 'container' ? 'container' : 'pin'} size={15} className="faint" />
                    <span style={{ fontWeight: 550 }}>{data.location.name}</span>
                  </Link>
                ) : (
                  <span className="muted">Non assegnata</span>
                )}
                {data.location ? <span className="xs faint truncate">{data.location.path}</span> : null}
              </div>

              <div className="col" style={{ gap: 4 }}>
                <span className="stat-label">Valore</span>
                <span style={{ fontWeight: 600, fontSize: 'var(--text-lg)' }} className="num">
                  {money(data.total_value, data.currency)}
                </span>
                {data.purchase_price !== null && data.quantity !== 1 ? (
                  <span className="xs faint">{money(data.purchase_price, data.currency)} l’uno</span>
                ) : null}
              </div>

              <div className="col" style={{ gap: 4 }}>
                <span className="stat-label">Acquistato</span>
                <span style={{ fontWeight: 550 }}>{date(data.purchase_date)}</span>
                {data.vendor ? <span className="xs faint truncate">presso {data.vendor.name}</span> : null}
              </div>
            </div>
          </section>

          {data.description || data.notes ? (
            <section className="panel">
              <div className="panel-body col" style={{ gap: 'var(--space-3)' }}>
                {data.description ? <p style={{ maxWidth: '70ch' }}>{data.description}</p> : null}
                {data.notes ? (
                  <div className="col" style={{ gap: 4 }}>
                    <span className="label">Note</span>
                    <p className="muted" style={{ maxWidth: '70ch', whiteSpace: 'pre-wrap' }}>
                      {data.notes}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="panel">
            <header className="panel-header">
              <h3 className="panel-title">Foto e documenti</h3>
              <span className="small muted">
                {data.photo_count} foto · {plural(data.document_count, 'documento', 'documenti')}
              </span>
            </header>
            <div className="panel-body">
              <Attachments entityType="item" entityId={data.id} />
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <h3 className="panel-title">Cronologia</h3>
              <span className="small muted">{plural(history.data?.events.length ?? 0, 'evento', 'eventi')}</span>
            </header>
            <div className="panel-body">
              {history.isLoading ? (
                <Skeleton rows={3} height={20} />
              ) : (history.data?.events.length ?? 0) === 0 ? (
                <p className="small muted">Nessun evento registrato.</p>
              ) : (
                <div className="timeline">
                  {history.data?.events.map((event) => (
                    <div key={event.id} className="timeline-item">
                      <span className="timeline-date" title={dateTime(event.occurred_at)}>
                        {relativeTime(event.occurred_at)}
                      </span>
                      <span>
                        {EVENT_LABELS[event.event_type] ?? event.event_type}
                        {event.old_value !== null && event.new_value !== null ? (
                          <span className="muted">
                            {' '}
                            da <span className="mono">{event.old_value}</span> a <span className="mono">{event.new_value}</span>
                          </span>
                        ) : null}
                        {event.note ? <span className="muted"> · {event.note}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* --- Colonna laterale --------------------------------------------- */}
        <aside className="col" style={{ gap: 'var(--space-4)' }}>
          <section className="panel">
            <header className="panel-header">
              <h3 className="panel-title">Dati tecnici</h3>
            </header>
            <div className="panel-body">
              <dl className="spec-list">
                <dt>Marca</dt>
                <dd>{data.brand ?? '—'}</dd>
                <dt>Modello</dt>
                <dd>{data.model ?? '—'}</dd>
                <dt>Numero di serie</dt>
                <dd className={data.serial_number ? 'mono small' : undefined}>{data.serial_number ?? '—'}</dd>
                <dt>SKU</dt>
                <dd className={data.sku ? 'mono small' : undefined}>{data.sku ?? '—'}</dd>
                <dt>Codice a barre</dt>
                <dd className={data.barcode ? 'mono small' : undefined}>{data.barcode ?? '—'}</dd>
                <dt>Categoria</dt>
                <dd>{data.category?.path ?? '—'}</dd>
                {specs.map(([key, value]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <h3 className="panel-title">Acquisto e garanzia</h3>
            </header>
            <div className="panel-body">
              <dl className="spec-list">
                <dt>Prezzo unitario</dt>
                <dd className="num">{money(data.purchase_price, data.currency)}</dd>
                <dt>Valore attuale</dt>
                <dd className="num">{money(data.current_value, data.currency)}</dd>
                <dt>Data acquisto</dt>
                <dd>{date(data.purchase_date)}</dd>
                <dt>Negozio</dt>
                <dd>{data.vendor?.name ?? '—'}</dd>
                <dt>Garanzia</dt>
                <dd>
                  {data.warranty.end ? (
                    <>
                      fino al {date(data.warranty.end)}
                      <span className="muted"> ({daysPhrase(data.warranty.days_left, true)})</span>
                    </>
                  ) : data.warranty.months ? (
                    `${data.warranty.months} mesi`
                  ) : (
                    '—'
                  )}
                </dd>
                <dt>Scadenza</dt>
                <dd>{date(data.expiration_date)}</dd>
                <dt>Durata prevista</dt>
                <dd>{data.expected_lifespan_months ? `${data.expected_lifespan_months} mesi` : '—'}</dd>
                {data.product_url ? (
                  <>
                    <dt>Prodotto</dt>
                    <dd>
                      <a href={data.product_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, color: 'var(--accent-ink)' }}>
                        Pagina del prodotto <Icon name="external" size={13} />
                      </a>
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <h3 className="panel-title">Tag</h3>
            </header>
            <div className="panel-body row wrap" style={{ gap: 6 }}>
              {data.tags.length === 0 ? (
                <span className="small muted">Nessun tag.</span>
              ) : (
                data.tags.map((tag) => (
                  <Link key={tag.id} to={`/inventario?tag_ids=${tag.id}`} className="tag">
                    <Icon name="tag" size={11} />
                    {tag.name}
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-body col" style={{ gap: 6 }}>
              <span className="xs muted">
                Creato {relativeTime(data.created_at)} · aggiornato {relativeTime(data.updated_at)}
              </span>
              <span className="xs faint mono" title="Identificatore stabile, usato da export e futuri QR code">
                uid {data.uid}
              </span>
            </div>
          </section>
        </aside>
      </div>

      {editing ? <ItemForm item={data} onClose={() => setEditing(false)} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={`Eliminare "${data.name}"?`}
          message="L’oggetto va nel cestino: potrai ripristinarlo, e i documenti allegati restano al loro posto."
          confirmLabel="Sposta nel cestino"
          destructive
          onConfirm={() => remove.mutateAsync()}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
