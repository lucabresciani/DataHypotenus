/**
 * Pannello degli allegati: foto e documenti di un oggetto (o di una posizione).
 * Caricamento per trascinamento o selezione file; i documenti si aprono in una
 * nuova scheda perche' il browser gestisce gia' bene PDF e immagini.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import { ATTACHMENT_KIND_LABELS, type Attachment } from '@/lib/types.ts';
import { date, fileSize, plural } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon.tsx';
import { toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';

export function Attachments({ entityType, entityId }: { entityType: 'item' | 'location'; entityId: number }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const queryKey = ['attachments', entityType, entityId];
  const attachments = useQuery({
    queryKey,
    queryFn: () =>
      entityType === 'item'
        ? api.itemAttachments(entityId)
        : api.locationContents(entityId).then((result) => ({ attachments: result.attachments })),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['item', entityId] });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadAttachments(entityType, entityId, files),
    onSuccess: (result) => {
      invalidate();
      toast.success(plural(result.attachments.length, 'file caricato', 'file caricati'));
    },
    onError: (error) => toast.fail(error, 'Caricamento non riuscito'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteAttachment(id),
    onSuccess: (result) => {
      invalidate();
      toast.info(result.blob_kept ? 'Allegato rimosso da qui. Il file resta: è usato altrove.' : 'Allegato rimosso');
    },
    onError: (error) => toast.fail(error),
  });

  const setPrimary = useMutation({
    mutationFn: (id: number) => api.updateAttachment(id, { is_primary: true }),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const list = attachments.data?.attachments ?? [];
  const photos = list.filter((attachment) => attachment.kind === 'photo');
  const documents = list.filter((attachment) => attachment.kind !== 'photo');

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    upload.mutate([...files]);
  };

  const documentRow = (attachment: Attachment) => (
    <div key={attachment.id} className="flex items-center gap-3 py-2">
      <Icon name="file" size={17} className="text-faint" />
      <a
        href={api.attachmentUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 flex-col outline-none hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="truncate font-medium">{attachment.title || attachment.original_filename}</span>
        <span className="text-xs text-muted-foreground">
          {ATTACHMENT_KIND_LABELS[attachment.kind]} · {fileSize(attachment.byte_size)} · {date(attachment.created_at)}
        </span>
      </a>
      <Button variant="ghost" size="icon-sm" asChild aria-label={`Scarica ${attachment.original_filename}`}>
        <a href={api.attachmentUrl(attachment.id, true)} download>
          <Icon name="download" size={15} />
        </a>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:text-destructive"
        onClick={() => remove.mutate(attachment.id)}
        aria-label={`Rimuovi ${attachment.original_filename}`}
      >
        <Icon name="trash" size={15} />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-7 text-center',
          'transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
          dragging
            ? 'border-primary bg-primary-soft text-primary-ink'
            : 'border-border-strong text-muted-foreground hover:border-primary hover:bg-primary-soft/50 hover:text-primary-ink',
        )}
      >
        <Icon name="upload" size={20} />
        <p className="text-base">
          {upload.isPending ? 'Caricamento in corso…' : 'Trascina qui foto, ricevute, fatture o manuali'}
        </p>
        <p className="text-xs text-faint">oppure premi per scegliere i file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {photos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">Foto</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
            {photos.map((photo) => (
              <figure key={photo.id} className="group/photo relative m-0">
                <a href={api.attachmentUrl(photo.id)} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={api.attachmentUrl(photo.id)}
                    alt={photo.title ?? photo.original_filename}
                    loading="lazy"
                    className="aspect-square w-full cursor-zoom-in rounded-md border border-border object-cover"
                  />
                </a>
                <div className="absolute top-1 right-1 flex gap-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/photo:opacity-100">
                  {photo.is_primary ? (
                    <span
                      className="grid size-6 place-items-center rounded bg-primary text-primary-foreground"
                      title="Foto principale"
                    >
                      <Icon name="star" size={12} filled />
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="size-6"
                      onClick={() => setPrimary.mutate(photo.id)}
                      aria-label="Usa come foto principale"
                    >
                      <Icon name="star" size={12} />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    className="size-6 hover:text-destructive"
                    onClick={() => remove.mutate(photo.id)}
                    aria-label="Rimuovi la foto"
                  >
                    <Icon name="close" size={12} />
                  </Button>
                </div>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">Documenti</span>
          <div className="divide-y divide-border">{documents.map(documentRow)}</div>
        </div>
      ) : null}

      {list.length === 0 && !upload.isPending ? (
        <p className="text-sm text-muted-foreground">
          Nessun documento allegato. Le ricevute e i manuali servono soprattutto il giorno in cui qualcosa si rompe.
        </p>
      ) : null}
    </div>
  );
}
