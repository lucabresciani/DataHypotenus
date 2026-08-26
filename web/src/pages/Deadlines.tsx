/**
 * Scadenze e garanzie: le cose che hanno una data che si avvicina.
 * Quattro gruppi, ordinati per urgenza reale, ognuno con l'azione che serve.
 *
 * Le finestre di avviso sono quelle scelte in Impostazioni: erano fisse a 120 e
 * 60 giorni, quindi cambiare la preferenza non cambiava questa pagina, che e'
 * proprio quella che dovrebbe rispettarla.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { api } from '@/lib/api.ts';
import type { Item } from '@/lib/types.ts';
import { date, daysPhrase, money, plural, quantity } from '@/lib/format.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { AlertBadge, EmptyState, ErrorState, LoadingRows, Page, PageHeader } from '@/components/patterns.tsx';

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
    <section className="flex flex-col">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pb-2.5">
        <span className="flex items-center gap-2">
          <Icon name={icon} size={15} className="text-faint" />
          <h2 className="text-md font-semibold">{title}</h2>
          {items.length > 0 ? (
            <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-2xs text-muted-foreground tabular-nums">
              {items.length}
            </span>
          ) : null}
        </span>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="border-t border-border">
        {loading ? (
          <LoadingRows rows={3} height={44} className="pt-3" />
        ) : items.length === 0 ? (
          <p className="px-1 py-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2.5">
                <Link
                  to={`/oggetti/${item.id}`}
                  className="flex min-w-0 flex-1 flex-col outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[item.location?.path, item.brand].filter(Boolean).join(' · ') || 'Senza posizione'}
                  </span>
                </Link>
                {render(item)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function DeadlinesPage() {
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
    <Page>
      <PageHeader title="Scadenze e garanzie" description="Tutto ciò che ha una data in avvicinamento, in un posto solo." />

      {anyError ? <ErrorState error={anyError} onRetry={() => void warrantyExpiring.refetch()} /> : null}

      {nothing ? (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon="check"
            title="Niente in scadenza"
            description="Nessuna garanzia sta per finire, nessun prodotto è in scadenza e le scorte sono a posto."
          />
        </div>
      ) : (
        <>
          <Group
            title="Garanzie in scadenza"
            icon="shield"
            description={`Entro ${plural(warrantyDays, 'giorno', 'giorni')}: il momento giusto per verificare che la ricevuta ci sia.`}
            items={warrantyExpiring.data?.items ?? []}
            loading={warrantyExpiring.isLoading}
            emptyText={`Nessuna garanzia in scadenza nei prossimi ${plural(warrantyDays, 'giorno', 'giorni')}.`}
            render={(item) => (
              <>
                {item.attachment_count === 0 ? (
                  <AlertBadge tone="neutral" icon="file">
                    Nessun documento
                  </AlertBadge>
                ) : null}
                <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">{date(item.warranty.end)}</span>
                <AlertBadge tone="warn">{daysPhrase(item.warranty.days_left, true)}</AlertBadge>
              </>
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
              <>
                <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                  {quantity(item.quantity, item.unit)}
                </span>
                <AlertBadge tone={item.expiration_status === 'expired' ? 'danger' : 'warn'}>
                  {item.expiration_status === 'expired'
                    ? `Scaduto il ${date(item.expiration_date)}`
                    : date(item.expiration_date)}
                </AlertBadge>
              </>
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
            description="Storico: utile per capire l’età di quello che possiedi."
            items={warrantyExpired.data?.items ?? []}
            loading={warrantyExpired.isLoading}
            emptyText="Nessuna garanzia scaduta registrata."
            render={(item) => (
              <>
                <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                  {money(item.purchase_price, item.currency)}
                </span>
                <AlertBadge tone="neutral">scaduta il {date(item.warranty.end)}</AlertBadge>
              </>
            )}
          />
        </>
      )}
    </Page>
  );
}
