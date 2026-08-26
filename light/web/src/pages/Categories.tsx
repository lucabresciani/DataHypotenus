/**
 * Categorie: albero modificabile. Niente elenchi fissi nel codice, l'utente
 * crea, rinomina, sposta ed elimina come vuole.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { plural } from '../lib/format.ts';
import type { CategoryNode } from '../lib/types.ts';
import { Icon } from '../components/Icon.tsx';
import { TreeView } from '../components/TreeView.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Field, Modal, Skeleton, useToast } from '../components/ui.tsx';

type EditState = { mode: 'create' | 'edit'; id?: number; name: string; parent_id: number | null };

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const [edit, setEdit] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const [cascade, setCascade] = useState(false);

  const tree = useQuery({ queryKey: ['category-tree'], queryFn: api.categoryTree });
  const flat = useQuery({ queryKey: ['categories'], queryFn: api.categories });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['category-tree'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: (state: EditState) =>
      state.mode === 'create'
        ? api.createCategory({ name: state.name, parent_id: state.parent_id })
        : api.updateCategory(state.id!, { name: state.name, parent_id: state.parent_id }),
    onSuccess: () => {
      invalidate();
      toast.success('Categoria salvata');
      setEdit(null);
    },
    onError: (error) => toast.fail(error, 'Categoria non salvata'),
  });

  const remove = useMutation({
    mutationFn: ({ id, withChildren }: { id: number; withChildren: boolean }) => api.deleteCategory(id, withChildren),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.movedChildren > 0
          ? `Categoria eliminata: ${result.movedChildren} sottocategorie spostate al livello superiore`
          : 'Categoria eliminata',
      );
      setDeleting(null);
      setCascade(false);
    },
    onError: (error) => toast.fail(error),
  });

  const total = flat.data?.categories.length ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Categorie</h1>
          <p className="muted">
            {plural(total, 'categoria', 'categorie')}, su più livelli. Le sottocategorie ereditano il conteggio degli oggetti.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({ mode: 'create', name: '', parent_id: null })}>
          <Icon name="plus" size={15} /> Nuova categoria
        </button>
      </header>

      {tree.error ? <ErrorBox error={tree.error} onRetry={() => void tree.refetch()} /> : null}

      <section className="panel">
        {tree.isLoading ? (
          <Skeleton rows={6} height={28} />
        ) : (tree.data?.tree.length ?? 0) === 0 ? (
          <EmptyState
            icon="folder"
            title="Nessuna categoria"
            description="Le categorie servono a raggruppare gli oggetti per genere (cucina, elettronica, abbigliamento). Puoi crearle a mano o ripristinare quelle iniziali dalle impostazioni."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setEdit({ mode: 'create', name: '', parent_id: null })}>
                Crea la prima categoria
              </button>
            }
          />
        ) : (
          <div className="panel-body">
            <TreeView
              nodes={tree.data!.tree}
              onSelect={(node) => navigate(`/inventario?category_id=${node.id}`)}
              renderIcon={() => <Icon name="folder" size={15} className="faint" />}
              renderActions={(node) => (
                <>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    title="Aggiungi sottocategoria"
                    aria-label={`Aggiungi sottocategoria a ${node.name}`}
                    onClick={() => setEdit({ mode: 'create', name: '', parent_id: node.id })}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    title="Rinomina o sposta"
                    aria-label={`Modifica ${node.name}`}
                    onClick={() => setEdit({ mode: 'edit', id: node.id, name: node.name, parent_id: node.parent_id })}
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
          title={edit.mode === 'create' ? 'Nuova categoria' : 'Modifica categoria'}
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
            <Field label="Nome">
              <input
                className="input"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="Es. Elettrodomestici"
                autoFocus
              />
            </Field>
            <Field label="Dentro la categoria" hint="Lascia vuoto per una categoria di primo livello">
              <select
                className="select"
                value={edit.parent_id === null ? '' : String(edit.parent_id)}
                onChange={(e) => setEdit({ ...edit, parent_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Primo livello —</option>
                {(flat.data?.categories ?? [])
                  .filter((category) => category.id !== edit.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.path}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Eliminare "${deleting.name}"?`}
          destructive
          confirmLabel="Elimina categoria"
          message={
            <div className="col">
              <p>
                {deleting.children.length > 0
                  ? `Contiene ${deleting.children.length} sottocategorie.`
                  : 'Non contiene sottocategorie.'}{' '}
                {deleting.total_item_count > 0
                  ? `${plural(deleting.total_item_count, 'oggetto la usa', 'oggetti la usano')}: non ${deleting.total_item_count === 1 ? 'verrà eliminato' : 'verranno eliminati'}.`
                  : 'Nessun oggetto la usa.'}
              </p>
              {deleting.children.length > 0 ? (
                <label className="checkbox">
                  <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
                  <span>Elimina anche le sottocategorie (altrimenti salgono di un livello)</span>
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
