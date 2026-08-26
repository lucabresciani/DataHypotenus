/**
 * Posizioni: la mappa fisica della casa. Stanze, mobili, ripiani e scatoloni
 * sono lo stesso tipo di nodo a livelli diversi, distinti dal "tipo".
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { plural } from '../lib/format.ts';
import { LOCATION_KINDS, LOCATION_KIND_LABELS, type LocationKind, type LocationNode } from '../lib/types.ts';
import { Icon, type IconName } from '../components/Icon.tsx';
import { TreeView } from '../components/TreeView.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Field, Modal, Skeleton, useToast } from '../components/ui.tsx';

type EditState = {
  mode: 'create' | 'edit';
  id?: number;
  name: string;
  parent_id: number | null;
  kind: LocationKind;
  code: string;
  notes: string;
};

const iconForKind = (kind: string): IconName =>
  kind === 'container' ? 'container' : kind === 'room' ? 'room' : kind === 'building' ? 'room' : 'pin';

const blank = (parentId: number | null, kind: LocationKind = 'room'): EditState => ({
  mode: 'create',
  name: '',
  parent_id: parentId,
  kind,
  code: '',
  notes: '',
});

export function LocationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<LocationNode | null>(null);
  const [cascade, setCascade] = useState(false);

  const tree = useQuery({ queryKey: ['location-tree'], queryFn: api.locationTree });
  const flat = useQuery({ queryKey: ['locations'], queryFn: api.locations });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['location-tree'] });
    void queryClient.invalidateQueries({ queryKey: ['locations'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: (state: EditState) => {
      const payload = {
        name: state.name,
        parent_id: state.parent_id,
        kind: state.kind,
        code: state.code || null,
        notes: state.notes || null,
      };
      return state.mode === 'create' ? api.createLocation(payload) : api.updateLocation(state.id!, payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Posizione salvata');
      setEdit(null);
    },
    onError: (error) => toast.fail(error, 'Posizione non salvata'),
  });

  const remove = useMutation({
    mutationFn: ({ id, withChildren }: { id: number; withChildren: boolean }) => api.deleteLocation(id, withChildren),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.detachedItems > 0
          ? `Posizione eliminata: ${plural(result.detachedItems, 'oggetto spostato', 'oggetti spostati')} al livello superiore`
          : 'Posizione eliminata',
      );
      setDeleting(null);
      setCascade(false);
    },
    onError: (error) => toast.fail(error),
  });

  const locations = flat.data?.locations ?? [];
  const rooms = locations.filter((l) => l.kind === 'room').length;
  const containers = locations.filter((l) => l.kind === 'container').length;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Posizioni</h1>
          <p className="muted">
            {plural(locations.length, 'posizione', 'posizioni')} · {plural(rooms, 'stanza', 'stanze')} ·{' '}
            {plural(containers, 'contenitore', 'contenitori')}. Fai clic su una posizione per vedere cosa
            contiene.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEdit(blank(null, 'building'))}>
          <Icon name="plus" size={15} /> Nuova posizione
        </button>
      </header>

      {tree.error ? <ErrorBox error={tree.error} onRetry={() => void tree.refetch()} /> : null}

      <section className="panel">
        {tree.isLoading ? (
          <Skeleton rows={6} height={28} />
        ) : (tree.data?.tree.length ?? 0) === 0 ? (
          <EmptyState
            icon="pin"
            title="Nessuna posizione"
            description="Comincia dalla casa, poi aggiungi le stanze e, dentro le stanze, mobili e contenitori. E questa struttura che poi risponde a: dove sta questa cosa?"
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEdit(blank(null, 'building'))}>
                Crea la prima posizione
              </button>
            }
          />
        ) : (
          <div className="panel-body">
            <TreeView
              nodes={tree.data!.tree}
              initialDepth={2}
              onSelect={(node) => navigate(`/posizioni/${node.id}`)}
              renderIcon={(node) => <Icon name={iconForKind(node.kind)} size={15} className="faint" />}
              renderMeta={(node) => (
                <>
                  <span className="badge">{LOCATION_KIND_LABELS[node.kind]}</span>
                  {node.code ? <span className="xs mono faint">{node.code}</span> : null}
                </>
              )}
              renderActions={(node) => (
                <>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    title="Aggiungi sotto-posizione"
                    aria-label={`Aggiungi una posizione dentro ${node.name}`}
                    onClick={() => setEdit(blank(node.id, node.kind === 'room' ? 'furniture' : 'container'))}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    title="Modifica"
                    aria-label={`Modifica ${node.name}`}
                    onClick={() =>
                      setEdit({
                        mode: 'edit',
                        id: node.id,
                        name: node.name,
                        parent_id: node.parent_id,
                        kind: node.kind,
                        code: node.code ?? '',
                        notes: node.notes ?? '',
                      })
                    }
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    title="Elimina"
                    aria-label={`Elimina ${node.name}`}
                    onClick={() => setDeleting(node)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            />
          </div>
        )}
      </section>

      {edit ? (
        <Modal
          title={edit.mode === 'create' ? 'Nuova posizione' : 'Modifica posizione'}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEdit(null)}>
                Annulla
              </button>
              <button
                type="button"
                className={`btn btn-primary${save.isPending ? ' loading' : ''}`}
                onClick={() => save.mutate(edit)}
                disabled={!edit.name.trim() || save.isPending}
              >
                Salva
              </button>
            </>
          }
        >
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Nome">
                <input
                  className="input"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="Es. Cassetto 2"
                  autoFocus
                />
              </Field>
              <Field label="Tipo">
                <select className="select" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as LocationKind })}>
                  {LOCATION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {LOCATION_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Dentro" hint="Lascia vuoto per una posizione di primo livello">
              <select
                className="select"
                value={edit.parent_id === null ? '' : String(edit.parent_id)}
                onChange={(e) => setEdit({ ...edit, parent_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Primo livello —</option>
                {locations
                  .filter((location) => location.id !== edit.id)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Codice" hint="Etichetta da scrivere sulla scatola; in futuro utilizzabile come QR code">
              <input
                className="input"
                value={edit.code}
                onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                placeholder="Es. BOX-01"
              />
            </Field>

            <Field label="Note">
              <textarea className="textarea" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={2} />
            </Field>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Eliminare "${deleting.name}"?`}
          destructive
          confirmLabel="Elimina posizione"
          message={
            <div className="col">
              <p>
                {deleting.total_item_count > 0
                  ? `Qui dentro ${deleting.total_item_count === 1 ? 'c’è 1 oggetto' : `ci sono ${deleting.total_item_count} oggetti`}: non ${deleting.total_item_count === 1 ? 'verrà eliminato, salirà' : 'verranno eliminati, saliranno'} al livello superiore.`
                  : 'Non contiene oggetti.'}
              </p>
              {deleting.children.length > 0 ? (
                <label className="checkbox">
                  <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
                  <span>Elimina anche le {deleting.children.length} sotto-posizioni</span>
                </label>
              ) : null}
            </div>
          }
          onConfirm={() => remove.mutateAsync({ id: deleting.id, withChildren: cascade })}
          onClose={() => {
            setDeleting(null);
            setCascade(false);
          }}
        />
      ) : null}
    </div>
  );
}
