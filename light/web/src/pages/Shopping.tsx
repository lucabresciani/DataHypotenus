/**
 * Lista acquisti: cosa manca ancora in casa, con priorita' e spesa stimata.
 * Il passaggio "l'ho comprato" crea l'oggetto nell'inventario in un clic.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { PRIORITIES, SHOPPING_STATUS_LABELS, type Priority, type ShoppingItem, type ShoppingStatus } from '../lib/types.ts';
import { date, money, quantity } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Field, Modal, Skeleton, useToast } from '../components/ui.tsx';

type FormState = {
  id?: number;
  name: string;
  desired_quantity: string;
  unit: string;
  estimated_price: string;
  priority: Priority;
  category_id: string;
  location_id: string;
  url: string;
  notes: string;
};

const blank = (): FormState => ({
  name: '',
  desired_quantity: '1',
  unit: 'pz',
  estimated_price: '',
  priority: 'media',
  category_id: '',
  location_id: '',
  url: '',
  notes: '',
});

const PRIORITY_TONE: Record<Priority, string> = {
  urgente: 'danger',
  alta: 'warn',
  media: '',
  bassa: '',
};

export function ShoppingPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState<ShoppingStatus | ''>('da_comprare');
  const [form, setForm] = useState<FormState | null>(null);
  const [converting, setConverting] = useState<ShoppingItem | null>(null);
  const [deleting, setDeleting] = useState<ShoppingItem | null>(null);

  const shopping = useQuery({
    queryKey: ['shopping', statusFilter],
    queryFn: () => api.shopping(statusFilter ? { status: statusFilter } : {}),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['shopping'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
  };

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        name: state.name,
        desired_quantity: Number(state.desired_quantity.replace(',', '.')) || 1,
        unit: state.unit || 'pz',
        estimated_price: state.estimated_price ? Number(state.estimated_price.replace(',', '.')) : null,
        priority: state.priority,
        category_id: state.category_id ? Number(state.category_id) : null,
        location_id: state.location_id ? Number(state.location_id) : null,
        url: state.url || null,
        notes: state.notes || null,
      };
      return state.id ? api.updateShopping(state.id, payload) : api.createShopping(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Lista aggiornata');
      setForm(null);
    },
    onError: (error) => toast.fail(error, 'Salvataggio non riuscito'),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ShoppingStatus }) => api.updateShopping(id, { status }),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const convert = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number | null }) =>
      api.convertShopping(id, price === null ? {} : { purchase_price: price }),
    onSuccess: (result) => {
      invalidate();
      toast.success(`"${result.item.name}" è ora nell’inventario`);
      setConverting(null);
    },
    onError: (error) => toast.fail(error, 'Conversione non riuscita'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteShopping(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
    onError: (error) => toast.fail(error),
  });

  const items = shopping.data?.items ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Acquisti</h1>
          <p className="muted">
            {items.length} elementi in lista
            {shopping.data && shopping.data.estimated_total > 0 ? ` · ${money(shopping.data.estimated_total)} stimati` : ''}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm(blank())}>
          <Icon name="plus" size={15} /> Aggiungi alla lista
        </button>
      </header>

      <div className="filter-bar">
        {([
          ['da_comprare', 'Da comprare'],
          ['ordinato', 'Ordinati'],
          ['acquistato', 'Acquistati'],
          ['annullato', 'Annullati'],
          ['', 'Tutti'],
        ] as Array<[ShoppingStatus | '', string]>).map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            className={`chip${statusFilter === value ? ' active' : ''}`}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {shopping.error ? <ErrorBox error={shopping.error} onRetry={() => void shopping.refetch()} /> : null}

      <section className="panel">
        {shopping.isLoading ? (
          <Skeleton rows={4} height={48} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="cart"
            title="Lista vuota"
            description="Aggiungi qui le cose che ancora mancano. Quando le compri, diventano oggetti dell’inventario con un clic, mantenendo prezzo e categoria."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setForm(blank())}>
                Aggiungi il primo elemento
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cosa</th>
                  <th>Priorità</th>
                  <th>Quantità</th>
                  <th>Stima</th>
                  <th>Stato</th>
                  <th aria-label="Azioni" />
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="col" style={{ gap: 0 }}>
                        <span style={{ fontWeight: 550 }}>
                          {entry.name}
                          {entry.url ? (
                            <a href={entry.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: 'var(--accent-ink)' }}>
                              <Icon name="external" size={12} />
                            </a>
                          ) : null}
                        </span>
                        <span className="xs muted">
                          {[entry.category_path, entry.location_path].filter(Boolean).join(' → ') || 'Senza categoria'}
                          {entry.source_item_id ? ' · riacquisto' : ''}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${PRIORITY_TONE[entry.priority]}`}>{entry.priority}</span>
                    </td>
                    <td className="num">{quantity(entry.desired_quantity, entry.unit)}</td>
                    <td className="num">{money(entry.estimated_total, entry.currency)}</td>
                    <td>
                      {entry.item_id ? (
                        <Link to={`/oggetti/${entry.item_id}`} className="badge ok">
                          <Icon name="check" size={11} /> Nell inventario
                        </Link>
                      ) : (
                        <select
                          className="select btn-sm"
                          value={entry.status}
                          onChange={(e) => changeStatus.mutate({ id: entry.id, status: e.target.value as ShoppingStatus })}
                          aria-label={`Stato di ${entry.name}`}
                        >
                          {Object.entries(SHOPPING_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                      {entry.purchased_at ? <div className="xs faint">{date(entry.purchased_at)}</div> : null}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                        {!entry.item_id ? (
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => setConverting(entry)}>
                            L’ho comprato
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost"
                          aria-label={`Modifica ${entry.name}`}
                          onClick={() =>
                            setForm({
                              id: entry.id,
                              name: entry.name,
                              desired_quantity: String(entry.desired_quantity),
                              unit: entry.unit,
                              estimated_price: entry.estimated_price === null ? '' : String(entry.estimated_price),
                              priority: entry.priority,
                              category_id: entry.category_id ? String(entry.category_id) : '',
                              location_id: entry.location_id ? String(entry.location_id) : '',
                              url: entry.url ?? '',
                              notes: entry.notes ?? '',
                            })
                          }
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost"
                          aria-label={`Elimina ${entry.name}`}
                          onClick={() => setDeleting(entry)}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form ? (
        <Modal
          title={form.id ? 'Modifica elemento' : 'Nuovo elemento in lista'}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Annulla
              </button>
              <button
                type="button"
                className={`btn btn-primary${save.isPending ? ' loading' : ''}`}
                onClick={() => save.mutate(form)}
                disabled={!form.name.trim() || save.isPending}
              >
                Salva
              </button>
            </>
          }
        >
          <div className="modal-body">
            <Field label="Cosa serve">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Es. Set di pentole"
                autoFocus
              />
            </Field>

            <div className="form-grid">
              <Field label="Quantità">
                <div className="row">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step="any"
                    value={form.desired_quantity}
                    onChange={(e) => setForm({ ...form, desired_quantity: e.target.value })}
                    style={{ maxWidth: 90 }}
                  />
                  <input
                    className="input"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    aria-label="Unità"
                    style={{ maxWidth: 80 }}
                  />
                </div>
              </Field>

              <Field label="Prezzo stimato (unitario)">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.estimated_price}
                  onChange={(e) => setForm({ ...form, estimated_price: e.target.value })}
                  placeholder="0,00"
                />
              </Field>

              <Field label="Priorità">
                <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Categoria">
                <select className="select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Nessuna</option>
                  {(categories.data?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.path}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Destinazione prevista">
                <select className="select" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                  <option value="">Nessuna</option>
                  {(locations.data?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Link">
              <input className="input" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
            </Field>

            <Field label="Note">
              <textarea className="textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      ) : null}

      {converting ? (
        <ConvertDialog
          entry={converting}
          onClose={() => setConverting(null)}
          onConfirm={(price) => convert.mutateAsync({ id: converting.id, price })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Togliere "${deleting.name}" dalla lista?`}
          message="L’elemento viene eliminato dalla lista acquisti. Gli oggetti già creati nell’inventario restano."
          confirmLabel="Elimina"
          destructive
          onConfirm={() => remove.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

/** Conferma dell'acquisto: unica occasione per correggere il prezzo reale. */
function ConvertDialog({
  entry,
  onClose,
  onConfirm,
}: {
  entry: ShoppingItem;
  onClose: () => void;
  onConfirm: (price: number | null) => Promise<unknown>;
}) {
  const [price, setPrice] = useState(entry.estimated_price === null ? '' : String(entry.estimated_price));
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(price.trim() === '' ? null : Number(price.replace(',', '.')));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Hai comprato "${entry.name}"`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className={`btn btn-primary${busy ? ' loading' : ''}`} onClick={confirm} disabled={busy}>
            Aggiungi all’inventario
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p className="muted">
          Verrà creato un oggetto nell’inventario con quantità {quantity(entry.desired_quantity, entry.unit)}
          {entry.location_path ? `, posizione ${entry.location_path}` : ''}, con la data di oggi.
        </p>
        <Field label="Prezzo effettivo (unitario)" hint="Modificalo se hai speso diversamente dalla stima">
          <input className="input" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
        </Field>
        {entry.source_item_id ? (
          <p className="small muted row" style={{ gap: 6 }}>
            <Icon name="info" size={14} />
            La scorta dell’oggetto originale verrà ricaricata automaticamente.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
