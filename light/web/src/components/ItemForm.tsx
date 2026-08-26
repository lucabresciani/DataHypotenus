/**
 * Modulo di creazione/modifica di un oggetto.
 *
 * Regola di UX: la prima schermata chiede solo cio' che serve davvero
 * (nome, categoria, quantita', posizione). Tutto il resto sta in sezioni
 * richiudibili, che si aprono da sole quando l'oggetto ha gia' quei dati.
 * Registrare una padella deve costare cinque secondi; un portatile puo'
 * costarne di piu' perche' ha davvero piu' informazioni.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type ItemPayload } from '../lib/api.ts';
import type { Item } from '../lib/types.ts';
import { Collapsible, Field, Modal, useToast } from './ui.tsx';
import { Icon } from './Icon.tsx';

export type ItemFormProps = {
  item?: Item;
  defaults?: { category_id?: number | null; location_id?: number | null };
  onClose: () => void;
  onSaved?: (item: Item) => void;
};

type FormState = {
  name: string;
  category_id: string;
  location_id: string;
  status_id: string;
  quantity: string;
  unit: string;
  description: string;
  brand: string;
  model: string;
  serial_number: string;
  sku: string;
  barcode: string;
  purchase_price: string;
  currency: string;
  purchase_date: string;
  vendor_name: string;
  product_url: string;
  warranty_months: string;
  warranty_start: string;
  warranty_end: string;
  expiration_date: string;
  expected_lifespan_months: string;
  is_consumable: boolean;
  min_quantity: string;
  notes: string;
  tags: string;
};

const emptyState = (): FormState => ({
  name: '',
  category_id: '',
  location_id: '',
  status_id: '',
  quantity: '1',
  unit: 'pz',
  description: '',
  brand: '',
  model: '',
  serial_number: '',
  sku: '',
  barcode: '',
  purchase_price: '',
  currency: 'EUR',
  purchase_date: '',
  vendor_name: '',
  product_url: '',
  warranty_months: '',
  warranty_start: '',
  warranty_end: '',
  expiration_date: '',
  expected_lifespan_months: '',
  is_consumable: false,
  min_quantity: '',
  notes: '',
  tags: '',
});

const fromItem = (item: Item): FormState => ({
  name: item.name,
  category_id: item.category ? String(item.category.id) : '',
  location_id: item.location ? String(item.location.id) : '',
  status_id: String(item.status.id),
  quantity: String(item.quantity),
  unit: item.unit,
  description: item.description ?? '',
  brand: item.brand ?? '',
  model: item.model ?? '',
  serial_number: item.serial_number ?? '',
  sku: item.sku ?? '',
  barcode: item.barcode ?? '',
  purchase_price: item.purchase_price === null ? '' : String(item.purchase_price),
  currency: item.currency,
  purchase_date: item.purchase_date ?? '',
  vendor_name: item.vendor?.name ?? '',
  product_url: item.product_url ?? '',
  warranty_months: item.warranty.months === null ? '' : String(item.warranty.months),
  warranty_start: item.warranty.start ?? '',
  warranty_end: item.warranty.end ?? '',
  expiration_date: item.expiration_date ?? '',
  expected_lifespan_months: item.expected_lifespan_months === null ? '' : String(item.expected_lifespan_months),
  is_consumable: item.is_consumable,
  min_quantity: item.min_quantity === null ? '' : String(item.min_quantity),
  notes: item.notes ?? '',
  tags: item.tags.map((t) => t.name).join(', '),
});

const num = (value: string): number | null => {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export function ItemForm({ item, defaults, onClose, onSaved }: ItemFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(item);

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories });
  const locations = useQuery({ queryKey: ['locations'], queryFn: api.locations });
  const statuses = useQuery({ queryKey: ['statuses'], queryFn: api.statuses });
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: api.vendors });

  const [form, setForm] = useState<FormState>(() => {
    if (item) return fromItem(item);
    const base = emptyState();
    if (defaults?.category_id) base.category_id = String(defaults.category_id);
    if (defaults?.location_id) base.location_id = String(defaults.location_id);
    return base;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Le sezioni si aprono da sole se l'oggetto ha gia' dati al loro interno:
  // in modifica non si va a caccia di quello che si e' scritto ieri.
  const openSections = useMemo(
    () => ({
      details: Boolean(form.brand || form.model || form.serial_number || form.sku || form.description),
      purchase: Boolean(form.purchase_price || form.purchase_date || form.vendor_name),
      warranty: Boolean(form.warranty_months || form.warranty_end || form.expiration_date),
      stock: form.is_consumable,
      extra: Boolean(form.notes || form.tags),
    }),
    // Calcolato una sola volta all'apertura: non deve richiudersi mentre si scrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const defaultStatusId = useMemo(() => {
    const list = statuses.data?.statuses ?? [];
    return list.find((s) => s.is_default === 1)?.id ?? list[0]?.id;
  }, [statuses.data]);

  const save = useMutation({
    mutationFn: (payload: ItemPayload) => (item ? api.updateItem(item.id, payload) : api.createItem(payload)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['item', saved.id] });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success(isEdit ? 'Oggetto aggiornato' : `"${saved.name}" aggiunto all’inventario`);
      onSaved?.(saved);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        setFieldErrors(Object.fromEntries(error.fieldErrors.map((f) => [f.field, f.message])));
      }
      toast.fail(error, 'Salvataggio non riuscito');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    if (!form.name.trim()) {
      setFieldErrors({ name: 'Il nome è obbligatorio' });
      return;
    }

    const payload: ItemPayload = {
      name: form.name.trim(),
      description: text(form.description),
      category_id: form.category_id ? Number(form.category_id) : null,
      location_id: form.location_id ? Number(form.location_id) : null,
      status_id: form.status_id ? Number(form.status_id) : (defaultStatusId ?? null),
      quantity: num(form.quantity) ?? 1,
      unit: form.unit.trim() || 'pz',
      is_consumable: form.is_consumable,
      min_quantity: num(form.min_quantity),
      brand: text(form.brand),
      model: text(form.model),
      serial_number: text(form.serial_number),
      sku: text(form.sku),
      barcode: text(form.barcode),
      purchase_price: num(form.purchase_price),
      currency: form.currency.trim().toUpperCase() || 'EUR',
      purchase_date: text(form.purchase_date),
      vendor_name: text(form.vendor_name),
      product_url: text(form.product_url),
      warranty_months: num(form.warranty_months),
      warranty_start: text(form.warranty_start),
      warranty_end: text(form.warranty_end),
      expiration_date: text(form.expiration_date),
      expected_lifespan_months: num(form.expected_lifespan_months),
      notes: text(form.notes),
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    save.mutate(payload);
  };

  return (
    <Modal
      title={isEdit ? `Modifica: ${item?.name}` : 'Nuovo oggetto'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form="item-form" className={`btn btn-primary${save.isPending ? ' loading' : ''}`} disabled={save.isPending}>
            {isEdit ? 'Salva modifiche' : 'Aggiungi oggetto'}
          </button>
        </>
      }
    >
      <form id="item-form" className="modal-body" onSubmit={submit}>
        {/* --- L'essenziale ------------------------------------------------ */}
        <div className="form-section">
          <Field label="Nome" error={fieldErrors.name} wide>
            <input
              className={`input${fieldErrors.name ? ' invalid' : ''}`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Es. Padella antiaderente 28 cm"
              autoFocus
              required
            />
          </Field>

          <div className="form-grid">
            <Field label="Categoria">
              <select className="select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">Nessuna categoria</option>
                {(categories.data?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.path}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Posizione">
              <select className="select" value={form.location_id} onChange={(e) => set('location_id', e.target.value)}>
                <option value="">Nessuna posizione</option>
                {(locations.data?.locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.path}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantità">
              <div className="row">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  style={{ maxWidth: 100 }}
                />
                <input
                  className="input"
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  placeholder="pz"
                  aria-label="Unità di misura"
                  style={{ maxWidth: 90 }}
                  list="unit-list"
                />
                <datalist id="unit-list">
                  {['pz', 'kg', 'g', 'l', 'ml', 'm', 'conf', 'paia'].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </Field>

            <Field label="Stato">
              <select
                className="select"
                value={form.status_id || String(defaultStatusId ?? '')}
                onChange={(e) => set('status_id', e.target.value)}
              >
                {(statuses.data?.statuses ?? []).map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* --- Dettagli ----------------------------------------------------- */}
        <Collapsible title="Dettagli e identificazione" defaultOpen={openSections.details} summary="marca, modello, seriale">
          <div className="form-grid">
            <Field label="Marca">
              <input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </Field>
            <Field label="Modello">
              <input className="input" value={form.model} onChange={(e) => set('model', e.target.value)} />
            </Field>
            <Field label="Numero di serie">
              <input className="input" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
            </Field>
            <Field label="Codice prodotto / SKU">
              <input className="input" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field label="Codice a barre" hint="Utile in futuro per la scansione">
              <input className="input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </Field>
          </div>
          <Field label="Descrizione" wide>
            <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </Field>
        </Collapsible>

        {/* --- Acquisto ----------------------------------------------------- */}
        <Collapsible title="Acquisto" defaultOpen={openSections.purchase} summary="prezzo, data, negozio">
          <div className="form-grid">
            <Field label="Prezzo unitario" hint="Il totale viene calcolato per quantità">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => set('purchase_price', e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Valuta">
              <input className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)} maxLength={3} />
            </Field>
            <Field label="Data di acquisto">
              <input className="input" type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} />
            </Field>
            <Field label="Negozio / venditore">
              <input
                className="input"
                value={form.vendor_name}
                onChange={(e) => set('vendor_name', e.target.value)}
                list="vendor-list"
                placeholder="Es. IKEA"
              />
            </Field>
          </div>
          <Field label="Link al prodotto" wide>
            <input
              className="input"
              type="url"
              value={form.product_url}
              onChange={(e) => set('product_url', e.target.value)}
              placeholder="https://"
            />
          </Field>
        </Collapsible>

        {/* --- Garanzia e scadenze ------------------------------------------ */}
        <Collapsible title="Garanzia e scadenze" defaultOpen={openSections.warranty} summary="durata, scadenza">
          <div className="form-grid">
            <Field label="Durata garanzia (mesi)" hint="La fine viene calcolata dalla data di acquisto">
              <input
                className="input"
                type="number"
                min={0}
                value={form.warranty_months}
                onChange={(e) => set('warranty_months', e.target.value)}
                placeholder="24"
              />
            </Field>
            <Field label="Inizio garanzia">
              <input className="input" type="date" value={form.warranty_start} onChange={(e) => set('warranty_start', e.target.value)} />
            </Field>
            <Field label="Fine garanzia" hint="Compilala solo per forzare una data diversa">
              <input className="input" type="date" value={form.warranty_end} onChange={(e) => set('warranty_end', e.target.value)} />
            </Field>
            <Field label="Data di scadenza" hint="Alimenti, medicinali, filtri...">
              <input className="input" type="date" value={form.expiration_date} onChange={(e) => set('expiration_date', e.target.value)} />
            </Field>
            <Field label="Durata prevista (mesi)">
              <input
                className="input"
                type="number"
                min={0}
                value={form.expected_lifespan_months}
                onChange={(e) => set('expected_lifespan_months', e.target.value)}
              />
            </Field>
          </div>
        </Collapsible>

        {/* --- Scorte ------------------------------------------------------- */}
        <Collapsible title="Scorte e consumo" defaultOpen={openSections.stock} summary="soglia minima">
          <label className="checkbox">
            <input type="checkbox" checked={form.is_consumable} onChange={(e) => set('is_consumable', e.target.checked)} />
            <span>È un consumabile (detersivi, alimenti, ricambi...)</span>
          </label>
          {form.is_consumable ? (
            <div className="form-grid">
              <Field label="Soglia minima" hint="Sotto questa quantità finisce fra le cose da ricomprare">
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={form.min_quantity}
                  onChange={(e) => set('min_quantity', e.target.value)}
                  placeholder="1"
                />
              </Field>
            </div>
          ) : null}
        </Collapsible>

        {/* --- Tag e note --------------------------------------------------- */}
        <Collapsible title="Tag e note" defaultOpen={openSections.extra} summary="etichette libere">
          <Field label="Tag" hint="Separati da virgola" wide>
            <input
              className="input"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              list="tag-list"
              placeholder="cucina, costoso, regalo"
            />
          </Field>
          <Field label="Note" wide>
            <textarea className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>
        </Collapsible>

        {!isEdit ? (
          <p className="hint row" style={{ gap: 6 }}>
            <Icon name="info" size={14} />
            Puoi aggiungere foto e documenti dalla scheda dell’oggetto, dopo il salvataggio.
          </p>
        ) : null}

        <datalist id="vendor-list">
          {(vendors.data?.vendors ?? []).map((vendor) => (
            <option key={vendor.id} value={vendor.name} />
          ))}
        </datalist>
        <datalist id="tag-list">
          {(tags.data?.tags ?? []).map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>
      </form>
    </Modal>
  );
}
