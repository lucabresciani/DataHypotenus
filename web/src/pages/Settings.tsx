/**
 * Impostazioni: la pagina da cui si governa tutto il sistema.
 *
 * Tre scelte che reggono la pagina:
 *
 * 1. Si apre con lo STATO, non con le preferenze. La domanda vera di chi entra
 *    qui non e' "che valuta uso", e' "i miei dati sono al sicuro". Integrita'
 *    dell'archivio, eta' dell'ultimo backup, spazio dei documenti e problemi
 *    aperti stanno sopra a tutto, e l'azione che serve compare li' dentro.
 * 2. La sezione aperta sta nell'indirizzo (`?sezione=backup`), come i filtri
 *    dell'inventario: e' condivisibile, sopravvive al ricaricamento e permette
 *    di mandare qualcuno esattamente dove serve.
 * 3. Due regole di salvataggio, ma dichiarate: le preferenze sono un modulo con
 *    Salva esplicito e possibilita' di annullare; gli interruttori (conta come
 *    posseduto, stato predefinito) salvano subito, perche' un interruttore che
 *    chiede conferma non e' un interruttore.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';

import { api } from '@/lib/api.ts';
import type { Status } from '@/lib/types.ts';
import { backupLabel, fileSize, plural, relativeTime } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/Icon.tsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingRows,
  Page,
  PageHeader,
  Section,
  toast,
} from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TABS = [
  { id: 'generale', label: 'Generale', icon: 'settings' },
  { id: 'stati', label: 'Stati', icon: 'tag' },
  { id: 'supporto', label: 'Tag e negozi', icon: 'cart' },
  { id: 'backup', label: 'Backup', icon: 'shield' },
  { id: 'dati', label: 'Import ed export', icon: 'download' },
  { id: 'diagnostica', label: 'Diagnostica', icon: 'chart' },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>;

type Tab = (typeof TABS)[number]['id'];

const isTab = (value: string | null): value is Tab => TABS.some((entry) => entry.id === value);

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('sezione');
  const tab: Tab = isTab(requested) ? requested : 'generale';

  /* La bozza delle preferenze vive qui, non dentro la sezione: passando a
     un'altra scheda la sezione si smonta, e le modifiche non salvate
     sparirebbero senza dire niente. */
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);

  const goTo = (next: string) => {
    if (!isTab(next)) return;
    const updated = new URLSearchParams(params);
    // La sezione predefinita non sporca l'indirizzo.
    if (next === 'generale') updated.delete('sezione');
    else updated.set('sezione', next);
    // `replace`: sei sezioni non devono intrappolare il tasto Indietro.
    setParams(updated, { replace: true });
  };

  return (
    <Page>
      <PageHeader title="Impostazioni" description="Preferenze d’uso, dati di supporto e sicurezza dell’archivio." />

      <SystemStatus activeTab={tab} onGoToBackup={() => goTo('backup')} />

      {/* Radix porta gia' frecce, Home/Fine e i ruoli ARIA corretti: qui resta
          solo da tenere la scheda aperta dentro l'indirizzo. */}
      <Tabs value={tab} onValueChange={goTo} className="gap-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((entry) => (
            <TabsTrigger
              key={entry.id}
              value={entry.id}
              className={cn(
                'relative flex-none shrink-0 gap-2 rounded-none border-0 bg-transparent px-3 py-2.5 text-base font-medium',
                'text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none',
                'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-primary',
                'after:origin-center after:scale-x-0 after:transition-transform after:duration-200 after:ease-[var(--ease-out-quint)]',
                'data-[state=active]:after:scale-x-100',
                '[&_svg]:text-faint data-[state=active]:[&_svg]:text-primary',
              )}
            >
              <Icon name={entry.icon} size={15} />
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="generale">
          <GeneralSection draft={draft} setDraft={setDraft} />
        </TabsContent>
        <TabsContent value="stati">
          <StatusSection />
        </TabsContent>
        <TabsContent value="supporto">
          <SupportSection />
        </TabsContent>
        <TabsContent value="backup">
          <BackupSection />
        </TabsContent>
        <TabsContent value="dati">
          <TransferSection />
        </TabsContent>
        <TabsContent value="diagnostica">
          <DiagnosticsSection />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

/* ============================================================================
   Stato del sistema
   ========================================================================== */

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-destructive-soft text-destructive',
  neutral: 'bg-secondary text-muted-foreground',
};

function SystemCell({ icon, tone, value, detail }: { icon: IconName; tone: Tone; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-background px-4 py-3.5">
      {/* Il colore non porta mai da solo il significato: accanto c'e' la frase. */}
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', TONE_CHIP[tone])} aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <strong className="text-base font-semibold break-words">{value}</strong>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

/** Giorni oltre i quali un backup smette di essere rassicurante. */
const BACKUP_STALE_DAYS = 7;

function SystemStatus({ activeTab, onGoToBackup }: { activeTab: Tab; onGoToBackup: () => void }) {
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const storage = useQuery({ queryKey: ['storage'], queryFn: () => api.storageCheck(false) });
  const backups = useQuery({ queryKey: ['backups'], queryFn: api.backups });

  const create = useMutation({
    mutationFn: () => api.createBackup('manuale'),
    onSuccess: (info) => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
      toast.success(`Backup creato: ${plural(info.files, 'allegato', 'allegati')}, ${fileSize(info.bytes)}`);
    },
    onError: (error) => toast.fail(error, 'Backup non riuscito'),
  });

  const loading = health.isLoading || storage.isLoading || backups.isLoading;
  const last = backups.data?.backups[0];
  const ageDays = last ? (Date.now() - new Date(last.created_at).getTime()) / 86_400_000 : null;
  const backupTone: Tone = ageDays === null || ageDays > BACKUP_STALE_DAYS ? 'warn' : 'ok';

  const integrityOk = health.data?.integrity === 'ok';
  const missing = storage.data?.missing.length ?? 0;
  const corrupted = storage.data?.corrupted.length ?? 0;
  const orphans = storage.data?.orphan_blobs ?? 0;

  const troubles: string[] = [];
  if (missing > 0) troubles.push(plural(missing, 'file mancante', 'file mancanti'));
  if (corrupted > 0) troubles.push(plural(corrupted, 'file corrotto', 'file corrotti'));
  if (orphans > 0) troubles.push(plural(orphans, 'file non più usato', 'file non più usati'));

  return (
    <Section
      title="Stato del sistema"
      description="Letto adesso dal disco, non dalla memoria dell’applicazione."
      bare
      actions={
        /* Sulla scheda Backup il bottone lo porta il pannello sotto: la stessa
           azione due volte nella stessa schermata e' solo rumore. */
        activeTab === 'backup' ? null : backupTone === 'warn' ? (
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            <Icon name="shield" size={15} /> Crea backup adesso
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onGoToBackup}>
            Gestisci i backup
          </Button>
        )
      }
    >
      {loading ? (
        <LoadingRows rows={1} height={62} />
      ) : (
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <SystemCell
            icon="shield"
            tone={integrityOk ? 'ok' : 'danger'}
            value={integrityOk ? 'Archivio integro' : 'Archivio da controllare'}
            detail={integrityOk ? 'verifica interna di SQLite superata' : (health.data?.integrity ?? 'verifica non riuscita')}
          />
          <SystemCell
            icon="history"
            tone={backupTone}
            value={last ? `Backup ${relativeTime(last.created_at)}` : 'Nessun backup'}
            detail={last ? backupLabel(last.name) : 'i tuoi dati non hanno ancora una copia'}
          />
          <SystemCell
            icon="file"
            tone="neutral"
            value={fileSize(storage.data?.total_bytes ?? 0)}
            detail={`${plural(storage.data?.files ?? 0, 'file archiviato', 'file archiviati')}, ${plural(storage.data?.attachments ?? 0, 'collegamento', 'collegamenti')}`}
          />
          <SystemCell
            icon={troubles.length === 0 ? 'check' : 'alert'}
            tone={missing > 0 || corrupted > 0 ? 'danger' : troubles.length > 0 ? 'warn' : 'ok'}
            value={troubles.length === 0 ? 'Nessun problema' : troubles.join(', ')}
            detail={troubles.length === 0 ? 'niente da sistemare nell’archivio dei file' : 'apri Diagnostica per intervenire'}
          />
        </div>
      )}
    </Section>
  );
}

/* ============================================================================
   Generale
   ========================================================================== */

/** Un gruppo di campi con un suo titolo: sei preferenze slegate diventano due temi. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 id={titleId} className="text-base font-semibold">
        {title}
      </h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {/* Un campo da tre caratteri non deve essere largo mezzo schermo: le
          colonne hanno un tetto, e lo spazio che avanza resta spazio. */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(11.5rem,15rem))] gap-4">{children}</div>
    </section>
  );
}

type Errors = Record<string, string>;

/** La validazione sta qui, non nel campo: cosi' il Salva sa se puo' partire. */
function validate(values: Record<string, string>): Errors {
  const errors: Errors = {};
  if (!/^[A-Z]{3}$/.test((values['app.default_currency'] ?? '').trim())) {
    errors['app.default_currency'] = 'Tre lettere, come EUR o CHF';
  }
  if (!(values['app.default_unit'] ?? '').trim()) {
    errors['app.default_unit'] = 'Serve un’unità: pz, kg, l…';
  }

  const range = (key: string, min: number, max: number) => {
    const parsed = Number(values[key]);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) errors[key] = `Un numero intero fra ${min} e ${max}`;
  };
  range('alerts.warranty_days', 1, 365);
  range('alerts.expiration_days', 1, 365);
  range('alerts.dashboard_limit', 3, 20);
  return errors;
}

function GeneralSection({
  draft,
  setDraft,
}: {
  draft: Record<string, string> | null;
  setDraft: (draft: Record<string, string> | null) => void;
}) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const formRef = useRef<HTMLFormElement>(null);
  const reduceMotion = useReducedMotion();

  const values = draft ?? settings.data?.settings ?? {};
  const errors = useMemo(() => validate(values), [values]);
  const invalid = Object.keys(errors).length > 0;
  const dirty = draft !== null;

  const set = (key: string, value: string) => setDraft({ ...values, [key]: value });

  const save = useMutation({
    mutationFn: () => api.saveSettings(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Preferenze salvate');
      setDraft(null);
    },
    onError: (error) => toast.fail(error),
  });

  if (settings.isLoading) return <LoadingRows rows={4} height={56} />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <form
      ref={formRef}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        // Il bottone resta acceso anche con dati sbagliati: premendolo si finisce
        // sul primo campo da correggere, invece che su un comando spento e muto.
        if (invalid) {
          formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
          return;
        }
        if (dirty) save.mutate();
      }}
    >
      <Section title="Preferenze" description="Valgono per i prossimi oggetti e per gli avvisi. Niente di già inserito cambia.">
        <div className="flex flex-col gap-5">
          <Group title="Valori predefiniti" hint="Quello che trovi già compilato quando aggiungi un oggetto.">
            <Field label="Valuta" hint="Codice a tre lettere" error={errors['app.default_currency']}>
              <Input
                value={values['app.default_currency'] ?? 'EUR'}
                onChange={(event) => set('app.default_currency', event.target.value.toUpperCase())}
                maxLength={3}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Unità di misura" hint="pz, kg, l, m…" error={errors['app.default_unit']}>
              <Input
                value={values['app.default_unit'] ?? 'pz'}
                onChange={(event) => set('app.default_unit', event.target.value)}
                maxLength={8}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </Group>

          <Group
            title="Avvisi"
            hint="Con quanto anticipo la dashboard e la pagina Scadenze segnalano quello che sta per succedere."
          >
            <Field label="Garanzia in scadenza" hint="Giorni di anticipo" error={errors['alerts.warranty_days']}>
              <Input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={365}
                value={values['alerts.warranty_days'] ?? '60'}
                onChange={(event) => set('alerts.warranty_days', event.target.value)}
              />
            </Field>
            <Field label="Prodotto in scadenza" hint="Giorni di anticipo" error={errors['alerts.expiration_days']}>
              <Input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={365}
                value={values['alerts.expiration_days'] ?? '30'}
                onChange={(event) => set('alerts.expiration_days', event.target.value)}
              />
            </Field>
            <Field label="Righe per riquadro" hint="Quante ne mostra la dashboard" error={errors['alerts.dashboard_limit']}>
              <Input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={3}
                max={20}
                value={values['alerts.dashboard_limit'] ?? '8'}
                onChange={(event) => set('alerts.dashboard_limit', event.target.value)}
              />
            </Field>
          </Group>
        </div>
      </Section>

      {/* Compare solo quando c'e' qualcosa da salvare: finche' non tocchi niente,
          la pagina non ti chiede niente. */}
      {dirty ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="sticky bottom-4 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 shadow-[var(--shadow-float)]"
        >
          <span className="flex items-center gap-1.5 text-sm">
            <Icon name="info" size={14} className="text-faint" />
            {invalid ? 'Controlla i campi segnati' : 'Modifiche non salvate'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(null)}>
              Annulla
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              Salva
            </Button>
          </div>
        </motion.div>
      ) : null}
    </form>
  );
}

/* ============================================================================
   Stati
   ========================================================================== */

/** Casella con un'area di clic decente: 16px sono un bersaglio, non un comando. */
function ToggleCell({
  checked,
  onChange,
  label,
  type = 'checkbox',
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  type?: 'checkbox' | 'radio';
  name?: string;
}) {
  return (
    <label className="inline-grid size-9 cursor-pointer place-items-center rounded-md transition-colors hover:bg-secondary has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/40">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 cursor-pointer accent-[var(--primary)]"
      />
      <span className="sr-only">{label}</span>
    </label>
  );
}

function StatusSection() {
  const queryClient = useQueryClient();
  const statuses = useQuery({ queryKey: ['statuses'], queryFn: api.statuses });
  const [newLabel, setNewLabel] = useState('');
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['statuses'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () => api.createStatus({ label: newLabel.trim() }),
    onSuccess: () => {
      invalidate();
      setNewLabel('');
      toast.success('Stato creato');
    },
    onError: (error) => toast.fail(error),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updateStatus>[1] }) =>
      api.updateStatus(id, payload),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const remove = useMutation({
    mutationFn: ({ id, to }: { id: number; to?: number }) => api.deleteStatus(id, to),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      setReassignTo('');
      toast.success('Stato eliminato');
    },
    onError: (error) => toast.fail(error),
  });

  const list = statuses.data?.statuses ?? [];
  const needsTarget = (deleting?.item_count ?? 0) > 0 && !reassignTo;

  return (
    <Section
      title="Stati degli oggetti"
      description="Le due caselle contano davvero: Possesso fa entrare l’oggetto nel valore dell’inventario, Da comprare lo fa comparire fra le cose che mancano."
    >
      {statuses.isLoading ? (
        <LoadingRows rows={6} height={40} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Etichetta</TableHead>
                <TableHead className="text-center">Possesso</TableHead>
                <TableHead className="text-center">Da comprare</TableHead>
                <TableHead className="text-center">Predefinito</TableHead>
                <TableHead className="text-right">Oggetti</TableHead>
                <TableHead aria-label="Azioni" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((status) => (
                <TableRow key={status.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: status.color ?? 'var(--faint-foreground)' }}
                        aria-hidden
                      />
                      <Input
                        defaultValue={status.label}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (!value) {
                            event.target.value = status.label;
                            return;
                          }
                          if (value !== status.label) update.mutate({ id: status.id, payload: { label: value } });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                          if (event.key === 'Escape') {
                            event.currentTarget.value = status.label;
                            event.currentTarget.blur();
                          }
                        }}
                        className="max-w-52"
                        aria-label={`Etichetta dello stato ${status.label}`}
                      />
                      {status.is_system === 1 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="rounded-full bg-secondary px-2 py-px text-2xs text-muted-foreground">sistema</span>
                          </TooltipTrigger>
                          <TooltipContent>Si può rinominare, non eliminare</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell className="text-center">
                    <ToggleCell
                      checked={status.counts_as_owned === 1}
                      onChange={() =>
                        update.mutate({ id: status.id, payload: { counts_as_owned: status.counts_as_owned !== 1 } })
                      }
                      label={`${status.label}: conta come posseduto`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <ToggleCell
                      checked={status.is_wishlist === 1}
                      onChange={() => update.mutate({ id: status.id, payload: { is_wishlist: status.is_wishlist !== 1 } })}
                      label={`${status.label}: da comprare`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <ToggleCell
                      type="radio"
                      name="stato-predefinito"
                      checked={status.is_default === 1}
                      onChange={() => update.mutate({ id: status.id, payload: { is_default: true } })}
                      label={`${status.label}: stato predefinito dei nuovi oggetti`}
                    />
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {status.item_count > 0 ? (
                      <Link to={`/inventario?status_ids=${status.id}`} className="hover:text-primary-ink hover:underline">
                        {status.item_count}
                      </Link>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {status.is_system === 1 ? null : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:text-destructive"
                        onClick={() => setDeleting(status)}
                        aria-label={`Elimina lo stato ${status.label}`}
                      >
                        <Icon name="trash" size={15} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (newLabel.trim()) create.mutate();
        }}
      >
        <Input
          placeholder="Nuovo stato, per esempio In riparazione"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          aria-label="Etichetta del nuovo stato"
          className="max-w-80"
        />
        <Button type="submit" variant="outline" disabled={!newLabel.trim() || create.isPending}>
          <Icon name="plus" size={15} /> Aggiungi
        </Button>
      </form>

      {deleting ? (
        <ConfirmDialog
          title={`Eliminare lo stato «${deleting.label}»?`}
          destructive
          confirmLabel="Elimina stato"
          confirmDisabled={needsTarget}
          message={
            <div className="flex flex-col gap-3">
              {deleting.item_count > 0 ? (
                <>
                  <p>
                    {plural(deleting.item_count, 'oggetto usa', 'oggetti usano')} questo stato. Nessuno viene eliminato: scegli
                    lo stato da dare loro.
                  </p>
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger className="w-full" aria-label="Stato da assegnare agli oggetti">
                      <SelectValue placeholder="Scegli uno stato" />
                    </SelectTrigger>
                    <SelectContent>
                      {list
                        .filter((entry) => entry.id !== deleting.id)
                        .map((entry) => (
                          <SelectItem key={entry.id} value={String(entry.id)}>
                            {entry.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <p>Nessun oggetto usa questo stato.</p>
              )}
            </div>
          }
          onConfirm={() => remove.mutateAsync({ id: deleting.id, to: reassignTo ? Number(reassignTo) : undefined })}
          onClose={() => {
            setDeleting(null);
            setReassignTo('');
          }}
        />
      ) : null}
    </Section>
  );
}

/* ============================================================================
   Tag e negozi
   ========================================================================== */

type Pending = { kind: 'tag' | 'vendor'; id: number; name: string; count: number };

function SupportSection() {
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: ['tags'], queryFn: api.tags });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: api.vendors });
  const [newTag, setNewTag] = useState('');
  const [newVendor, setNewVendor] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const refreshTags = () => {
    void queryClient.invalidateQueries({ queryKey: ['tags'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
  };
  const refreshVendors = () => {
    void queryClient.invalidateQueries({ queryKey: ['vendors'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
  };

  const createTag = useMutation({
    mutationFn: () => api.createTag(newTag.trim()),
    onSuccess: () => {
      refreshTags();
      setNewTag('');
    },
    onError: (error) => toast.fail(error),
  });

  const createVendor = useMutation({
    mutationFn: () => api.createVendor({ name: newVendor.trim() }),
    onSuccess: () => {
      refreshVendors();
      setNewVendor('');
    },
    onError: (error) => toast.fail(error),
  });

  const removeEntry = useMutation({
    mutationFn: (target: Pending) => (target.kind === 'tag' ? api.deleteTag(target.id) : api.deleteVendor(target.id)),
    onSuccess: (_result, target) => {
      if (target.kind === 'tag') refreshTags();
      else refreshVendors();
      setPending(null);
      toast.success(target.kind === 'tag' ? 'Tag eliminato' : 'Negozio eliminato');
    },
    onError: (error) => toast.fail(error),
  });

  const tagList = tags.data?.tags ?? [];
  const vendorList = vendors.data?.vendors ?? [];

  return (
    <>
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section
          title="Tag"
          description="Etichette libere, trasversali alle categorie."
          actions={<span className="text-sm text-muted-foreground tabular-nums">{tagList.length}</span>}
        >
          <div className="flex flex-col gap-4">
            {tags.isLoading ? (
              <LoadingRows rows={2} height={28} />
            ) : tagList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun tag. Si creano anche al volo mentre compili un oggetto: qui li rivedi tutti insieme.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tagList.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary py-0.5 pr-1 pl-2.5 text-xs"
                  >
                    <Link to={`/inventario?tag_ids=${tag.id}`} className="hover:text-primary-ink">
                      {tag.name}
                    </Link>
                    {/* Uno zero accanto a ogni nome sarebbe solo rumore. */}
                    {tag.item_count > 0 ? <span className="font-mono text-2xs text-faint">{tag.item_count}</span> : null}
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'tag', id: tag.id, name: tag.name, count: tag.item_count })}
                      aria-label={`Elimina il tag ${tag.name}`}
                      className="grid size-5 place-items-center rounded-full text-faint transition-colors hover:bg-destructive-soft hover:text-destructive"
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (newTag.trim()) createTag.mutate();
              }}
            >
              <Input
                placeholder="Nuovo tag, per esempio fragile"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                aria-label="Nome del nuovo tag"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                disabled={!newTag.trim() || createTag.isPending}
                aria-label="Aggiungi il tag"
              >
                <Icon name="plus" size={15} />
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Eliminare un tag non elimina gli oggetti: toglie soltanto l’etichetta.
            </p>
          </div>
        </Section>

        <Section
          title="Negozi"
          description="Dove hai comprato. Alimentano le statistiche di spesa."
          actions={<span className="text-sm text-muted-foreground tabular-nums">{vendorList.length}</span>}
        >
          <div className="flex flex-col gap-4">
            {vendors.isLoading ? (
              <LoadingRows rows={3} height={28} />
            ) : vendorList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun negozio. Si crea scrivendone il nome nella scheda di un oggetto.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {vendorList.map((vendor) => (
                  <div key={vendor.id} className="flex items-center gap-3 py-1.5">
                    <Icon name="cart" size={15} className="text-faint" />
                    <span className="min-w-0 flex-1 truncate">{vendor.name}</span>
                    <span className="text-xs text-muted-foreground">{plural(vendor.item_count, 'oggetto', 'oggetti')}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="hover:text-destructive"
                      onClick={() => setPending({ kind: 'vendor', id: vendor.id, name: vendor.name, count: vendor.item_count })}
                      aria-label={`Elimina il negozio ${vendor.name}`}
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (newVendor.trim()) createVendor.mutate();
              }}
            >
              <Input
                placeholder="Nuovo negozio, per esempio IKEA"
                value={newVendor}
                onChange={(event) => setNewVendor(event.target.value)}
                aria-label="Nome del nuovo negozio"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                disabled={!newVendor.trim() || createVendor.isPending}
                aria-label="Aggiungi il negozio"
              >
                <Icon name="plus" size={15} />
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Gli oggetti restano al loro posto: perdono soltanto il riferimento al negozio.
            </p>
          </div>
        </Section>
      </div>

      {pending ? (
        <ConfirmDialog
          title={pending.kind === 'tag' ? `Eliminare il tag «${pending.name}»?` : `Eliminare il negozio «${pending.name}»?`}
          destructive
          confirmLabel="Elimina"
          message={
            pending.count === 0
              ? 'Nessun oggetto lo usa.'
              : pending.kind === 'tag'
                ? `${plural(pending.count, 'oggetto ha', 'oggetti hanno')} questo tag. Restano dove sono, perdono l’etichetta.`
                : `${plural(pending.count, 'oggetto indica', 'oggetti indicano')} questo negozio. Restano dove sono, perdono il riferimento.`
          }
          onConfirm={() => removeEntry.mutateAsync(pending)}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

/* ============================================================================
   Backup
   ========================================================================== */

function BackupSection() {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: ['backups'], queryFn: api.backups });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [keep, setKeep] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['backups'] });

  const create = useMutation({
    mutationFn: () => api.createBackup('manuale'),
    onSuccess: (info) => {
      invalidate();
      toast.success(`Backup creato: ${plural(info.files, 'allegato', 'allegati')}, ${fileSize(info.bytes)}`);
    },
    onError: (error) => toast.fail(error, 'Backup non riuscito'),
  });

  const verify = useMutation({
    mutationFn: (name: string) => api.verifyBackup(name),
    onSuccess: (report) => {
      if (report.ok) toast.success('Backup integro: database e allegati corrispondono agli hash registrati');
      else
        toast.fail(
          new Error(
            `Verifica fallita: ${report.database_ok ? '' : 'database alterato; '}${plural(report.attachments_missing.length, 'file mancante', 'file mancanti')}, ${plural(report.attachments_bad.length, 'corrotto', 'corrotti')}`,
          ),
        );
    },
    onError: (error) => toast.fail(error),
  });

  const restore = useMutation({
    mutationFn: (name: string) => api.restoreBackup(name),
    onSuccess: (report) => {
      void queryClient.invalidateQueries();
      toast.success(
        `Ripristino completato con ${plural(report.attachments_restored, 'allegato', 'allegati')}. Lo stato precedente è nel backup ${report.safety_backup ?? 'di sicurezza'}.`,
      );
      setRestoring(null);
    },
    onError: (error) => toast.fail(error, 'Ripristino non riuscito'),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteBackup(name),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
    onError: (error) => toast.fail(error),
  });

  const saveKeep = useMutation({
    mutationFn: (value: string) => api.saveSettings({ 'backup.keep': value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setKeep(null);
      toast.success('Numero di backup da conservare aggiornato');
    },
    onError: (error) => toast.fail(error),
  });

  const list = backups.data?.backups ?? [];
  const keepValue = keep ?? settings.data?.settings['backup.keep'] ?? '10';
  const keepInvalid = !Number.isInteger(Number(keepValue)) || Number(keepValue) < 1 || Number(keepValue) > 50;
  const totalBytes = list.reduce((sum, backup) => sum + backup.bytes, 0);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Backup"
        description="Ogni backup è una cartella con database, allegati e un manifest di controllo: si può ripristinare anche a mano, senza questa applicazione."
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Icon name="shield" size={15} /> Crea backup adesso
          </Button>
        }
      >
        {backups.error ? (
          <ErrorState error={backups.error} onRetry={() => void backups.refetch()} />
        ) : backups.isLoading ? (
          <LoadingRows rows={3} height={44} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="shield"
            title="Nessun backup"
            description="Ne viene creato uno da solo all’avvio, se l’ultimo ha più di 24 ore. Puoi crearne uno adesso."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Etichetta</TableHead>
                    <TableHead className="text-right">Allegati</TableHead>
                    <TableHead className="text-right">Dimensione</TableHead>
                    <TableHead aria-label="Azioni" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((backup, index) => (
                    <TableRow key={backup.name}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums">{backupLabel(backup.name)}</span>
                          {index === 0 ? (
                            <span className="rounded-full border border-primary-soft-border bg-primary-soft px-2 py-px text-2xs text-primary-ink">
                              il più recente
                            </span>
                          ) : null}
                          {!backup.valid ? (
                            <span className="rounded-full border border-destructive/30 bg-destructive-soft px-2 py-px text-2xs text-destructive">
                              manifest illeggibile
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{backup.label ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{backup.files}</TableCell>
                      <TableCell className="text-right tabular-nums">{fileSize(backup.bytes)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => verify.mutate(backup.name)} disabled={verify.isPending}>
                            {verify.isPending && verify.variables === backup.name ? 'Verifico…' : 'Verifica'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setRestoring(backup.name)}>
                            Ripristina
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="hover:text-destructive"
                            onClick={() => setDeleting(backup.name)}
                            aria-label={`Elimina il backup del ${backupLabel(backup.name)}`}
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
            <p className="mt-2.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
              {plural(list.length, 'backup sul disco', 'backup sul disco')}, {fileSize(totalBytes)} in tutto.
            </p>
          </>
        )}
      </Section>

      <Section title="Rotazione">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (keep !== null && !keepInvalid) saveKeep.mutate(keepValue);
          }}
        >
          <p className="max-w-[70ch] text-base text-muted-foreground">
            Quando ne nasce uno nuovo, i backup più vecchi oltre questo numero vengono rimossi dal disco. Se ne vuoi tenere uno
            per sempre, copialo altrove: qui dentro prima o poi scade.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Backup da conservare" error={keepInvalid ? 'Un numero fra 1 e 50' : undefined}>
              <Input
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={50}
                value={keepValue}
                onChange={(event) => setKeep(event.target.value)}
                className="max-w-32"
              />
            </Field>
            {keep !== null ? (
              <>
                <Button type="submit" disabled={keepInvalid || saveKeep.isPending}>
                  Salva
                </Button>
                <Button type="button" variant="outline" onClick={() => setKeep(null)}>
                  Annulla
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </Section>

      {restoring ? (
        <ConfirmDialog
          title="Ripristinare questo backup?"
          confirmLabel="Ripristina"
          destructive
          message={
            <div className="flex flex-col gap-2">
              <p>
                Il database attuale viene sostituito con quello del {backupLabel(restoring)}. Tutto quello che hai inserito dopo
                quella data sparisce.
              </p>
              <p className="text-sm">
                Prima del ripristino viene creato un backup dello stato attuale: se sbagli, si torna indietro ripristinando
                quello.
              </p>
            </div>
          }
          onConfirm={() => restore.mutateAsync(restoring)}
          onClose={() => setRestoring(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Eliminare il backup?"
          message="La cartella del backup viene rimossa dal disco. Gli altri backup e i dati attuali non vengono toccati."
          confirmLabel="Elimina"
          destructive
          onConfirm={() => remove.mutateAsync(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

/* ============================================================================
   Import ed export
   ========================================================================== */

function TransferSection() {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [report, setReport] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.json')) {
      toast.fail(new Error(`«${file.name}» non è un CSV né un JSON`));
      return;
    }

    setImporting(true);
    setReport(null);
    try {
      const text = await file.text();
      const result = name.endsWith('.json') ? await api.importJson(JSON.parse(text)) : await api.importCsv(text);
      setReport(result);
      void queryClient.invalidateQueries();
      toast.success(
        `Import completato: ${plural(result.created, 'creato', 'creati')}, ${plural(result.updated, 'aggiornato', 'aggiornati')}`,
      );
    } catch (error) {
      toast.fail(error, 'Import non riuscito');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Section title="Esporta">
        <div className="flex flex-col gap-3">
          <p className="max-w-[70ch] text-base text-muted-foreground">
            I tuoi dati devono restare leggibili anche senza questa applicazione. Il CSV si apre in Excel o LibreOffice; il JSON
            contiene tutto il database ed è il formato giusto per reimportare senza perdere niente.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={api.exportCsvUrl} download>
                <Icon name="download" size={15} /> Oggetti in CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={api.exportJsonUrl} download>
                <Icon name="download" size={15} /> Tutto in JSON
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Le foto e i documenti non stanno dentro l’export: sono nella cartella dei dati e finiscono nei backup.
          </p>
        </div>
      </Section>

      <Section title="Importa">
        <div className="flex flex-col gap-4">
          <p className="max-w-[70ch] text-base text-muted-foreground">
            Accetta i file CSV o JSON prodotti da questa applicazione, e qualunque CSV che abbia almeno la colonna{' '}
            <code className="rounded bg-secondary px-1 font-mono text-sm">name</code>. Le colonne{' '}
            <code className="rounded bg-secondary px-1 font-mono text-sm">category_path</code> e{' '}
            <code className="rounded bg-secondary px-1 font-mono text-sm">location_path</code> accettano percorsi come «Casa /
            Cucina / Cassetto 2» e creano quello che manca. Se la riga ha un{' '}
            <code className="rounded bg-secondary px-1 font-mono text-sm">uid</code> già presente, l’oggetto viene aggiornato
            invece che duplicato.
          </p>

          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-7 text-center',
              'transition-colors duration-150',
              'focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/40',
              dragging
                ? 'border-primary bg-primary-soft text-primary-ink'
                : 'border-border-strong text-muted-foreground hover:border-primary hover:bg-primary-soft/50 hover:text-primary-ink',
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <Icon name="upload" size={20} />
            <p className="text-base">
              {importing ? 'Import in corso…' : 'Trascina qui un file CSV o JSON, oppure premi per sceglierlo'}
            </p>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
          </label>

          {report ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 text-xs text-ok">
                  {plural(report.created, 'creato', 'creati')}
                </span>
                <span className="rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-xs text-info">
                  {plural(report.updated, 'aggiornato', 'aggiornati')}
                </span>
                {report.skipped > 0 ? (
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {plural(report.skipped, 'saltato', 'saltati')}
                  </span>
                ) : null}
                {report.errors.length > 0 ? (
                  <span className="rounded-full border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs text-destructive">
                    {plural(report.errors.length, 'errore', 'errori')}
                  </span>
                ) : null}
              </div>
              {report.errors.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {report.errors.slice(0, 10).map((error, index) => (
                    <li key={index}>
                      Riga {error.row}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Section>

      <SeedPanel />
    </div>
  );
}

function SeedPanel() {
  const queryClient = useQueryClient();
  const seed = useMutation({
    mutationFn: () => api.seed(false),
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      toast.success(
        result.applied
          ? `Inserite ${plural(result.categories, 'categoria', 'categorie')} e ${plural(result.locations, 'posizione', 'posizioni')}`
          : `Non serviva: ${result.reason}`,
      );
    },
    onError: (error) => toast.fail(error),
  });

  return (
    <Section title="Dati iniziali">
      <div className="flex flex-col items-start gap-3">
        <p className="max-w-[70ch] text-base text-muted-foreground">
          Inserisce un insieme di categorie e stanze di partenza, ma solo se il database non ne ha ancora: non sovrascrive
          niente. Resta tutto rinominabile ed eliminabile.
        </p>
        <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
          <Icon name="refresh" size={15} /> Inserisci categorie e stanze iniziali
        </Button>
      </div>
    </Section>
  );
}

/* ============================================================================
   Diagnostica
   ========================================================================== */

function CopyRow({ value, label }: { value: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}: percorso copiato`);
    } catch {
      toast.fail(new Error('Il browser non ha permesso la copia'));
    }
  };

  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 flex-1 font-mono text-xs break-all">{value}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={`Copia ${label}`}>
        <Icon name="copy" size={14} />
      </Button>
    </span>
  );
}

function Spec({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,auto)_minmax(0,1fr)] items-baseline gap-x-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

function DiagnosticsSection() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const storage = useQuery({ queryKey: ['storage'], queryFn: () => api.storageCheck(false) });
  const [collecting, setCollecting] = useState(false);

  const gc = useMutation({
    mutationFn: () => api.collectGarbage(false),
    onSuccess: (result) => {
      void storage.refetch();
      toast.success(
        `${plural(result.removed_files, 'file non più usato rimosso', 'file non più usati rimossi')}, ${fileSize(result.freed_bytes)} liberati`,
      );
    },
    onError: (error) => toast.fail(error),
  });

  const deepCheck = useMutation({
    mutationFn: () => api.storageCheck(true),
    onSuccess: (result) => {
      if (result.missing.length === 0 && result.corrupted.length === 0) toast.success('Tutti i file sono presenti e integri');
      else
        toast.fail(
          new Error(
            `${plural(result.missing.length, 'file mancante', 'file mancanti')}, ${plural(result.corrupted.length, 'corrotto', 'corrotti')}`,
          ),
        );
    },
    onError: (error) => toast.fail(error),
  });

  return (
    <div className="flex flex-col gap-8">
      <Section title="Dove stanno i dati" description="Copiare questa cartella su un altro computer basta a spostare tutto.">
        {health.isLoading ? (
          <LoadingRows rows={3} height={22} />
        ) : health.data ? (
          <dl className="m-0 divide-y divide-border">
            <Spec label="Cartella dati">
              <CopyRow value={health.data.data_dir} label="Cartella dati" />
            </Spec>
            <Spec label="File del database">
              <CopyRow value={health.data.database} label="File del database" />
            </Spec>
            <Spec label="Versione dello schema">
              <span className="tabular-nums">{health.data.schema_version}</span>
            </Spec>
            <Spec label="Node.js">
              <span className="font-mono text-sm">{health.data.node}</span>
            </Spec>
            <Spec label="Server attivo da">{Math.max(1, Math.round(health.data.uptime_seconds / 60))} minuti</Spec>
          </dl>
        ) : (
          <ErrorState error={health.error} onRetry={() => void health.refetch()} />
        )}
      </Section>

      <Section title="Archivio dei file" description="Foto e documenti allegati, con verifica di presenza e di integrità.">
        {storage.isLoading ? (
          <LoadingRows rows={2} height={22} />
        ) : storage.data ? (
          <div className="flex flex-col gap-4">
            <dl className="m-0 divide-y divide-border">
              <Spec label="File archiviati">
                <span className="tabular-nums">{storage.data.files}</span>
              </Spec>
              <Spec label="Allegati collegati">
                <span className="tabular-nums">{storage.data.attachments}</span>
              </Spec>
              <Spec label="Spazio occupato">
                <span className="tabular-nums">{fileSize(storage.data.total_bytes)}</span>
              </Spec>
              <Spec label="File non più usati">
                <span className="tabular-nums">{storage.data.orphan_blobs}</span>
              </Spec>
              <Spec label="File mancanti sul disco">
                {storage.data.missing.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 text-xs text-ok">
                    <Icon name="check" size={11} /> nessuno
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs text-destructive">
                    <Icon name="alert" size={11} /> {storage.data.missing.length}
                  </span>
                )}
              </Spec>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => deepCheck.mutate()} disabled={deepCheck.isPending}>
                <Icon name="shield" size={15} /> {deepCheck.isPending ? 'Verifica in corso…' : 'Verifica integrità'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCollecting(true)}
                disabled={gc.isPending || storage.data.orphan_blobs === 0}
              >
                <Icon name="trash" size={15} /> Elimina i file non più usati
              </Button>
            </div>

            <p className="max-w-[70ch] text-xs text-muted-foreground">
              La verifica ricalcola l’impronta di ogni file: su archivi grandi ci mette qualche secondo. Un file viene rimosso
              solo se nessun oggetto lo usa più: cancellare un oggetto non cancella mai un documento condiviso con un altro.
            </p>
          </div>
        ) : (
          <ErrorState error={storage.error} onRetry={() => void storage.refetch()} />
        )}
      </Section>

      {collecting ? (
        <ConfirmDialog
          title="Eliminare i file non più usati?"
          destructive
          confirmLabel="Elimina i file"
          message={`${plural(storage.data?.orphan_blobs ?? 0, 'file non è usato', 'file non sono usati')} da nessun oggetto: ${(storage.data?.orphan_blobs ?? 0) === 1 ? 'verrà rimosso' : 'verranno rimossi'} dal disco. I backup già creati continuano a contenerli.`}
          onConfirm={() => gc.mutateAsync()}
          onClose={() => setCollecting(false)}
        />
      ) : null}
    </div>
  );
}
