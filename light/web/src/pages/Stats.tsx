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
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import type { Bucket } from '../lib/types.ts';
import { money, moneyShort, monthLabel, number } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui.tsx';

function BarList({ buckets, currency, emptyText }: { buckets: Bucket[]; currency: string; emptyText: string }) {
  const max = Math.max(...buckets.map((b) => b.value), 1);
  if (buckets.length === 0) return <p className="small muted">{emptyText}</p>;

  return (
    <div className="bar-list">
      {buckets.map((bucket) => (
        <div key={bucket.key} className="bar-row">
          <span className="truncate" title={bucket.label}>
            {bucket.label}
          </span>
          <span className="bar-track" role="img" aria-label={`${bucket.label}: ${money(bucket.value, currency)}`}>
            <span className="bar-fill" style={{ width: `${Math.max((bucket.value / max) * 100, bucket.value > 0 ? 2 : 0)}%` }} />
          </span>
          <span className="num muted" style={{ minWidth: 78, textAlign: 'right' }}>
            {money(bucket.value, currency)}
            <span className="xs faint"> · {bucket.items}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const [months, setMonths] = useState(12);
  const stats = useQuery({ queryKey: ['stats', months], queryFn: () => api.stats(months) });

  if (stats.error) {
    return (
      <div className="page">
        <ErrorBox error={stats.error} onRetry={() => void stats.refetch()} />
      </div>
    );
  }

  if (stats.isLoading || !stats.data) {
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

  const data = stats.data;
  const currency = data.currency;
  const maxMonth = Math.max(...data.by_month.map((m) => m.value), 1);
  const monthTotal = data.by_month.reduce((sum, m) => sum + m.value, 0);
  const monthAverage = data.by_month.length > 0 ? monthTotal / data.by_month.length : 0;

  if (data.totals.items === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <div className="page-title">
            <h1>Statistiche</h1>
          </div>
        </header>
        <div className="panel">
          <EmptyState
            icon="chart"
            title="Ancora nessun dato da analizzare"
            description="Le statistiche compaiono quando ci sono oggetti con un prezzo di acquisto. Bastano pochi record per iniziare a vedere dove va la spesa."
            action={
              <Link to="/inventario" className="btn btn-primary">
                Vai all’inventario
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Statistiche</h1>
          <p className="muted">
            Valore dell’inventario e spesa sostenuta. Gli importi considerano solo gli oggetti che possiedi davvero.
          </p>
        </div>
      </header>

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-value">{money(data.totals.value, currency)}</span>
          <span className="stat-label">Valore di acquisto</span>
        </div>
        <div className="stat">
          <span className="stat-value">{money(data.totals.current_value, currency)}</span>
          <span className="stat-label">Valore attuale stimato</span>
        </div>
        <div className="stat">
          <span className="stat-value">{number(data.totals.items)}</span>
          <span className="stat-label">Oggetti posseduti</span>
        </div>
        <div className="stat">
          <span className="stat-value">{number(data.totals.units)}</span>
          <span className="stat-label">Pezzi</span>
        </div>
        <div className="stat">
          <span className="stat-value">{number(data.totals.without_price)}</span>
          <span className="stat-label">Senza prezzo indicato</span>
        </div>
      </div>

      {data.totals.without_price > 0 ? (
        <p className="small muted row" style={{ gap: 6 }}>
          <Icon name="info" size={14} />
          {data.totals.without_price} oggetti non hanno un prezzo: il valore totale è quindi una stima per difetto.{' '}
          <Link to="/inventario?sort=purchase_price&direction=asc" style={{ color: 'var(--accent-ink)' }}>
            Completali
          </Link>
        </p>
      ) : null}

      {/* --- Spesa nel tempo ---------------------------------------------- */}
      <section className="panel">
        <header className="panel-header">
          <div className="col" style={{ gap: 0 }}>
            <h3 className="panel-title">Spesa mensile</h3>
            <span className="xs muted">
              Media {money(monthAverage, currency)} al mese · totale periodo {money(monthTotal, currency)}
            </span>
          </div>
          <div className="row">
            {[6, 12, 24].map((value) => (
              <button key={value} type="button" className={`chip${months === value ? ' active' : ''}`} onClick={() => setMonths(value)}>
                {value} mesi
              </button>
            ))}
          </div>
        </header>
        <div className="panel-body">
          <div className="column-chart">
            {data.by_month.map((month) => (
              <div
                key={month.month}
                className="column"
                title={`${monthLabel(month.month)}: ${money(month.value, currency)} · ${month.items} oggetti`}
              >
                {/* La riga del valore esiste sempre, anche vuota: se comparisse
                    solo sulla colonna più alta le ruberebbe spazio, e il mese
                    record verrebbe disegnato più basso degli altri. */}
                <span className="column-value">
                  {month.value === maxMonth && month.value > 0 ? moneyShort(month.value, currency) : null}
                </span>
                <span className="column-track">
                  <span
                    className={`column-bar${month.value === 0 ? ' empty-month' : ''}`}
                    style={{ height: `${month.value === 0 ? 2 : Math.max((month.value / maxMonth) * 100, 3)}%` }}
                    role="img"
                    aria-label={`${monthLabel(month.month)}: ${money(month.value, currency)}`}
                  />
                </span>
                <span className="column-label">{monthLabel(month.month)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Classifiche ---------------------------------------------------- */}
      <div className="panel-grid">
        <section className="panel">
          <header className="panel-header">
            <div className="col" style={{ gap: 0 }}>
              <h3 className="panel-title">Spesa per categoria</h3>
              <span className="xs muted">le sottocategorie confluiscono nella radice</span>
            </div>
          </header>
          <div className="panel-body">
            <BarList buckets={data.by_category} currency={currency} emptyText="Nessuna categoria con oggetti valorizzati." />
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <div className="col" style={{ gap: 0 }}>
              <h3 className="panel-title">Valore per stanza</h3>
              <span className="xs muted">mobili e contenitori confluiscono nella stanza</span>
            </div>
          </header>
          <div className="panel-body">
            <BarList buckets={data.by_room} currency={currency} emptyText="Nessun oggetto ha una posizione assegnata." />
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3 className="panel-title">Spesa per negozio</h3>
          </header>
          <div className="panel-body">
            <BarList buckets={data.by_vendor} currency={currency} emptyText="Nessun negozio registrato sugli acquisti." />
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3 className="panel-title">Oggetti per stato</h3>
          </header>
          <div className="panel-body">
            <div className="bar-list">
              {data.by_status.map((bucket) => {
                const maxItems = Math.max(...data.by_status.map((b) => b.items), 1);
                return (
                  <div key={bucket.key} className="bar-row">
                    <span className="truncate">{bucket.label}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${Math.max((bucket.items / maxItems) * 100, 2)}%` }} />
                    </span>
                    <span className="num muted" style={{ minWidth: 78, textAlign: 'right' }}>
                      {bucket.items} oggetti
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* --- Oggetti di maggior valore ------------------------------------- */}
      <section className="panel">
        <header className="panel-header">
          <h3 className="panel-title">Oggetti di maggior valore</h3>
        </header>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Oggetto</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Valore</th>
              </tr>
            </thead>
            <tbody>
              {data.top_items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/oggetti/${item.id}`} style={{ fontWeight: 550 }}>
                      {item.name}
                    </Link>
                  </td>
                  <td className="muted">{item.category ?? '—'}</td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {money(item.value, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
