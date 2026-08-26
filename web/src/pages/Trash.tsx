/**
 * Cestino: la rete di sicurezza del soft delete. Da qui si ripristina o si
 * elimina davvero, e solo qui la cancellazione e' definitiva.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { plural, relativeTime } from '@/lib/format.ts';
import { Icon } from '@/components/Icon.tsx';
import { ConfirmDialog, EmptyState, ErrorState, LoadingRows, Page, PageHeader, toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';

export function TrashPage() {
  const queryClient = useQueryClient();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [purging, setPurging] = useState<{ id: number; name: string } | null>(null);

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
      toast.success(`«${item.name}» ripristinato`);
    },
    onError: (error) => toast.fail(error),
  });

  const purge = useMutation({
    mutationFn: (id: number) => api.deleteItem(id, true),
    onSuccess: () => {
      invalidate();
      setPurging(null);
      toast.info('Oggetto eliminato definitivamente');
    },
    onError: (error) => toast.fail(error),
  });

  const emptyAll = useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: (result) => {
      invalidate();
      toast.info(`${plural(result.deleted, 'oggetto eliminato', 'oggetti eliminati')} definitivamente`);
      setConfirmEmpty(false);
    },
    onError: (error) => toast.fail(error),
  });

  const items = trash.data?.items ?? [];

  return (
    <Page>
      <PageHeader
        title="Cestino"
        description="Gli oggetti eliminati restano qui finché non li svuoti. I documenti allegati non vengono toccati."
        actions={
          items.length > 0 ? (
            <Button variant="destructive" onClick={() => setConfirmEmpty(true)}>
              <Icon name="trash" size={15} /> Svuota il cestino
            </Button>
          ) : null
        }
      />

      {trash.error ? <ErrorState error={trash.error} onRetry={() => void trash.refetch()} /> : null}

      <section className="border-t border-border">
        {trash.isLoading ? (
          <LoadingRows rows={3} height={48} className="pt-3" />
        ) : items.length === 0 ? (
          <EmptyState icon="check" title="Cestino vuoto" description="Nessun oggetto in attesa di essere eliminato." />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-1 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    eliminato {relativeTime(item.deleted_at)}
                    {item.attachment_count > 0
                      ? ` · ${plural(item.attachment_count, 'documento allegato', 'documenti allegati')}`
                      : ''}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => restore.mutate(item.id)} disabled={restore.isPending}>
                  <Icon name="refresh" size={14} /> Ripristina
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setPurging({ id: item.id, name: item.name })}>
                  Elimina
                </Button>
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

      {/* Prima non c'era conferma: un clic sbagliato qui non si annulla. */}
      {purging ? (
        <ConfirmDialog
          title={`Eliminare «${purging.name}» per sempre?`}
          message="Questo oggetto non finisce da nessuna parte: sparisce dal database. Si recupera solo da un backup."
          confirmLabel="Elimina per sempre"
          destructive
          onConfirm={() => purge.mutateAsync(purging.id)}
          onClose={() => setPurging(null)}
        />
      ) : null}
    </Page>
  );
}
