/**
 * Cestino: la rete di sicurezza del soft delete. Da qui si ripristina o si
 * elimina davvero, e solo qui la cancellazione e' definitiva.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { plural, relativeTime } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { ConfirmDialog, EmptyState, ErrorBox, Skeleton, useToast } from '../components/ui.tsx';

export function TrashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const trash = useQuery({
    queryKey: ['items', 'trash'],
    queryFn: () => api.items({ trash: 'only', sort: 'updated_at', direction: 'desc', limit: 200 }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const restore = useMutation({
    mutationFn: (id: number) => api.restoreItem(id),
    onSuccess: (item) => {
      invalidate();
      toast.success(`"${item.name}" ripristinato`);
    },
    onError: (error) => toast.fail(error),
  });

  const purge = useMutation({
    mutationFn: (id: number) => api.deleteItem(id, true),
    onSuccess: () => {
      invalidate();
      toast.notify('Oggetto eliminato definitivamente');
    },
    onError: (error) => toast.fail(error),
  });

  const emptyAll = useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: (result) => {
      invalidate();
      toast.notify(`${result.deleted} oggetti eliminati definitivamente`);
      setConfirmEmpty(false);
    },
    onError: (error) => toast.fail(error),
  });

  const items = trash.data?.items ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <h1>Cestino</h1>
          <p className="muted">
            Gli oggetti eliminati restano qui finché non li svuoti. I documenti allegati non vengono toccati.
          </p>
        </div>
        {items.length > 0 ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmEmpty(true)}>
            <Icon name="trash" size={15} /> Svuota il cestino
          </button>
        ) : null}
      </header>

      {trash.error ? <ErrorBox error={trash.error} onRetry={() => void trash.refetch()} /> : null}

      <section className="panel">
        {trash.isLoading ? (
          <Skeleton rows={3} height={44} />
        ) : items.length === 0 ? (
          <EmptyState icon="check" title="Cestino vuoto" description="Nessun oggetto in attesa di essere eliminato." />
        ) : (
          <div>
            {items.map((item) => (
              <div key={item.id} className="row" style={{ padding: '10px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                <span className="col grow" style={{ gap: 0, minWidth: 0 }}>
                  <span className="truncate" style={{ fontWeight: 550 }}>
                    {item.name}
                  </span>
                  <span className="xs muted">
                    eliminato {relativeTime(item.deleted_at)}
                    {item.attachment_count > 0 ? ` · ${item.attachment_count} documenti allegati` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => restore.mutate(item.id)}>
                  <Icon name="refresh" size={14} /> Ripristina
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => purge.mutate(item.id)}>
                  Elimina
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmEmpty ? (
        <ConfirmDialog
          title="Svuotare il cestino?"
          message={`${plural(items.length, 'oggetto verrà eliminato', 'oggetti verranno eliminati')} definitivamente. L’operazione non è reversibile: i dati non saranno più recuperabili se non da un backup.`}
          confirmLabel="Elimina definitivamente"
          destructive
          onConfirm={() => emptyAll.mutateAsync()}
          onClose={() => setConfirmEmpty(false)}
        />
      ) : null}
    </div>
  );
}
