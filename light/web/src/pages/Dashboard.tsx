/**
 * Dashboard: deve rispondere in cinque secondi a "come sta la casa".
 * Ogni riquadro corrisponde a una decisione possibile (comprare, controllare,
 * riordinare); niente numeri decorativi.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import type { Item } from '../lib/types.ts';
import { daysPhrase, date, money, moneyShort, plural, quantity, relativeTime } from '../lib/format.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { AlertBadge, EmptyState, ErrorBox, Skeleton } from '../components/ui.tsx';

function Section({
  title,
  icon,
  count,
  href,
  children,
}: {
  title: string;
  icon: IconName;
  count?: number;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <span className="row">
          <Icon name={icon} size={16} className="faint" />
          <h3 className="panel-title">{title}</h3>
          {count !== undefined && count > 0 ? <span className="badge">{count}</span> : null}
        </span>
        {href ? (
          <Link to={href} className="btn btn-sm btn-ghost">
            Vedi tutto <Icon name="chevron" size={14} />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function CompactItem({ item, right }: { item: Item; right?: React.ReactNode }) {
  return (
    <Link
      to={`/oggetti/${item.id}`}
      className="row"
      style={{ padding: '9px var(--space-4)', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)' }}
    >
      <span className="item-thumb" style={{ width: 32, height: 32 }}>
        {item.primary_photo_id ? (
          <img src={api.attachmentUrl(item.primary_photo_id)} alt="" width={32} height={32} loading="lazy" />
        ) : (
          <Icon name="box" size={14} />
        )}
      </span>
      <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>
          {item.name}
        </span>
        <span className="xs muted truncate">{item.location?.path ?? item.category?.path ?? 'Senza posizione'}</span>
      </span>
      {right}
    </Link>
  );
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });

  if (error) return <div className="page"><ErrorBox error={error} onRetry={() => void refetch()} /></div>;

  if (isLoading || !data) {
    return (
      <div className="page">
        <div className="stat-strip">
          <Skeleton rows={1} height={56} />
        </div>
        <div className="panel">
          <Skeleton rows={5} />
        </div>
      </div>
    );
  }

  const { totals, spending } = data;
  const currency = totals.currency;
  const empty = totals.items === 0;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>La tua casa</h1>
          <p className="muted">
            {empty
              ? 'Inventario ancora vuoto: si comincia aggiungendo il primo oggetto.'
              : `${plural(totals.items, 'oggetto catalogato', 'oggetti catalogati')} in ${plural(totals.rooms, 'stanza', 'stanze')}.`}
          </p>
        </div>
      </header>

      {empty ? (
        <div className="panel">
          <EmptyState
            icon="box"
            title="Nessun oggetto ancora registrato"
            description="Aggiungi il primo oggetto con il pulsante in alto a destra, oppure importa un file CSV se hai già un elenco da qualche parte."
            action={
              <div className="row">
                <Link to="/impostazioni" className="btn">
                  <Icon name="upload" size={15} /> Importa un CSV
                </Link>
                <Link to="/posizioni" className="btn btn-primary">
                  <Icon name="pin" size={15} /> Prepara le stanze
                </Link>
              </div>
            }
          />
        </div>
      ) : null}

      {/* --- Numeri di sintesi ------------------------------------------- */}
      <div className="stat-strip">
        <div className="stat">
          <span className="stat-value">{totals.items}</span>
          <span className="stat-label">Oggetti</span>
        </div>
        <div className="stat">
          <span className="stat-value">{quantity(totals.units)}</span>
          <span className="stat-label">Pezzi totali</span>
        </div>
        <div className="stat">
          <span className="stat-value">{moneyShort(totals.inventory_value, currency)}</span>
          <span className="stat-label">Valore inventario</span>
        </div>
        <div className="stat">
          <span className="stat-value">{moneyShort(spending.this_month, currency)}</span>
          <span className="stat-label">Speso questo mese</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totals.rooms}</span>
          <span className="stat-label">Stanze</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totals.containers}</span>
          <span className="stat-label">Contenitori</span>
        </div>
      </div>

      {/* --- Cose che richiedono attenzione ------------------------------ */}
      {data.attention_count > 0 ? (
        <div className="row wrap" style={{ gap: 'var(--space-2)' }}>
          {data.low_stock.count > 0 ? (
            <Link to="/inventario?below_min=1" className="chip">
              <Icon name="alert" size={13} /> {data.low_stock.count} sotto scorta
            </Link>
          ) : null}
          {data.warranties.expiring_count > 0 ? (
            <Link to="/scadenze" className="chip">
              <Icon name="shield" size={13} /> {data.warranties.expiring_count} garanzie in scadenza
            </Link>
          ) : null}
          {data.expirations.expiring_count > 0 ? (
            <Link to="/scadenze" className="chip">
              <Icon name="clock" size={13} /> {data.expirations.expiring_count} scadenze vicine
            </Link>
          ) : null}
          {data.expirations.expired_count > 0 ? (
            <Link to="/scadenze" className="chip">
              <Icon name="alert" size={13} /> {data.expirations.expired_count} già scaduti
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="panel-grid">
        {/* --- Da comprare ---------------------------------------------- */}
        <Section title="Da comprare" icon="cart" count={data.to_buy.count} href="/acquisti">
          {data.to_buy.items.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">Niente in lista. Quando un consumabile scende sotto la soglia lo trovi qui.</p>
            </div>
          ) : (
            <>
              <div>
                {data.to_buy.items.map((entry) => (
                  <div
                    key={entry.id}
                    className="row"
                    style={{ padding: '9px var(--space-4)', borderBottom: '1px solid var(--border)' }}
                  >
                    <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>
                        {entry.name}
                      </span>
                      <span className="xs muted">
                        {quantity(entry.desired_quantity, entry.unit)}
                        {entry.category_path ? ` · ${entry.category_path}` : ''}
                      </span>
                    </span>
                    {entry.priority === 'urgente' || entry.priority === 'alta' ? (
                      <span className={`badge ${entry.priority === 'urgente' ? 'danger' : 'warn'}`}>{entry.priority}</span>
                    ) : null}
                    <span className="small num muted">{money(entry.estimated_total, entry.currency)}</span>
                  </div>
                ))}
              </div>
              <div className="panel-body row-between">
                <span className="small muted">Spesa stimata</span>
                <strong className="num">{money(data.to_buy.estimated_total, currency)}</strong>
              </div>
            </>
          )}
        </Section>

        {/* --- Scorte in esaurimento ------------------------------------ */}
        <Section title="Scorte in esaurimento" icon="alert" count={data.low_stock.count} href="/inventario?below_min=1">
          {data.low_stock.items.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">Tutti i consumabili sono sopra la soglia minima.</p>
            </div>
          ) : (
            data.low_stock.items.map((item) => (
              <CompactItem
                key={item.id}
                item={item}
                right={
                  <span className="badge warn num">
                    {quantity(item.quantity, item.unit)} / min {quantity(item.min_quantity ?? 0)}
                  </span>
                }
              />
            ))
          )}
        </Section>

        {/* --- Garanzie -------------------------------------------------- */}
        <Section title="Garanzie in scadenza" icon="shield" count={data.warranties.expiring_count} href="/scadenze">
          {data.warranties.items.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">
                Nessuna garanzia in scadenza a breve
                {data.warranties.expired_count > 0 ? ` (${data.warranties.expired_count} già scadute).` : '.'}
              </p>
            </div>
          ) : (
            data.warranties.items.map((item) => (
              <CompactItem
                key={item.id}
                item={item}
                right={<AlertBadge tone="warn">{daysPhrase(item.warranty.days_left, true)}</AlertBadge>}
              />
            ))
          )}
        </Section>

        {/* --- Scadenze -------------------------------------------------- */}
        <Section title="Scadenze imminenti" icon="clock" count={data.expirations.expiring_count} href="/scadenze">
          {data.expirations.items.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">Nessun prodotto in scadenza nei prossimi giorni.</p>
            </div>
          ) : (
            data.expirations.items.map((item) => (
              <CompactItem
                key={item.id}
                item={item}
                right={
                  <AlertBadge tone={item.expiration_status === 'expired' ? 'danger' : 'warn'}>
                    {date(item.expiration_date)}
                  </AlertBadge>
                }
              />
            ))
          )}
        </Section>

        {/* --- Aggiunte recenti ------------------------------------------ */}
        <Section title="Aggiunti di recente" icon="plus" href="/inventario?sort=created_at">
          {data.recent_added.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">Ancora nulla in inventario.</p>
            </div>
          ) : (
            data.recent_added.map((item) => (
              <CompactItem key={item.id} item={item} right={<span className="xs faint">{relativeTime(item.created_at)}</span>} />
            ))
          )}
        </Section>

        {/* --- Modifiche recenti ----------------------------------------- */}
        <Section title="Modificati di recente" icon="history" href="/inventario?sort=updated_at">
          {data.recent_updated.length === 0 ? (
            <div className="panel-body">
              <p className="muted small">Nessuna modifica registrata.</p>
            </div>
          ) : (
            data.recent_updated.map((item) => (
              <CompactItem key={item.id} item={item} right={<span className="xs faint">{relativeTime(item.updated_at)}</span>} />
            ))
          )}
        </Section>
      </div>

      {/* --- Spesa ------------------------------------------------------- */}
      <section className="panel">
        <header className="panel-header">
          <span className="row">
            <Icon name="chart" size={16} className="faint" />
            <h3 className="panel-title">Spesa per la casa</h3>
          </span>
          <Link to="/statistiche" className="btn btn-sm btn-ghost">
            Statistiche <Icon name="chevron" size={14} />
          </Link>
        </header>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
          <div className="col" style={{ gap: 2 }}>
            <span className="stat-value">{money(spending.last_30_days, currency)}</span>
            <span className="stat-label">Ultimi 30 giorni</span>
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="stat-value">{money(spending.this_month, currency)}</span>
            <span className="stat-label">Mese corrente</span>
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="stat-value">{money(spending.this_year, currency)}</span>
            <span className="stat-label">Anno corrente</span>
          </div>
          <div className="col" style={{ gap: 2 }}>
            <span className="stat-value">{money(spending.total, currency)}</span>
            <span className="stat-label">Totale registrato</span>
          </div>
        </div>
      </section>
    </div>
  );
}
