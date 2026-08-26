/**
 * Posizioni: la mappa fisica della casa. Stanze, mobili, ripiani e scatoloni
 * sono lo stesso tipo di nodo a livelli diversi, distinti dal "tipo".
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { plural } from '@/lib/format.ts';
import { LOCATION_KINDS, LOCATION_KIND_LABELS, type LocationKind, type LocationNode } from '@/lib/types.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { TreeView } from '@/components/TreeView.tsx';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingRows, Page, PageHeader, toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type EditState = {
  mode: 'create' | 'edit';
  id?: number;
  name: string;
  parent_id: number | null;
  kind: LocationKind;
  code: string;
  notes: string;
};

const ROOT = '__radice__';

const iconForKind = (kind: string): IconName =>
  kind === 'container' ? 'container' : kind === 'room' || kind === 'building' ? 'room' : 'pin';

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
  const rooms = locations.filter((location) => location.kind === 'room').length;
  const containers = locations.filter((location) => location.kind === 'container').length;

  return (
    <Page>
      <PageHeader
        title="Posizioni"
        description={
          <>
            {plural(locations.length, 'posizione', 'posizioni')} · {plural(rooms, 'stanza', 'stanze')} ·{' '}
            {plural(containers, 'contenitore', 'contenitori')}. Apri una posizione per vedere cosa contiene.
          </>
        }
        actions={
          <Button onClick={() => setEdit(blank(null, 'building'))}>
            <Icon name="plus" size={15} /> Nuova posizione
          </Button>
        }
      />

      {tree.error ? <ErrorState error={tree.error} onRetry={() => void tree.refetch()} /> : null}

      <section className="border-t border-border pt-3">
        {tree.isLoading ? (
          <LoadingRows rows={8} height={30} />
        ) : (tree.data?.tree.length ?? 0) === 0 ? (
          <EmptyState
            icon="pin"
            title="Nessuna posizione"
            description="Comincia dalla casa, poi aggiungi le stanze e, dentro le stanze, mobili e contenitori. È questa struttura che poi risponde alla domanda: dove sta questa cosa?"
            action={<Button onClick={() => setEdit(blank(null, 'building'))}>Crea la prima posizione</Button>}
          />
        ) : (
          <TreeView
            nodes={tree.data!.tree}
            initialDepth={2}
            onSelect={(node) => navigate(`/posizioni/${node.id}`)}
            renderIcon={(node) => <Icon name={iconForKind(node.kind)} size={15} className="shrink-0 text-faint" />}
            renderMeta={(node) => (
              <>
                <span className="hidden shrink-0 rounded-full bg-secondary px-2 py-px text-2xs text-muted-foreground sm:block">
                  {LOCATION_KIND_LABELS[node.kind]}
                </span>
                {node.code ? <span className="hidden shrink-0 font-mono text-2xs text-faint md:block">{node.code}</span> : null}
              </>
            )}
            renderActions={(node) => (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Aggiungi una posizione dentro ${node.name}`}
                  onClick={() => setEdit(blank(node.id, node.kind === 'room' ? 'furniture' : 'container'))}
                >
                  <Icon name="plus" size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
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
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Elimina ${node.name}`}
                  className="hover:text-destructive"
                  onClick={() => setDeleting(node)}
                >
                  <Icon name="trash" size={14} />
                </Button>
              </>
            )}
          />
        )}
      </section>

      <Dialog open={edit !== null} onOpenChange={(open) => (open ? undefined : setEdit(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.mode === 'create' ? 'Nuova posizione' : 'Modifica posizione'}</DialogTitle>
          </DialogHeader>

          {edit ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (edit.name.trim()) save.mutate(edit);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome">
                  <Input
                    value={edit.name}
                    onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                    placeholder="Es. Cassetto 2"
                    autoFocus
                  />
                </Field>
                <Field label="Tipo">
                  <Select value={edit.kind} onValueChange={(value) => setEdit({ ...edit, kind: value as LocationKind })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATION_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {LOCATION_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Dentro" hint="Lascia «Primo livello» per la casa o un edificio.">
                <Select
                  value={edit.parent_id === null ? ROOT : String(edit.parent_id)}
                  onValueChange={(value) => setEdit({ ...edit, parent_id: value === ROOT ? null : Number(value) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Primo livello</SelectItem>
                    {locations
                      .filter((location) => location.id !== edit.id)
                      .map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>
                          {location.path}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Codice" hint="L’etichetta da scrivere sulla scatola. In futuro diventa un QR.">
                <Input
                  value={edit.code}
                  onChange={(event) => setEdit({ ...edit, code: event.target.value })}
                  placeholder="Es. BOX-01"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              <Field label="Note">
                <Textarea value={edit.notes} onChange={(event) => setEdit({ ...edit, notes: event.target.value })} rows={2} />
              </Field>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                  Annulla
                </Button>
                <Button type="submit" variant="default" disabled={!edit.name.trim() || save.isPending}>
                  Salva
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {deleting ? (
        <ConfirmDialog
          title={`Eliminare «${deleting.name}»?`}
          destructive
          confirmLabel="Elimina posizione"
          message={
            <div className="flex flex-col gap-3">
              <p>
                {deleting.total_item_count > 0
                  ? `Qui dentro ${deleting.total_item_count === 1 ? 'c’è 1 oggetto' : `ci sono ${deleting.total_item_count} oggetti`}: non ${deleting.total_item_count === 1 ? 'verrà eliminato, salirà' : 'verranno eliminati, saliranno'} al livello superiore.`
                  : 'Non contiene oggetti.'}
              </p>
              {deleting.children.length > 0 ? (
                <label className="flex cursor-pointer items-start gap-2 text-base text-foreground">
                  <Checkbox checked={cascade} onCheckedChange={(checked) => setCascade(checked === true)} className="mt-0.5" />
                  Elimina anche le {plural(deleting.children.length, 'sotto-posizione', 'sotto-posizioni')}
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
    </Page>
  );
}
