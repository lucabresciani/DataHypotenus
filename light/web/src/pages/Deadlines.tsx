/**
 * Scadenze e garanzie: le cose che hanno una data che si avvicina.
 * Tre gruppi, ordinati per urgenza reale, ognuno con l'azione che serve.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import type { Item } from '../lib/types.ts';
import { date, daysPhrase, money, plural, quantity } from '../lib/format.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { AlertBadge, EmptyState, ErrorBox, Skeleton } from '../components/ui.tsx';

function Group({
  title,
  icon,
  description,
  items,
  loading,
  emptyText,
  render,
}: {
  title: string;
  icon: IconName;
  description: string;
  items: Item[];
  loading: boolean;
  emptyText: string;
  render: (item: Item) => React.ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div className="col" style={{ gap: 0 }}>
          <span className="row">
            <Icon name={icon} size={16} className="faint" />
            <h3 className="panel-title">{title}</h3>
            {items.length > 0 ? <span className="badge">{items.length}</span> : null}
          </span>
          <span className="xs muted">{description}</span>
        </div>
      </header>

      {loading ? (
        <Skeleton rows={3} height={44} />
      ) : items.length === 0 ? (
        <div className="panel-body">
          <p className="small muted">{emptyText}</p>
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className="row" style={{ padding: '10px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
              <Link to={`/oggetti/${item.id}`} className="col grow" style={{ gap: 1, minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 550 }}>
                  {item.name}
                </span>
                <span className="xs muted truncate">
                  {[item.location?.path, item.brand].filter(Boolean).join(' · ') || 'Senza posizione'}
                </span>
              </Link>
              {render(item)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DeadlinesPage() {
  /* Le finestre di avviso sono quelle scelte in Impostazioni: erano fisse a 120
     e 60 giorni, quindi cambiare la preferenza non cambiava questa pagina, che
     e' proprio quella che dovrebbe rispettarla. */
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const days = (key: string, fallback: number) => {
    const parsed = Number(settings.data?.settings[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const warrantyDays = days('alerts.warranty_days', 60);
  const expirationDays = days('alerts.expiration_days', 30);

  const warrantyExpiring = useQuery({
    queryKey: ['items', 'warranty-expiring', warrantyDays],
    queryFn: () =>
      api.items({
        warranty: 'expiring',
        expiring_within_days: warrantyDays,
        sort: 'purchase_date',
        direction: 'asc',
        limit: 100,
      }),
  });
  const warrantyExpired = useQuery({
    queryKey: ['items', 'warranty-expired'],
    queryFn: () => api.items({ warranty: 'expired', sort: 'purchase_date', direction: 'desc', limit: 50 }),
  });
  const expiring = useQuery({
    queryKey: ['items', 'expiring', expirationDays],
    queryFn: () => api.items({ expiring_within_days: expirationDays, sort: 'name', direction: 'asc', limit: 100 }),
  });
  const lowStock = useQuery({
    queryKey: ['items', 'low-stock'],
    queryFn: () => api.items({ below_min: true, sort: 'quantity', direction: 'asc', limit: 100 }),
  });

  const anyError = warrantyExpiring.error ?? expiring.error ?? lowStock.error;
  const nothing =
    !warrantyExpiring.isLoading &&
    !expiring.isLoading &&
    !lowStock.isLoading &&
    (warrantyExpiring.data?.total ?? 0) === 0 &&
    (expiring.data?.total ?? 0) === 0 &&
    (lowStock.data?.total ?? 0) === 0 &&
    (warrantyExpired.data?.total ?? 0) === 0;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Scadenze e garanzie</h1>
          <p className="muted">Tutto ciò che ha una data in avvicinamento, in un posto solo.</p>
        </div>
      </header>

      {anyError ? <ErrorBox error={anyError} onRetry={() => void warrantyExpiring.refetch()} /> : null}

      {nothing ? (
        <div className="panel">
          <EmptyState
            icon="check"
            title="Niente in scadenza"
            description="Nessuna garanzia sta per finire, nessun prodotto è in scadenza e le scorte sono a posto."
          />
        </div>
      ) : null}

      <Group
        title="Garanzie in scadenza"
        icon="shield"
        description={`Entro ${plural(warrantyDays, 'giorno', 'giorni')}: il momento giusto per verificare che la ricevuta ci sia.`}
        items={warrantyExpiring.data?.items ?? []}
        loading={warrantyExpiring.isLoading}
        emptyText={`Nessuna garanzia in scadenza nei prossimi ${plural(warrantyDays, 'giorno', 'giorni')}.`}
        render={(item) => (
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            {item.attachment_count === 0 ? <AlertBadge tone="warn">Nessun documento</AlertBadge> : null}
            <span className="small muted num hide-sm">{date(item.warranty.end)}</span>
            <AlertBadge tone="warn">{daysPhrase(item.warranty.days_left, true)}</AlertBadge>
          </div>
        )}
      />

      <Group
        title="Prodotti in scadenza"
        icon="clock"
        description="Alimenti, medicinali, cosmetici, filtri: quello che va consumato o sostituito."
        items={expiring.data?.items ?? []}
        loading={expiring.isLoading}
        emptyText={`Nessun prodotto in scadenza nei prossimi ${plural(expirationDays, 'giorno', 'giorni')}.`}
        render={(item) => (
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="small muted num hide-sm">{quantity(item.quantity, item.unit)}</span>
            <AlertBadge tone={item.expiration_status === 'expired' ? 'danger' : 'warn'}>
              {item.expiration_status === 'expired' ? `Scaduto il ${date(item.expiration_date)}` : date(item.expiration_date)}
            </AlertBadge>
          </div>
        )}
      />

      <Group
        title="Scorte sotto la soglia"
        icon="alert"
        description="Consumabili da riordinare: dalla scheda puoi mandarli in lista acquisti."
        items={lowStock.data?.items ?? []}
        loading={lowStock.isLoading}
        emptyText="Tutte le scorte sono sopra la soglia minima."
        render={(item) => (
          <AlertBadge tone="warn">
            {quantity(item.quantity, item.unit)} · minimo {quantity(item.min_quantity ?? 0)}
          </AlertBadge>
        )}
      />

      <Group
        title="Garanzie già scadute"
        icon="history"
        description="Storico: utile per capire l'età di quello che possiedi."
        items={warrantyExpired.data?.items ?? []}
        loading={warrantyExpired.isLoading}
        emptyText="Nessuna garanzia scaduta registrata."
        render={(item) => (
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <span className="small muted num hide-sm">{money(item.purchase_price, item.currency)}</span>
            <span className="badge">scaduta il {date(item.warranty.end)}</span>
          </div>
        )}
      />
    </div>
  );
}
