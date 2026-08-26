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

import { api, ApiError, type ItemPayload } from '@/lib/api.ts';
import type { Item } from '@/lib/types.ts';
import { Collapsible, Field, toast } from '@/components/patterns.tsx';
import { Icon } from '@/components/Icon.tsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/** shadcn/Radix non accetta il valore vuoto in una tendina: serve una sentinella. */
const NONE = '__nessuno__';

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
      toast.success(isEdit ? 'Oggetto aggiornato' : `«${saved.name}» aggiunto all’inventario`);
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
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{isEdit ? `Modifica: ${item?.name}` : 'Nuovo oggetto'}</DialogTitle>
          <DialogDescription>Serve solo il nome. Tutto il resto si può aggiungere adesso o fra un mese.</DialogDescription>
        </DialogHeader>

        <form
          id="item-form"
          onSubmit={submit}
          className="flex max-h-[calc(90vh-10rem)] flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-4"
        >
          {/* --- L'essenziale ------------------------------------------------ */}
          <div className="flex flex-col gap-4">
            <Field label="Nome" error={fieldErrors.name}>
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Es. Padella antiaderente 28 cm"
                autoFocus
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoria">
                <Select value={form.category_id || NONE} onValueChange={(value) => set('category_id', value === NONE ? '' : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nessuna categoria</SelectItem>
                    {(categories.data?.categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Posizione">
                <Select value={form.location_id || NONE} onValueChange={(value) => set('location_id', value === NONE ? '' : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nessuna posizione</SelectItem>
                    {(locations.data?.locations ?? []).map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Quantità">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.quantity}
                    onChange={(event) => set('quantity', event.target.value)}
                    className="max-w-24"
                  />
                  <Input
                    value={form.unit}
                    onChange={(event) => set('unit', event.target.value)}
                    placeholder="pz"
                    aria-label="Unità di misura"
                    className="max-w-24"
                    list="unit-list"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <datalist id="unit-list">
                    {['pz', 'kg', 'g', 'l', 'ml', 'm', 'conf', 'paia'].map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                </div>
              </Field>

              <Field label="Stato">
                <Select value={form.status_id || String(defaultStatusId ?? '')} onValueChange={(value) => set('status_id', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(statuses.data?.statuses ?? []).map((status) => (
                      <SelectItem key={status.id} value={String(status.id)}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* --- Dettagli ----------------------------------------------------- */}
          <Collapsible title="Dettagli e identificazione" defaultOpen={openSections.details} summary="marca, modello, seriale">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Marca">
                  <Input value={form.brand} onChange={(event) => set('brand', event.target.value)} />
                </Field>
                <Field label="Modello">
                  <Input value={form.model} onChange={(event) => set('model', event.target.value)} />
                </Field>
                <Field label="Numero di serie">
                  <Input
                    value={form.serial_number}
                    onChange={(event) => set('serial_number', event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Codice prodotto o SKU">
                  <Input value={form.sku} onChange={(event) => set('sku', event.target.value)} autoComplete="off" spellCheck={false} />
                </Field>
                <Field label="Codice a barre" hint="Utile in futuro per la scansione">
                  <Input
                    value={form.barcode}
                    onChange={(event) => set('barcode', event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
              <Field label="Descrizione">
                <Textarea value={form.description} onChange={(event) => set('description', event.target.value)} rows={2} />
              </Field>
            </div>
          </Collapsible>

          {/* --- Acquisto ----------------------------------------------------- */}
          <Collapsible title="Acquisto" defaultOpen={openSections.purchase} summary="prezzo, data, negozio">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prezzo unitario" hint="Il totale viene calcolato per quantità">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.purchase_price}
                    onChange={(event) => set('purchase_price', event.target.value)}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Valuta">
                  <Input
                    value={form.currency}
                    onChange={(event) => set('currency', event.target.value.toUpperCase())}
                    maxLength={3}
                    className="max-w-28"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Data di acquisto">
                  <Input type="date" value={form.purchase_date} onChange={(event) => set('purchase_date', event.target.value)} />
                </Field>
                <Field label="Negozio o venditore">
                  <Input
                    value={form.vendor_name}
                    onChange={(event) => set('vendor_name', event.target.value)}
                    list="vendor-list"
                    placeholder="Es. IKEA"
                  />
                </Field>
              </div>
              <Field label="Link al prodotto">
                <Input
                  type="url"
                  value={form.product_url}
                  onChange={(event) => set('product_url', event.target.value)}
                  placeholder="https://"
                  autoComplete="off"
                />
              </Field>
            </div>
          </Collapsible>

          {/* --- Garanzia e scadenze ------------------------------------------ */}
          <Collapsible title="Garanzia e scadenze" defaultOpen={openSections.warranty} summary="durata, scadenza">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Durata garanzia in mesi" hint="La fine viene calcolata dalla data di acquisto">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.warranty_months}
                  onChange={(event) => set('warranty_months', event.target.value)}
                  placeholder="24"
                />
              </Field>
              <Field label="Inizio garanzia">
                <Input type="date" value={form.warranty_start} onChange={(event) => set('warranty_start', event.target.value)} />
              </Field>
              <Field label="Fine garanzia" hint="Compilala solo per forzare una data diversa">
                <Input type="date" value={form.warranty_end} onChange={(event) => set('warranty_end', event.target.value)} />
              </Field>
              <Field label="Data di scadenza" hint="Alimenti, medicinali, filtri…">
                <Input type="date" value={form.expiration_date} onChange={(event) => set('expiration_date', event.target.value)} />
              </Field>
              <Field label="Durata prevista in mesi">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.expected_lifespan_months}
                  onChange={(event) => set('expected_lifespan_months', event.target.value)}
                />
              </Field>
            </div>
          </Collapsible>

          {/* --- Scorte ------------------------------------------------------- */}
          <Collapsible title="Scorte e consumo" defaultOpen={openSections.stock} summary="soglia minima">
            <div className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-base">
                <Checkbox checked={form.is_consumable} onCheckedChange={(checked) => set('is_consumable', checked === true)} />È un
                consumabile: detersivi, alimenti, ricambi
              </label>
              {form.is_consumable ? (
                <Field label="Soglia minima" hint="Sotto questa quantità finisce fra le cose da ricomprare">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.min_quantity}
                    onChange={(event) => set('min_quantity', event.target.value)}
                    placeholder="1"
                    className="max-w-40"
                  />
                </Field>
              ) : null}
            </div>
          </Collapsible>

          {/* --- Tag e note --------------------------------------------------- */}
          <Collapsible title="Tag e note" defaultOpen={openSections.extra} summary="etichette libere">
            <div className="flex flex-col gap-4">
              <Field label="Tag" hint="Separati da virgola. Quelli nuovi vengono creati.">
                <Input
                  value={form.tags}
                  onChange={(event) => set('tags', event.target.value)}
                  list="tag-list"
                  placeholder="cucina, costoso, regalo"
                />
              </Field>
              <Field label="Note">
                <Textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} />
              </Field>
            </div>
          </Collapsible>

          {!isEdit ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon name="info" size={14} />
              Le foto e i documenti si aggiungono dalla scheda dell’oggetto, dopo il salvataggio.
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

        <DialogFooter className="border-t border-border px-5 py-3.5">
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="item-form" variant="default" disabled={save.isPending}>
            {isEdit ? 'Salva modifiche' : 'Aggiungi oggetto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
