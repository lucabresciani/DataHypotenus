/**
 * Statistiche: quanto sto spendendo per la casa, e dove finisce.
 *
 * Scelte di visualizzazione:
 * - Le classifiche (categoria, stanza, negozio) sono barre orizzontali a serie
 *   singola: l'identita' la porta l'etichetta di testo, quindi serve UN solo
 *   colore, non una tavolozza. Niente torte: confrontare angoli e' peggio che
 *   confrontare lunghezze.
 * - La spesa mensile e' a colonne perche' il tempo scorre in orizzontale, e la
 *   serie e' continua: i mesi senza acquisti restano visibili a zero.
 * - Nessun doppio asse: dove servirebbero due scale, ci sono due grafici.
 * - Ogni barra e' anche un `role="img"` con etichetta: chi non vede la lunghezza
 *   sente comunque il valore.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import type { Bucket } from '@/lib/types.ts';
import { money, moneyShort, monthLabel, number, plural } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, LoadingRows, Page, PageHeader, Section } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function BarRow({ label, valueText, ratio, ariaLabel }: { label: string; valueText: React.ReactNode; ratio: number; ariaLabel: string }) {
  return (
    <div className="grid grid-cols-[minmax(5.5rem,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="block h-2 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={ariaLabel}>
        <span
          className="block h-full rounded-full bg-chart-1 transition-[width] duration-500 ease-[var(--ease-out-quint)]"
          style={{ width: `${ratio}%` }}
        />
      </span>
      <span className="text-right tabular-nums">{valueText}</span>
    </div>
  );
}

function BarList({ buckets, currency, emptyText }: { buckets: Bucket[]; currency: string; emptyText: string }) {
  if (buckets.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <div className="flex flex-col gap-3">
      {buckets.map((bucket) => (
        <BarRow
          key={bucket.key}
          label={bucket.label}
          ratio={Math.max((bucket.value / max) * 100, bucket.value > 0 ? 2 : 0)}
          ariaLabel={`${bucket.label}: ${money(bucket.value, currency)}`}
          valueText={
            <>
              {money(bucket.value, currency)}
              <span className="pl-1 text-xs text-faint">· {bucket.items}</span>
            </>
          }
        />
      ))}
    </div>
  );
}

export function StatsPage() {
  const [months, setMonths] = useState(12);
  const stats = useQuery({ queryKey: ['stats', months], queryFn: () => api.stats(months) });

  if (stats.error) {
    return (
      <Page>
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      </Page>
    );
  }

  if (stats.isLoading || !stats.data) {
    return (
      <Page>
        <LoadingRows rows={1} height={92} />
        <LoadingRows rows={3} height={120} />
      </Page>
    );
  }

  const data = stats.data;
  const currency = data.currency;
  const maxMonth = Math.max(...data.by_month.map((month) => month.value), 1);
  const monthTotal = data.by_month.reduce((sum, month) => sum + month.value, 0);
  const monthAverage = data.by_month.length > 0 ? monthTotal / data.by_month.length : 0;
  const maxStatusItems = Math.max(...data.by_status.map((bucket) => bucket.items), 1);

  if (data.totals.items === 0) {
    return (
      <Page>
        <PageHeader title="Statistiche" />
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            icon="chart"
            title="Ancora nessun dato da analizzare"
            description="Le statistiche compaiono quando ci sono oggetti con un prezzo di acquisto. Bastano pochi record per iniziare a vedere dove va la spesa."
            action={
              <Button asChild>
                <Link to="/inventario">Vai all’inventario</Link>
              </Button>
            }
          />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Statistiche"
        description="Valore dell’inventario e spesa sostenuta. Gli importi considerano solo gli oggetti che possiedi davvero."
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
        {[
          { value: money(data.totals.value, currency), label: 'Valore di acquisto', accent: true },
          { value: money(data.totals.current_value, currency), label: 'Valore attuale stimato' },
          { value: number(data.totals.items), label: 'Oggetti posseduti' },
          { value: number(data.totals.units), label: 'Pezzi' },
          { value: number(data.totals.without_price), label: 'Senza prezzo indicato' },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-0.5 bg-background px-4 py-3.5">
            <dd className={cn('text-xl font-semibold tracking-[-0.02em] tabular-nums', cell.accent && 'text-primary-ink')}>
              {cell.value}
            </dd>
            <dt className="text-sm text-muted-foreground">{cell.label}</dt>
          </div>
        ))}
      </dl>

      {data.totals.without_price > 0 ? (
        <p className="-mt-4 text-sm text-muted-foreground">
          {plural(data.totals.without_price, 'oggetto non ha', 'oggetti non hanno')} un prezzo: il valore totale è quindi una
          stima per difetto.{' '}
          <Link to="/inventario?sort=purchase_price&direction=asc" className="text-primary-ink hover:underline">
            Completali
          </Link>
        </p>
      ) : null}

      {/* --- Spesa nel tempo ---------------------------------------------- */}
      <Section
        title="Spesa mensile"
        description={`Media ${money(monthAverage, currency)} al mese · totale periodo ${money(monthTotal, currency)}`}
        actions={
          <div className="flex gap-1.5">
            {[6, 12, 24].map((value) => (
              <Button
                key={value}
                variant={months === value ? 'default' : 'outline'}
                size="sm"
                aria-pressed={months === value}
                onClick={() => setMonths(value)}
              >
                {value} mesi
              </Button>
            ))}
          </div>
        }
      >
        {/* Tre fasce di altezza fissa: valore, barra, mese. La barra e' alta una
            percentuale della SUA fascia, quindi tutte le colonne condividono la
            stessa scala anche quando una sola porta l'etichetta del valore. */}
        <div className="grid h-52 auto-cols-[minmax(0,1fr)] grid-flow-col items-stretch gap-2">
          {data.by_month.map((month) => (
            <div
              key={month.month}
              className="grid h-full min-w-0 grid-rows-[1rem_minmax(0,1fr)_auto] justify-items-center gap-2"
              title={`${monthLabel(month.month)}: ${money(month.value, currency)} · ${plural(month.items, 'oggetto', 'oggetti')}`}
            >
              <span className="text-2xs whitespace-nowrap text-faint tabular-nums">
                {month.value === maxMonth && month.value > 0 ? moneyShort(month.value, currency) : null}
              </span>
              <span className="flex h-full w-full items-end justify-center">
                <span
                  role="img"
                  aria-label={`${monthLabel(month.month)}: ${money(month.value, currency)}`}
                  className={cn(
                    'w-full max-w-11 rounded-t-[4px] transition-[height] duration-500 ease-[var(--ease-out-quint)]',
                    month.value === 0 ? 'bg-surface-sunken' : 'bg-chart-1',
                  )}
                  style={{ height: `${month.value === 0 ? 2 : Math.max((month.value / maxMonth) * 100, 3)}%` }}
                />
              </span>
              <span className="text-2xs whitespace-nowrap text-faint">{monthLabel(month.month)}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* --- Classifiche ---------------------------------------------------- */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section title="Spesa per categoria" description="Le sottocategorie confluiscono nella radice.">
          <BarList buckets={data.by_category} currency={currency} emptyText="Nessuna categoria con oggetti valorizzati." />
        </Section>

        <Section title="Valore per stanza" description="Mobili e contenitori confluiscono nella stanza.">
          <BarList buckets={data.by_room} currency={currency} emptyText="Nessun oggetto ha una posizione assegnata." />
        </Section>

        <Section title="Spesa per negozio">
          <BarList buckets={data.by_vendor} currency={currency} emptyText="Nessun negozio registrato sugli acquisti." />
        </Section>

        <Section title="Oggetti per stato">
          <div className="flex flex-col gap-3">
            {data.by_status.map((bucket) => (
              <BarRow
                key={bucket.key}
                label={bucket.label}
                ratio={Math.max((bucket.items / maxStatusItems) * 100, 2)}
                ariaLabel={`${bucket.label}: ${plural(bucket.items, 'oggetto', 'oggetti')}`}
                valueText={plural(bucket.items, 'oggetto', 'oggetti')}
              />
            ))}
          </div>
        </Section>
      </div>

      {/* --- Oggetti di maggior valore ------------------------------------- */}
      <Section title="Oggetti di maggior valore" bare>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oggetto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valore</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.top_items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link to={`/oggetti/${item.id}`} className="font-medium hover:text-primary-ink">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.category ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.value, item.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </Page>
  );
}
