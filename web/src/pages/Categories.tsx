/**
 * Categorie: albero modificabile. Niente elenchi fissi nel codice, l'utente
 * crea, rinomina, sposta ed elimina come vuole.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { plural } from '@/lib/format.ts';
import type { CategoryNode } from '@/lib/types.ts';
import { Icon } from '@/components/Icon.tsx';
import { TreeView } from '@/components/TreeView.tsx';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingRows, Page, PageHeader, toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EditState = { mode: 'create' | 'edit'; id?: number; name: string; parent_id: number | null };

const ROOT = '__radice__';

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
          ? `Categoria eliminata: ${plural(result.movedChildren, 'sottocategoria spostata', 'sottocategorie spostate')} al livello superiore`
          : 'Categoria eliminata',
      );
      setDeleting(null);
      setCascade(false);
    },
    onError: (error) => toast.fail(error),
  });

  const total = flat.data?.categories.length ?? 0;
  const newCategory = (parentId: number | null = null) => setEdit({ mode: 'create', name: '', parent_id: parentId });

  return (
    <Page>
      <PageHeader
        title="Categorie"
        description={`${plural(total, 'categoria', 'categorie')}, su più livelli. Le sottocategorie ereditano il conteggio degli oggetti.`}
        actions={
          <Button onClick={() => newCategory()}>
            <Icon name="plus" size={15} /> Nuova categoria
          </Button>
        }
      />

      {tree.error ? <ErrorState error={tree.error} onRetry={() => void tree.refetch()} /> : null}

      <section className="border-t border-border pt-3">
        {tree.isLoading ? (
          <LoadingRows rows={8} height={30} />
        ) : (tree.data?.tree.length ?? 0) === 0 ? (
          <EmptyState
            icon="folder"
            title="Nessuna categoria"
            description="Le categorie raggruppano gli oggetti per genere: cucina, elettronica, abbigliamento. Puoi crearle a mano o ripristinare quelle iniziali dalle impostazioni."
            action={<Button onClick={() => newCategory()}>Crea la prima categoria</Button>}
          />
        ) : (
          <TreeView
            nodes={tree.data!.tree}
            onSelect={(node) => navigate(`/inventario?category_id=${node.id}`)}
            renderIcon={() => <Icon name="folder" size={15} className="shrink-0 text-faint" />}
            renderActions={(node) => (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Aggiungi una sottocategoria a ${node.name}`}
                  onClick={() => newCategory(node.id)}
                >
                  <Icon name="plus" size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rinomina o sposta ${node.name}`}
                  onClick={() => setEdit({ mode: 'edit', id: node.id, name: node.name, parent_id: node.parent_id })}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{edit?.mode === 'create' ? 'Nuova categoria' : 'Modifica categoria'}</DialogTitle>
          </DialogHeader>

          {edit ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (edit.name.trim()) save.mutate(edit);
              }}
            >
              <Field label="Nome">
                <Input
                  value={edit.name}
                  onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                  placeholder="Es. Elettrodomestici"
                  autoFocus
                />
              </Field>

              <Field label="Dentro la categoria" hint="Lascia «Primo livello» per una categoria di partenza.">
                <Select
                  value={edit.parent_id === null ? ROOT : String(edit.parent_id)}
                  onValueChange={(value) => setEdit({ ...edit, parent_id: value === ROOT ? null : Number(value) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Primo livello</SelectItem>
                    {(flat.data?.categories ?? [])
                      .filter((category) => category.id !== edit.id)
                      .map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.path}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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
          confirmLabel="Elimina categoria"
          message={
            <div className="flex flex-col gap-3">
              <p>
                {deleting.children.length > 0
                  ? `Contiene ${plural(deleting.children.length, 'sottocategoria', 'sottocategorie')}.`
                  : 'Non contiene sottocategorie.'}{' '}
                {deleting.total_item_count > 0
                  ? `${plural(deleting.total_item_count, 'oggetto la usa', 'oggetti la usano')}: non ${deleting.total_item_count === 1 ? 'verrà eliminato' : 'verranno eliminati'}.`
                  : 'Nessun oggetto la usa.'}
              </p>
              {deleting.children.length > 0 ? (
                <label className="flex cursor-pointer items-start gap-2 text-base text-foreground">
                  <Checkbox checked={cascade} onCheckedChange={(checked) => setCascade(checked === true)} className="mt-0.5" />
                  Elimina anche le sottocategorie, altrimenti salgono di un livello
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
