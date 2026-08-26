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
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import type { Status } from '../lib/types.ts';
import { backupLabel, fileSize, plural, relativeTime } from '../lib/format.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Field, Skeleton, useToast } from '../components/ui.tsx';

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

  const goTo = (next: Tab) => {
    const updated = new URLSearchParams(params);
    // La sezione predefinita non sporca l'indirizzo.
    if (next === 'generale') updated.delete('sezione');
    else updated.set('sezione', next);
    // `replace`: sei sezioni non devono intrappolare il tasto Indietro.
    setParams(updated, { replace: true });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Impostazioni</h1>
          <p className="muted">Preferenze d’uso, dati di supporto e sicurezza dell’archivio.</p>
        </div>
      </header>

      <SystemStatus activeTab={tab} onGoToBackup={() => goTo('backup')} />

      <TabBar active={tab} onChange={goTo} />

      <div className="tabpanel" key={tab} role="tabpanel" id={`pannello-${tab}`} aria-labelledby={`scheda-${tab}`}>
        {tab === 'generale' ? <GeneralSection draft={draft} setDraft={setDraft} /> : null}
        {tab === 'stati' ? <StatusSection /> : null}
        {tab === 'supporto' ? <SupportSection /> : null}
        {tab === 'backup' ? <BackupSection /> : null}
        {tab === 'dati' ? <TransferSection /> : null}
        {tab === 'diagnostica' ? <DiagnosticsSection /> : null}
      </div>
    </div>
  );
}

/* ============================================================================
   Navigazione fra sezioni
   ========================================================================== */

function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  /* Su schermo stretto la barra scorre: la scheda aperta deve restare visibile,
     altrimenti si arriva su una pagina senza capire in che sezione si e'. */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#scheda-${active}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  /** Frecce, Home e Fine: e' quello che una tastiera si aspetta da delle schede. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((entry) => entry.id === active);
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    const target = next < 0 ? undefined : TABS[next];
    if (!target) return;

    event.preventDefault();
    onChange(target.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#scheda-${target.id}`)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label="Sezioni delle impostazioni" ref={listRef} onKeyDown={onKeyDown}>
      {TABS.map((entry) => {
        const selected = entry.id === active;
        return (
          <button
            key={entry.id}
            id={`scheda-${entry.id}`}
            type="button"
            role="tab"
            className={`tab${selected ? ' active' : ''}`}
            aria-selected={selected}
            aria-controls={`pannello-${entry.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.id)}
          >
            <Icon name={entry.icon} size={15} />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Stato del sistema
   ========================================================================== */

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

function SystemCell({ icon, tone, value, detail }: { icon: IconName; tone: Tone; value: string; detail: string }) {
  return (
    <div className={`system-cell ${tone}`}>
      <span className="system-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="col" style={{ gap: 1, minWidth: 0 }}>
        <strong className="system-value">{value}</strong>
        <span className="xs muted">{detail}</span>
      </span>
    </div>
  );
}

/** Giorni oltre i quali un backup smette di essere rassicurante. */
const BACKUP_STALE_DAYS = 7;

function SystemStatus({ activeTab, onGoToBackup }: { activeTab: Tab; onGoToBackup: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    <section className="panel">
      <header className="panel-header">
        <div className="col" style={{ gap: 0 }}>
          <h2 className="panel-title">Stato del sistema</h2>
          <span className="xs muted">Letto adesso dal disco, non dalla memoria dell’applicazione.</span>
        </div>
        {/* Sulla scheda Backup il bottone lo porta il pannello sotto: la stessa
            azione due volte nella stessa schermata e' solo rumore. */}
        {activeTab === 'backup' ? null : backupTone === 'warn' ? (
          <button
            type="button"
            className={`btn btn-primary btn-sm${create.isPending ? ' loading' : ''}`}
            onClick={() => create.mutate()}
          >
            <Icon name="shield" size={15} /> Crea backup adesso
          </button>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onGoToBackup}>
            Gestisci i backup
          </button>
        )}
      </header>

      {loading ? (
        <Skeleton rows={1} height={56} />
      ) : (
        <div className="system-grid">
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
    </section>
  );
}

/* ============================================================================
   Generale
   ========================================================================== */

/** Un gruppo di campi con un suo titolo: sei preferenze slegate diventano due temi. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="settings-group" aria-labelledby={titleId}>
      <h3 className="settings-group-title" id={titleId}>
        {title}
      </h3>
      {hint ? <p className="xs muted">{hint}</p> : null}
      <div className="form-grid narrow">{children}</div>
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
  const toast = useToast();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const formRef = useRef<HTMLFormElement>(null);

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
      toast.success('Preferenze salvate');
      setDraft(null);
    },
    onError: (error) => toast.fail(error),
  });

  if (settings.isLoading) {
    return (
      <section className="panel">
        <Skeleton rows={4} />
      </section>
    );
  }

  if (settings.error) return <ErrorBox error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <form
      className="panel"
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        // Il bottone resta acceso anche con dati sbagliati: premendolo si finisce
        // sul primo campo da correggere, invece che su un comando spento e muto.
        if (invalid) {
          formRef.current?.querySelector<HTMLInputElement>('.input.invalid')?.focus();
          return;
        }
        if (dirty) save.mutate();
      }}
    >
      <header className="panel-header">
        <div className="col" style={{ gap: 0 }}>
          <h2 className="panel-title">Preferenze</h2>
          <span className="xs muted">Valgono per i prossimi oggetti e per gli avvisi. Niente di già inserito cambia.</span>
        </div>
      </header>

      <div className="panel-body settings-form">
        <Group title="Valori predefiniti" hint="Quello che trovi già compilato quando aggiungi un oggetto.">
          <Field label="Valuta" hint="Codice a tre lettere" error={errors['app.default_currency']}>
            <input
              className={`input compact${errors['app.default_currency'] ? ' invalid' : ''}`}
              value={values['app.default_currency'] ?? 'EUR'}
              onChange={(event) => set('app.default_currency', event.target.value.toUpperCase())}
              maxLength={3}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Unità di misura" hint="pz, kg, l, m…" error={errors['app.default_unit']}>
            <input
              className={`input compact${errors['app.default_unit'] ? ' invalid' : ''}`}
              value={values['app.default_unit'] ?? 'pz'}
              onChange={(event) => set('app.default_unit', event.target.value)}
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </Group>

        <Group title="Avvisi" hint="Con quanto anticipo la dashboard e la pagina Scadenze segnalano quello che sta per succedere.">
          <Field label="Garanzia in scadenza" hint="Giorni di anticipo" error={errors['alerts.warranty_days']}>
            <input
              className={`input compact${errors['alerts.warranty_days'] ? ' invalid' : ''}`}
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
            <input
              className={`input compact${errors['alerts.expiration_days'] ? ' invalid' : ''}`}
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
            <input
              className={`input compact${errors['alerts.dashboard_limit'] ? ' invalid' : ''}`}
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

      {/* Compare solo quando c'e' qualcosa da salvare: finché non tocchi niente,
          la pagina non ti chiede niente. */}
      {dirty ? (
        <div className="savebar">
          <span className="small row" style={{ gap: 6 }}>
            <Icon name="info" size={14} />
            {invalid ? 'Controlla i campi segnati' : 'Modifiche non salvate'}
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>
              Annulla
            </button>
            <button type="submit" className={`btn btn-primary btn-sm${save.isPending ? ' loading' : ''}`}>
              Salva
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/* ============================================================================
   Stati
   ========================================================================== */

/** Casella con un'area di clic decente: 16px di checkbox sono un bersaglio, non un comando. */
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
    <label className="toggle-cell">
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span className="sr-only">{label}</span>
    </label>
  );
}

function StatusSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    <section className="panel">
      <header className="panel-header">
        <div className="col" style={{ gap: 0 }}>
          <h2 className="panel-title">Stati degli oggetti</h2>
          <span className="xs muted" style={{ maxWidth: '80ch' }}>
            Le due caselle contano davvero: <strong>Possesso</strong> fa entrare l’oggetto nel valore dell’inventario,{' '}
            <strong>Da comprare</strong> lo fa comparire fra le cose che mancano.
          </span>
        </div>
      </header>

      {statuses.isLoading ? (
        <Skeleton rows={4} height={36} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Etichetta</th>
                <th className="center">Possesso</th>
                <th className="center">Da comprare</th>
                <th className="center">Predefinito</th>
                <th className="right">Oggetti</th>
                <th aria-label="Azioni" />
              </tr>
            </thead>
            <tbody>
              {list.map((status) => (
                <tr key={status.id}>
                  <td>
                    <div className="row">
                      <span className="badge-dot" style={{ background: status.color ?? 'var(--ink-faint)' }} />
                      <input
                        className="input"
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
                        style={{ maxWidth: 210 }}
                        aria-label={`Etichetta dello stato ${status.label}`}
                      />
                      {status.is_system === 1 ? (
                        <span className="badge" title="Stato di sistema: si può rinominare, non eliminare">
                          sistema
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="center">
                    <ToggleCell
                      checked={status.counts_as_owned === 1}
                      onChange={() =>
                        update.mutate({ id: status.id, payload: { counts_as_owned: status.counts_as_owned !== 1 } })
                      }
                      label={`${status.label}: conta come posseduto`}
                    />
                  </td>
                  <td className="center">
                    <ToggleCell
                      checked={status.is_wishlist === 1}
                      onChange={() => update.mutate({ id: status.id, payload: { is_wishlist: status.is_wishlist !== 1 } })}
                      label={`${status.label}: da comprare`}
                    />
                  </td>
                  <td className="center">
                    <ToggleCell
                      type="radio"
                      name="stato-predefinito"
                      checked={status.is_default === 1}
                      onChange={() => update.mutate({ id: status.id, payload: { is_default: true } })}
                      label={`${status.label}: stato predefinito dei nuovi oggetti`}
                    />
                  </td>
                  <td className="num right">
                    {status.item_count > 0 ? (
                      <Link to={`/inventario?status_ids=${status.id}`} className="quiet-link">
                        {status.item_count}
                      </Link>
                    ) : (
                      <span className="faint">0</span>
                    )}
                  </td>
                  <td className="right">
                    {status.is_system === 1 ? null : (
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={() => setDeleting(status)}
                        aria-label={`Elimina lo stato ${status.label}`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="panel-body row"
        style={{ borderTop: '1px solid var(--border)' }}
        onSubmit={(event) => {
          event.preventDefault();
          if (newLabel.trim()) create.mutate();
        }}
      >
        <input
          className="input"
          placeholder="Nuovo stato, per esempio In riparazione"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          aria-label="Etichetta del nuovo stato"
          style={{ maxWidth: 300 }}
        />
        <button type="submit" className={`btn${create.isPending ? ' loading' : ''}`} disabled={!newLabel.trim()}>
          <Icon name="plus" size={15} /> Aggiungi
        </button>
      </form>

      {deleting ? (
        <ConfirmDialog
          title={`Eliminare lo stato «${deleting.label}»?`}
          destructive
          confirmLabel="Elimina stato"
          confirmDisabled={needsTarget}
          message={
            <div className="col">
              {deleting.item_count > 0 ? (
                <>
                  <p>
                    {plural(deleting.item_count, 'oggetto usa', 'oggetti usano')} questo stato. Nessuno viene eliminato: scegli lo stato da dare
                    loro.
                  </p>
                  <select
                    className="select"
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                    aria-label="Stato da assegnare agli oggetti"
                  >
                    <option value="">Scegli uno stato</option>
                    {list
                      .filter((entry) => entry.id !== deleting.id)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                  </select>
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
    </section>
  );
}

/* ============================================================================
   Tag e negozi
   ========================================================================== */

type Pending = { kind: 'tag' | 'vendor'; id: number; name: string; count: number };

function SupportSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
      <div className="panel-grid narrow">
        <section className="panel">
          <header className="panel-header">
            <div className="col" style={{ gap: 0 }}>
              <h2 className="panel-title">Tag</h2>
              <span className="xs muted">Etichette libere, trasversali alle categorie.</span>
            </div>
            <span className="badge">{tagList.length}</span>
          </header>

          <div className="panel-body col">
            {tags.isLoading ? (
              <Skeleton rows={2} height={26} />
            ) : tagList.length === 0 ? (
              <p className="small muted">
                Nessun tag. Si creano anche al volo mentre compili un oggetto: qui li rivedi tutti insieme.
              </p>
            ) : (
              <div className="row wrap" style={{ gap: 6 }}>
                {tagList.map((tag) => (
                  <span key={tag.id} className="tag">
                    <Link to={`/inventario?tag_ids=${tag.id}`} className="quiet-link">
                      {tag.name}
                    </Link>
                    {/* Uno zero accanto a ogni nome sarebbe solo rumore. */}
                    {tag.item_count > 0 ? <span className="faint">{tag.item_count}</span> : null}
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'tag', id: tag.id, name: tag.name, count: tag.item_count })}
                      aria-label={`Elimina il tag ${tag.name}`}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                if (newTag.trim()) createTag.mutate();
              }}
            >
              <input
                className="input"
                placeholder="Nuovo tag, per esempio fragile"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                aria-label="Nome del nuovo tag"
              />
              <button type="submit" className="btn" disabled={!newTag.trim() || createTag.isPending} aria-label="Aggiungi tag">
                <Icon name="plus" size={15} />
              </button>
            </form>
            <p className="xs muted">Eliminare un tag non elimina gli oggetti: toglie soltanto l’etichetta.</p>
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <div className="col" style={{ gap: 0 }}>
              <h2 className="panel-title">Negozi</h2>
              <span className="xs muted">Dove hai comprato. Alimentano le statistiche di spesa.</span>
            </div>
            <span className="badge">{vendorList.length}</span>
          </header>

          <div className="panel-body col">
            {vendors.isLoading ? (
              <Skeleton rows={3} height={26} />
            ) : vendorList.length === 0 ? (
              <p className="small muted">Nessun negozio. Si crea scrivendone il nome nella scheda di un oggetto.</p>
            ) : (
              <div className="col" style={{ gap: 0 }}>
                {vendorList.map((vendor) => (
                  <div key={vendor.id} className="file-row">
                    <Icon name="cart" size={15} className="faint" />
                    <span className="grow truncate">{vendor.name}</span>
                    <span className="xs muted">{plural(vendor.item_count, 'oggetto', 'oggetti')}</span>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      onClick={() =>
                        setPending({ kind: 'vendor', id: vendor.id, name: vendor.name, count: vendor.item_count })
                      }
                      aria-label={`Elimina il negozio ${vendor.name}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                if (newVendor.trim()) createVendor.mutate();
              }}
            >
              <input
                className="input"
                placeholder="Nuovo negozio, per esempio IKEA"
                value={newVendor}
                onChange={(event) => setNewVendor(event.target.value)}
                aria-label="Nome del nuovo negozio"
              />
              <button
                type="submit"
                className="btn"
                disabled={!newVendor.trim() || createVendor.isPending}
                aria-label="Aggiungi negozio"
              >
                <Icon name="plus" size={15} />
              </button>
            </form>
            <p className="xs muted">Gli oggetti restano al loro posto: perdono soltanto il riferimento al negozio.</p>
          </div>
        </section>
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
  const toast = useToast();
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
      toast.success(`Backup creato: ${info.files} allegati, ${fileSize(info.bytes)}`);
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
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <section className="panel">
        <header className="panel-header">
          <div className="col" style={{ gap: 0 }}>
            <h2 className="panel-title">Backup</h2>
            <span className="xs muted" style={{ maxWidth: '80ch' }}>
              Ogni backup è una cartella con database, allegati e un manifest di controllo: si può ripristinare anche a mano,
              senza questa applicazione.
            </span>
          </div>
          <button type="button" className={`btn btn-primary${create.isPending ? ' loading' : ''}`} onClick={() => create.mutate()}>
            <Icon name="shield" size={15} /> Crea backup adesso
          </button>
        </header>

        {backups.error ? (
          <div className="panel-body">
            <ErrorBox error={backups.error} onRetry={() => void backups.refetch()} />
          </div>
        ) : backups.isLoading ? (
          <Skeleton rows={3} height={40} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="shield"
            title="Nessun backup"
            description="Ne viene creato uno da solo all’avvio, se l’ultimo ha più di 24 ore. Puoi crearne uno adesso."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Etichetta</th>
                    <th className="right">Allegati</th>
                    <th className="right">Dimensione</th>
                    <th aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((backup, index) => (
                    <tr key={backup.name}>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="num">{backupLabel(backup.name)}</span>
                          {index === 0 ? <span className="badge accent">il più recente</span> : null}
                          {!backup.valid ? <span className="badge danger">manifest illeggibile</span> : null}
                        </div>
                      </td>
                      <td className="muted">{backup.label ?? '—'}</td>
                      <td className="num right">{backup.files}</td>
                      <td className="num right">{fileSize(backup.bytes)}</td>
                      <td>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                          <button
                            type="button"
                            className={`btn btn-sm${verify.isPending && verify.variables === backup.name ? ' loading' : ''}`}
                            onClick={() => verify.mutate(backup.name)}
                            disabled={verify.isPending}
                          >
                            Verifica
                          </button>
                          <button type="button" className="btn btn-sm" onClick={() => setRestoring(backup.name)}>
                            Ripristina
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost"
                            onClick={() => setDeleting(backup.name)}
                            aria-label={`Elimina il backup del ${backupLabel(backup.name)}`}
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
            <p className="panel-note">
              {plural(list.length, 'backup sul disco', 'backup sul disco')}, {fileSize(totalBytes)} in tutto.
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2 className="panel-title">Rotazione</h2>
        </header>
        <form
          className="panel-body col"
          onSubmit={(event) => {
            event.preventDefault();
            if (keep !== null && !keepInvalid) saveKeep.mutate(keepValue);
          }}
        >
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            Quando ne nasce uno nuovo, i backup più vecchi oltre questo numero vengono rimossi dal disco. Se ne vuoi tenere
            uno per sempre, copialo altrove: qui dentro prima o poi scade.
          </p>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Backup da conservare" error={keepInvalid ? 'Un numero fra 1 e 50' : undefined}>
              <input
                className={`input compact${keepInvalid ? ' invalid' : ''}`}
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={50}
                value={keepValue}
                onChange={(event) => setKeep(event.target.value)}
              />
            </Field>
            {keep !== null ? (
              <>
                <button
                  type="submit"
                  className={`btn btn-primary${saveKeep.isPending ? ' loading' : ''}`}
                  disabled={keepInvalid}
                >
                  Salva
                </button>
                <button type="button" className="btn" onClick={() => setKeep(null)}>
                  Annulla
                </button>
              </>
            ) : null}
          </div>
        </form>
      </section>

      {restoring ? (
        <ConfirmDialog
          title="Ripristinare questo backup?"
          confirmLabel="Ripristina"
          destructive
          message={
            <div className="col">
              <p>
                Il database attuale viene sostituito con quello del {backupLabel(restoring)}. Tutto quello che hai inserito
                dopo quella data sparisce.
              </p>
              <p className="small muted">
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
  const toast = useToast();
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
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <section className="panel">
        <header className="panel-header">
          <h2 className="panel-title">Esporta</h2>
        </header>
        <div className="panel-body col">
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            I tuoi dati devono restare leggibili anche senza questa applicazione. Il CSV si apre in Excel o LibreOffice; il
            JSON contiene tutto il database ed è il formato giusto per reimportare senza perdere niente.
          </p>
          <div className="row wrap">
            <a href={api.exportCsvUrl} className="btn" download>
              <Icon name="download" size={15} /> Oggetti in CSV
            </a>
            <a href={api.exportJsonUrl} className="btn" download>
              <Icon name="download" size={15} /> Tutto in JSON
            </a>
          </div>
          <p className="xs muted">
            Le foto e i documenti non stanno dentro l’export: sono nella cartella dei dati e finiscono nei backup.
          </p>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2 className="panel-title">Importa</h2>
        </header>
        <div className="panel-body col">
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            Accetta i file CSV o JSON prodotti da questa applicazione, e qualunque CSV che abbia almeno la colonna{' '}
            <code className="mono">name</code>. Le colonne <code className="mono">category_path</code> e{' '}
            <code className="mono">location_path</code> accettano percorsi come «Casa / Cucina / Cassetto 2» e creano quello
            che manca. Se la riga ha un <code className="mono">uid</code> già presente, l’oggetto viene aggiornato invece che
            duplicato.
          </p>

          <label
            className={`dropzone${dragging ? ' dragging' : ''}`}
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
            <p className="small" style={{ marginTop: 6 }}>
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
            <div className="col" style={{ gap: 6 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="badge ok">{report.created} creati</span>
                <span className="badge info">{report.updated} aggiornati</span>
                {report.skipped > 0 ? <span className="badge">{report.skipped} saltati</span> : null}
                {report.errors.length > 0 ? <span className="badge danger">{report.errors.length} errori</span> : null}
              </div>
              {report.errors.length > 0 ? (
                <ul className="small muted" style={{ paddingLeft: 18 }}>
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
      </section>

      <SeedPanel />
    </div>
  );
}

function SeedPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">Dati iniziali</h2>
      </header>
      <div className="panel-body col">
        <p className="small muted" style={{ maxWidth: '70ch' }}>
          Inserisce un insieme di categorie e stanze di partenza, ma solo se il database non ne ha ancora: non sovrascrive
          niente. Resta tutto rinominabile ed eliminabile.
        </p>
        <div>
          <button type="button" className={`btn${seed.isPending ? ' loading' : ''}`} onClick={() => seed.mutate()}>
            <Icon name="refresh" size={15} /> Inserisci categorie e stanze iniziali
          </button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
   Diagnostica
   ========================================================================== */

function CopyRow({ value, label }: { value: string; label: string }) {
  const toast = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}: percorso copiato`);
    } catch {
      toast.fail(new Error('Il browser non ha permesso la copia'));
    }
  };

  return (
    <span className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
      <span className="mono xs grow" style={{ overflowWrap: 'anywhere' }}>
        {value}
      </span>
      <button type="button" className="btn btn-icon btn-ghost" onClick={() => void copy()} aria-label={`Copia ${label}`}>
        <Icon name="copy" size={14} />
      </button>
    </span>
  );
}

function DiagnosticsSection() {
  const toast = useToast();
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
      else toast.fail(new Error(`${result.missing.length} file mancanti, ${result.corrupted.length} corrotti`));
    },
    onError: (error) => toast.fail(error),
  });

  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <section className="panel">
        <header className="panel-header">
          <div className="col" style={{ gap: 0 }}>
            <h2 className="panel-title">Dove stanno i dati</h2>
            <span className="xs muted">Copiare questa cartella su un altro computer basta a spostare tutto.</span>
          </div>
        </header>
        <div className="panel-body">
          {health.isLoading ? (
            <Skeleton rows={3} height={20} />
          ) : health.data ? (
            <dl className="spec-list">
              <dt>Cartella dati</dt>
              <dd>
                <CopyRow value={health.data.data_dir} label="Cartella dati" />
              </dd>
              <dt>File del database</dt>
              <dd>
                <CopyRow value={health.data.database} label="File del database" />
              </dd>
              <dt>Versione dello schema</dt>
              <dd className="num">{health.data.schema_version}</dd>
              <dt>Node.js</dt>
              <dd className="mono xs">{health.data.node}</dd>
              <dt>Server attivo da</dt>
              <dd>{Math.max(1, Math.round(health.data.uptime_seconds / 60))} minuti</dd>
            </dl>
          ) : (
            <ErrorBox error={health.error} onRetry={() => void health.refetch()} />
          )}
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div className="col" style={{ gap: 0 }}>
            <h2 className="panel-title">Archivio dei file</h2>
            <span className="xs muted">Foto e documenti allegati, con verifica di presenza e di integrità.</span>
          </div>
        </header>
        <div className="panel-body col">
          {storage.isLoading ? (
            <Skeleton rows={2} height={20} />
          ) : storage.data ? (
            <>
              <dl className="spec-list">
                <dt>File archiviati</dt>
                <dd className="num">{storage.data.files}</dd>
                <dt>Allegati collegati</dt>
                <dd className="num">{storage.data.attachments}</dd>
                <dt>Spazio occupato</dt>
                <dd className="num">{fileSize(storage.data.total_bytes)}</dd>
                <dt>File non più usati</dt>
                <dd className="num">{storage.data.orphan_blobs}</dd>
                <dt>File mancanti sul disco</dt>
                <dd>
                  {storage.data.missing.length === 0 ? (
                    <span className="badge ok">
                      <Icon name="check" size={11} /> nessuno
                    </span>
                  ) : (
                    <span className="badge danger">
                      <Icon name="alert" size={11} /> {storage.data.missing.length}
                    </span>
                  )}
                </dd>
              </dl>

              <div className="row wrap">
                <button
                  type="button"
                  className={`btn${deepCheck.isPending ? ' loading' : ''}`}
                  onClick={() => deepCheck.mutate()}
                  disabled={deepCheck.isPending}
                >
                  <Icon name="shield" size={15} /> Verifica integrità
                </button>
                <button
                  type="button"
                  className={`btn${gc.isPending ? ' loading' : ''}`}
                  onClick={() => setCollecting(true)}
                  disabled={gc.isPending || storage.data.orphan_blobs === 0}
                >
                  <Icon name="trash" size={15} /> Elimina i file non più usati
                </button>
              </div>
              <p className="xs muted" style={{ maxWidth: '70ch' }}>
                La verifica ricalcola l’impronta di ogni file: su archivi grandi ci mette qualche secondo. Un file viene
                rimosso solo se nessun oggetto lo usa più: cancellare un oggetto non cancella mai un documento condiviso con
                un altro.
              </p>
            </>
          ) : (
            <ErrorBox error={storage.error} onRetry={() => void storage.refetch()} />
          )}
        </div>
      </section>

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
