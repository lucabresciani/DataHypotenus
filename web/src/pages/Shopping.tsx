/**
 * Lista acquisti: cosa manca ancora in casa, con priorita' e spesa stimata.
 * Il passaggio "l'ho comprato" crea l'oggetto nell'inventario in un clic.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { PRIORITIES, SHOPPING_STATUS_LABELS, type Priority, type ShoppingItem, type ShoppingStatus } from '@/lib/types.ts';
import { date, money, plural, quantity } from '@/lib/format.ts';
import { Icon } from '@/components/Icon.tsx';
import {
  AlertBadge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingRows,
  Page,
  PageHeader,
  toast,
} from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

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

const NONE = '__nessuna__';

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

const PRIORITY_TONE: Record<Priority, 'danger' | 'warn' | 'neutral'> = {
  urgente: 'danger',
  alta: 'warn',
  media: 'neutral',
  bassa: 'neutral',
};

const FILTERS: Array<[ShoppingStatus | '', string]> = [
  ['da_comprare', 'Da comprare'],
  ['ordinato', 'Ordinati'],
  ['acquistato', 'Acquistati'],
  ['annullato', 'Annullati'],
  ['', 'Tutti'],
];

export function ShoppingPage() {
  const queryClient = useQueryClient();

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
      toast.success(`«${result.item.name}» è ora nell’inventario`);
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
    <Page>
      <PageHeader
        title="Acquisti"
        description={
          <>
            {plural(items.length, 'elemento in lista', 'elementi in lista')}
            {shopping.data && shopping.data.estimated_total > 0 ? ` · ${money(shopping.data.estimated_total)} stimati` : ''}
          </>
        }
        actions={
          <Button onClick={() => setForm(blank())}>
            <Icon name="plus" size={15} /> Aggiungi alla lista
          </Button>
        }
      />

      <div className="-mt-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Button
            key={value || 'all'}
            variant={statusFilter === value ? 'default' : 'outline'}
            size="sm"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {shopping.error ? <ErrorState error={shopping.error} onRetry={() => void shopping.refetch()} /> : null}

      <section>
        {shopping.isLoading ? (
          <LoadingRows rows={4} height={48} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="cart"
            title="Lista vuota"
            description="Aggiungi qui le cose che ancora mancano. Quando le compri, diventano oggetti dell’inventario con un clic, mantenendo prezzo e categoria."
            action={<Button onClick={() => setForm(blank())}>Aggiungi il primo elemento</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cosa</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead className="text-right">Quantità</TableHead>
                  <TableHead className="text-right">Stima</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead aria-label="Azioni" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1.5 font-medium">
                          {entry.name}
                          {entry.url ? (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary-ink hover:underline"
                              aria-label={`Apri il link di ${entry.name}`}
                            >
                              <Icon name="external" size={12} />
                            </a>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[entry.category_path, entry.location_path].filter(Boolean).join(' → ') || 'Senza categoria'}
                          {entry.source_item_id ? ' · riacquisto' : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AlertBadge tone={PRIORITY_TONE[entry.priority]}>{entry.priority}</AlertBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{quantity(entry.desired_quantity, entry.unit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(entry.estimated_total, entry.currency)}</TableCell>
                    <TableCell>
                      {entry.item_id ? (
                        <Link to={`/oggetti/${entry.item_id}`} className="inline-block rounded-full">
                          <AlertBadge tone="ok">Nell’inventario</AlertBadge>
                        </Link>
                      ) : (
                        <Select
                          value={entry.status}
                          onValueChange={(value) => changeStatus.mutate({ id: entry.id, status: value as ShoppingStatus })}
                        >
                          <SelectTrigger size="sm" className="w-[9.5rem]" aria-label={`Stato di ${entry.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SHOPPING_STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {entry.purchased_at ? <div className="pt-0.5 text-xs text-faint">{date(entry.purchased_at)}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!entry.item_id ? (
                          <Button size="sm" onClick={() => setConverting(entry)}>
                            L’ho comprato
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:text-destructive"
                          aria-label={`Elimina ${entry.name}`}
                          onClick={() => setDeleting(entry)}
                        >
                          <Icon name="trash" size={15} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={form !== null} onOpenChange={(open) => (open ? undefined : setForm(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Modifica elemento' : 'Nuovo elemento in lista'}</DialogTitle>
          </DialogHeader>

          {form ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (form.name.trim()) save.mutate(form);
              }}
            >
              <Field label="Cosa serve">
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Es. Set di pentole"
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantità">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="any"
                      value={form.desired_quantity}
                      onChange={(event) => setForm({ ...form, desired_quantity: event.target.value })}
                      className="max-w-24"
                    />
                    <Input
                      value={form.unit}
                      onChange={(event) => setForm({ ...form, unit: event.target.value })}
                      aria-label="Unità di misura"
                      className="max-w-24"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </Field>

                <Field label="Prezzo stimato" hint="Per unità">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.estimated_price}
                    onChange={(event) => setForm({ ...form, estimated_price: event.target.value })}
                    placeholder="0,00"
                  />
                </Field>

                <Field label="Priorità">
                  <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value as Priority })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Categoria">
                  <Select
                    value={form.category_id || NONE}
                    onValueChange={(value) => setForm({ ...form, category_id: value === NONE ? '' : value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nessuna</SelectItem>
                      {(categories.data?.categories ?? []).map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Destinazione prevista">
                  <Select
                    value={form.location_id || NONE}
                    onValueChange={(value) => setForm({ ...form, location_id: value === NONE ? '' : value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nessuna</SelectItem>
                      {(locations.data?.locations ?? []).map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>
                          {location.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Link">
                <Input
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                  placeholder="https://"
                  autoComplete="off"
                />
              </Field>

              <Field label="Note">
                <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Annulla
                </Button>
                <Button type="submit" variant="default" disabled={!form.name.trim() || save.isPending}>
                  Salva
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {converting ? (
        <ConvertDialog
          entry={converting}
          onClose={() => setConverting(null)}
          onConfirm={(price) => convert.mutateAsync({ id: converting.id, price })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Togliere «${deleting.name}» dalla lista?`}
          message="L’elemento viene eliminato dalla lista acquisti. Gli oggetti già creati nell’inventario restano."
          confirmLabel="Elimina"
          destructive
          onConfirm={() => remove.mutateAsync(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      ) : null}

      {/* Il filtro «Tutti» è l'unico che può nascondere qualcosa: se la lista è
          filtrata e vuota, meglio dirlo che lasciare la pagina muta. */}
      {!shopping.isLoading && items.length === 0 && statusFilter !== '' ? (
        <p className="text-center text-sm text-muted-foreground">
          Nessun elemento in questo stato.{' '}
          <button type="button" className="text-primary-ink hover:underline" onClick={() => setStatusFilter('')}>
            Mostra tutti
          </button>
        </p>
      ) : null}
    </Page>
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
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hai comprato «{entry.name}»</DialogTitle>
          <DialogDescription>
            Viene creato un oggetto nell’inventario con quantità {quantity(entry.desired_quantity, entry.unit)}
            {entry.location_path ? `, posizione ${entry.location_path}` : ''}, con la data di oggi.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <Field label="Prezzo effettivo" hint="Per unità. Modificalo se hai speso diversamente dalla stima.">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              autoFocus
            />
          </Field>

          {entry.source_item_id ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon name="info" size={14} />
              La scorta dell’oggetto originale viene ricaricata automaticamente.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" variant="default" disabled={busy}>
              Aggiungi all’inventario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
