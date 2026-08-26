/**
 * Dashboard: deve rispondere in cinque secondi a "come sta la casa".
 * Ogni riquadro corrisponde a una decisione possibile (comprare, controllare,
 * riordinare); niente numeri decorativi.
 *
 * Impaginazione: una riga di registro con i totali, la riga degli avvisi solo
 * se c'e' qualcosa da segnalare, poi tre colonne di elenchi separati da
 * filetti. Nessuna scatola dentro un'altra scatola.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import type { Item } from '@/lib/types.ts';
import { cn } from '@/lib/utils';
import { daysPhrase, date, money, moneyShort, plural, quantity, relativeTime } from '@/lib/format.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { AlertBadge, EmptyState, ErrorState, LoadingRows, Page, PageHeader, Thumb } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';

/* --- Riga di registro: i numeri che si guardano per primi ------------------ */

function Ledger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6',
        className,
      )}
    >
      {children}
    </dl>
  );
}

function LedgerCell({ value, label, tone }: { value: string; label: string; tone?: 'accent' }) {
  return (
    <div className="flex flex-col gap-0.5 bg-background px-4 py-3.5">
      <dd className={cn('text-xl font-semibold tracking-[-0.02em] tabular-nums', tone === 'accent' && 'text-primary-ink')}>
        {value}
      </dd>
      <dt className="text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}

/* --- Elenco compatto ------------------------------------------------------ */

function Panel({
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
    /* `break-inside-avoid`: i riquadri scorrono a colonne e si impacchettano da
       soli, invece di allinearsi in righe lasciando buchi sotto quelli corti. */
    <section className="mb-8 flex min-w-0 break-inside-avoid flex-col">
      <header className="flex items-center gap-2 pb-2.5">
        <Icon name={icon} size={15} className="text-faint" />
        <h2 className="text-base font-semibold">{title}</h2>
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-secondary px-1.5 py-px font-mono text-2xs text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
        {href ? (
          <Button variant="ghost" size="sm" asChild className="-mr-2 ml-auto">
            <Link to={href}>
              Vedi tutto
              <Icon name="chevron" size={14} />
            </Link>
          </Button>
        ) : null}
      </header>
      <div className="border-t border-border">{children}</div>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-4 text-sm text-muted-foreground">{children}</p>;
}

function ItemLine({ item, right }: { item: Item; right?: React.ReactNode }) {
  return (
    <Link
      to={`/oggetti/${item.id}`}
      className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors duration-150 outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <Thumb photoId={item.primary_photo_id} size={30} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{item.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {item.location?.path ?? item.category?.path ?? 'Senza posizione'}
        </span>
      </span>
      {right}
    </Link>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y divide-border pt-1">{children}</div>;
}

/* --- Pagina --------------------------------------------------------------- */

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });

  if (error) {
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }

  if (isLoading || !data) {
    return (
      <Page>
        <LoadingRows rows={1} height={92} />
        <LoadingRows rows={4} height={64} />
      </Page>
    );
  }

  const { totals, spending } = data;
  const currency = totals.currency;
  const empty = totals.items === 0;

  const alerts = [
    data.low_stock.count > 0
      ? { to: '/inventario?below_min=1', icon: 'alert' as const, label: `${data.low_stock.count} sotto scorta`, tone: 'warn' as const }
      : null,
    data.warranties.expiring_count > 0
      ? {
          to: '/scadenze',
          icon: 'shield' as const,
          label: plural(data.warranties.expiring_count, 'garanzia in scadenza', 'garanzie in scadenza'),
          tone: 'warn' as const,
        }
      : null,
    data.expirations.expiring_count > 0
      ? {
          to: '/scadenze',
          icon: 'clock' as const,
          label: plural(data.expirations.expiring_count, 'scadenza vicina', 'scadenze vicine'),
          tone: 'warn' as const,
        }
      : null,
    data.expirations.expired_count > 0
      ? {
          to: '/scadenze',
          icon: 'alert' as const,
          label: plural(data.expirations.expired_count, 'già scaduto', 'già scaduti'),
          tone: 'danger' as const,
        }
      : null,
  ].filter((entry) => entry !== null);

  return (
    <Page>
      <PageHeader
        title="La tua casa"
        description={
          empty
            ? 'Inventario ancora vuoto: si comincia aggiungendo il primo oggetto.'
            : `${plural(totals.items, 'oggetto catalogato', 'oggetti catalogati')} in ${plural(totals.rooms, 'stanza', 'stanze')}.`
        }
      />

      {empty ? (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon="box"
            title="Nessun oggetto ancora registrato"
            description="Aggiungi il primo oggetto con il pulsante in alto a destra, oppure importa un file CSV se hai già un elenco da qualche parte."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" asChild>
                  <Link to="/impostazioni?sezione=dati">
                    <Icon name="upload" size={15} /> Importa un CSV
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/posizioni">
                    <Icon name="pin" size={15} /> Prepara le stanze
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <Ledger>
            <LedgerCell value={String(totals.items)} label="Oggetti" />
            <LedgerCell value={quantity(totals.units)} label="Pezzi totali" />
            <LedgerCell value={moneyShort(totals.inventory_value, currency)} label="Valore inventario" tone="accent" />
            <LedgerCell value={moneyShort(spending.this_month, currency)} label="Speso questo mese" />
            <LedgerCell value={String(totals.rooms)} label="Stanze" />
            <LedgerCell value={String(totals.containers)} label="Contenitori" />
          </Ledger>

          {alerts.length > 0 ? (
            <div className="-mt-4 flex flex-wrap gap-2">
              {alerts.map((alert) => (
                <Link
                  key={alert.label}
                  to={alert.to}
                  className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <AlertBadge tone={alert.tone} icon={alert.icon} className="px-2.5 py-1 hover:brightness-[0.97]">
                    {alert.label}
                  </AlertBadge>
                </Link>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="gap-x-10 lg:columns-2 xl:columns-3">
        <Panel title="Da comprare" icon="cart" count={data.to_buy.count} href="/acquisti">
          {data.to_buy.items.length === 0 ? (
            <Quiet>Niente in lista. Quando un consumabile scende sotto la soglia lo trovi qui.</Quiet>
          ) : (
            <>
              <Rows>
                {data.to_buy.items.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-1 py-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{entry.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {quantity(entry.desired_quantity, entry.unit)}
                        {entry.category_path ? ` · ${entry.category_path}` : ''}
                      </span>
                    </span>
                    {entry.priority === 'urgente' || entry.priority === 'alta' ? (
                      <AlertBadge tone={entry.priority === 'urgente' ? 'danger' : 'warn'}>{entry.priority}</AlertBadge>
                    ) : null}
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {money(entry.estimated_total, entry.currency)}
                    </span>
                  </div>
                ))}
              </Rows>
              <div className="mt-1 flex items-center justify-between border-t border-border px-1 pt-2.5">
                <span className="text-sm text-muted-foreground">Spesa stimata</span>
                <strong className="tabular-nums">{money(data.to_buy.estimated_total, currency)}</strong>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Scorte in esaurimento" icon="alert" count={data.low_stock.count} href="/inventario?below_min=1">
          {data.low_stock.items.length === 0 ? (
            <Quiet>Tutti i consumabili sono sopra la soglia minima.</Quiet>
          ) : (
            <Rows>
              {data.low_stock.items.map((item) => (
                <ItemLine
                  key={item.id}
                  item={item}
                  right={
                    <AlertBadge tone="warn" icon="alert">
                      {quantity(item.quantity, item.unit)} · min {quantity(item.min_quantity ?? 0)}
                    </AlertBadge>
                  }
                />
              ))}
            </Rows>
          )}
        </Panel>

        <Panel title="Garanzie in scadenza" icon="shield" count={data.warranties.expiring_count} href="/scadenze">
          {data.warranties.items.length === 0 ? (
            <Quiet>
              Nessuna garanzia in scadenza a breve
              {data.warranties.expired_count > 0
                ? ` (${plural(data.warranties.expired_count, 'già scaduta', 'già scadute')}).`
                : '.'}
            </Quiet>
          ) : (
            <Rows>
              {data.warranties.items.map((item) => (
                <ItemLine
                  key={item.id}
                  item={item}
                  right={<AlertBadge tone="warn">{daysPhrase(item.warranty.days_left, true)}</AlertBadge>}
                />
              ))}
            </Rows>
          )}
        </Panel>

        <Panel title="Scadenze imminenti" icon="clock" count={data.expirations.expiring_count} href="/scadenze">
          {data.expirations.items.length === 0 ? (
            <Quiet>Nessun prodotto in scadenza nei prossimi giorni.</Quiet>
          ) : (
            <Rows>
              {data.expirations.items.map((item) => (
                <ItemLine
                  key={item.id}
                  item={item}
                  right={
                    <AlertBadge tone={item.expiration_status === 'expired' ? 'danger' : 'warn'}>
                      {date(item.expiration_date)}
                    </AlertBadge>
                  }
                />
              ))}
            </Rows>
          )}
        </Panel>

        <Panel title="Aggiunti di recente" icon="plus" href="/inventario?sort=created_at">
          {data.recent_added.length === 0 ? (
            <Quiet>Ancora nulla in inventario.</Quiet>
          ) : (
            <Rows>
              {data.recent_added.map((item) => (
                <ItemLine
                  key={item.id}
                  item={item}
                  right={<span className="text-xs text-faint whitespace-nowrap">{relativeTime(item.created_at)}</span>}
                />
              ))}
            </Rows>
          )}
        </Panel>

        <Panel title="Modificati di recente" icon="history" href="/inventario?sort=updated_at">
          {data.recent_updated.length === 0 ? (
            <Quiet>Nessuna modifica registrata.</Quiet>
          ) : (
            <Rows>
              {data.recent_updated.map((item) => (
                <ItemLine
                  key={item.id}
                  item={item}
                  right={<span className="text-xs text-faint whitespace-nowrap">{relativeTime(item.updated_at)}</span>}
                />
              ))}
            </Rows>
          )}
        </Panel>
      </div>

      <section className="flex flex-col">
        <header className="flex items-center gap-2 pb-2.5">
          <Icon name="chart" size={15} className="text-faint" />
          <h2 className="text-base font-semibold">Spesa per la casa</h2>
          <Button variant="ghost" size="sm" asChild className="-mr-2 ml-auto">
            <Link to="/statistiche">
              Statistiche
              <Icon name="chevron" size={14} />
            </Link>
          </Button>
        </header>
        <Ledger className="lg:grid-cols-4">
          <LedgerCell value={money(spending.last_30_days, currency)} label="Ultimi 30 giorni" />
          <LedgerCell value={money(spending.this_month, currency)} label="Mese corrente" />
          <LedgerCell value={money(spending.this_year, currency)} label="Anno corrente" />
          <LedgerCell value={money(spending.total, currency)} label="Totale registrato" />
        </Ledger>
      </section>
    </Page>
  );
}
