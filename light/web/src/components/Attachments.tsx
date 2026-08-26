/**
 * Pannello degli allegati: foto e documenti di un oggetto (o di una posizione).
 * Caricamento per trascinamento o selezione file; i documenti si aprono in una
 * nuova scheda perche' il browser gestisce gia' bene PDF e immagini.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { ATTACHMENT_KIND_LABELS, type Attachment } from '../lib/types.ts';
import { date, fileSize, plural } from '../lib/format.ts';
import { Icon } from './Icon.tsx';
import { useToast } from './ui.tsx';

export function Attachments({ entityType, entityId }: { entityType: 'item' | 'location'; entityId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const queryKey = ['attachments', entityType, entityId];
  const attachments = useQuery({
    queryKey,
    queryFn: () => (entityType === 'item' ? api.itemAttachments(entityId) : api.locationContents(entityId).then((r) => ({ attachments: r.attachments }))),
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
      toast.notify(
        result.blob_kept
          ? 'Allegato rimosso da questo oggetto (il file resta, è usato altrove)'
          : 'Allegato rimosso',
      );
    },
    onError: (error) => toast.fail(error),
  });

  const setPrimary = useMutation({
    mutationFn: (id: number) => api.updateAttachment(id, { is_primary: true }),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error),
  });

  const list = attachments.data?.attachments ?? [];
  const photos = list.filter((a) => a.kind === 'photo');
  const documents = list.filter((a) => a.kind !== 'photo');

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    upload.mutate([...files]);
  };

  const documentRow = (attachment: Attachment) => (
    <div key={attachment.id} className="file-row">
      <Icon name="file" size={17} className="faint" />
      <a href={api.attachmentUrl(attachment.id)} target="_blank" rel="noreferrer" className="grow col" style={{ gap: 0, minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>
          {attachment.title || attachment.original_filename}
        </span>
        <span className="xs muted">
          {ATTACHMENT_KIND_LABELS[attachment.kind]} · {fileSize(attachment.byte_size)} · {date(attachment.created_at)}
        </span>
      </a>
      <a
        href={api.attachmentUrl(attachment.id, true)}
        className="btn btn-icon btn-ghost"
        aria-label={`Scarica ${attachment.original_filename}`}
        download
      >
        <Icon name="download" size={15} />
      </a>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        onClick={() => remove.mutate(attachment.id)}
        aria-label={`Rimuovi ${attachment.original_filename}`}
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  );

  return (
    <div className="col" style={{ gap: 'var(--space-4)' }}>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <Icon name="upload" size={20} />
        <p className="small" style={{ marginTop: 6 }}>
          {upload.isPending ? 'Caricamento in corso...' : 'Trascina qui foto, ricevute, fatture o manuali'}
        </p>
        <p className="xs faint">oppure fai clic per scegliere i file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {photos.length > 0 ? (
        <div className="col">
          <span className="label">Foto</span>
          <div className="gallery">
            {photos.map((photo) => (
              <figure key={photo.id} style={{ margin: 0, position: 'relative' }}>
                <a href={api.attachmentUrl(photo.id)} target="_blank" rel="noreferrer">
                  <img src={api.attachmentUrl(photo.id)} alt={photo.title ?? photo.original_filename} loading="lazy" />
                </a>
                <div className="row" style={{ position: 'absolute', top: 4, right: 4, gap: 2 }}>
                  {photo.is_primary ? (
                    <span className="badge accent" title="Foto principale">
                      <Icon name="star" size={11} filled />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-icon btn-sm"
                      onClick={() => setPrimary.mutate(photo.id)}
                      aria-label="Usa come foto principale"
                      title="Usa come foto principale"
                    >
                      <Icon name="star" size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon btn-sm"
                    onClick={() => remove.mutate(photo.id)}
                    aria-label="Rimuovi foto"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <div className="col">
          <span className="label">Documenti</span>
          <div>{documents.map(documentRow)}</div>
        </div>
      ) : null}

      {list.length === 0 && !upload.isPending ? (
        <p className="small muted">
          Nessun documento allegato. Le ricevute e i manuali servono soprattutto il giorno in cui qualcosa si rompe.
        </p>
      ) : null}
    </div>
  );
}
