/**
 * Riga di un oggetto nelle liste.
 * Contiene le azioni rapide richieste dall'uso quotidiano: variare la
 * quantita', modificare, duplicare, spostare nel cestino, senza aprire la
 * scheda.
 */
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import type { Item } from '../lib/types.ts';
import { money, quantity as formatQuantity } from '../lib/format.ts';
import { Icon } from './Icon.tsx';
import { AlertBadge, StatusBadge, useToast } from './ui.tsx';

export type ItemRowProps = {
  item: Item;
  selected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  onEdit?: (item: Item) => void;
  showSelection?: boolean;
};

export function ItemRow({ item, selected = false, onSelect, onEdit, showSelection = true }: ItemRowProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const adjust = useMutation({
    mutationFn: ({ delta }: { delta: number }) => api.adjustQuantity(item.id, delta),
    onSuccess: invalidate,
    onError: (error) => toast.fail(error, 'Quantità non aggiornata'),
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicateItem(item.id),
    onSuccess: (copy) => {
      invalidate();
      toast.success(`Creata una copia: ${copy.name}`);
    },
    onError: (error) => toast.fail(error),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteItem(item.id),
    onSuccess: () => {
      invalidate();
      toast.notify(`"${item.name}" spostato nel cestino`, {
        label: 'Annulla',
        run: () => {
          void api.restoreItem(item.id).then(invalidate);
        },
      });
    },
    onError: (error) => toast.fail(error),
  });

  const alert =
    item.expiration_status === 'expired' ? (
      <AlertBadge tone="danger">Scaduto</AlertBadge>
    ) : item.expiration_status === 'expiring' ? (
      <AlertBadge tone="warn">In scadenza</AlertBadge>
    ) : item.warranty.status === 'expiring' ? (
      <AlertBadge tone="warn">Garanzia in scadenza</AlertBadge>
    ) : item.below_min ? (
      <AlertBadge tone="warn">Scorta bassa</AlertBadge>
    ) : null;

  return (
    <div className={`item-row${selected ? ' selected' : ''}`}>
      {showSelection ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect?.(item.id, e.target.checked)}
          aria-label={`Seleziona ${item.name}`}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
        />
      ) : (
        <span />
      )}

      <Link to={`/oggetti/${item.id}`} className="item-thumb hide-sm" aria-hidden={item.primary_photo_id === null}>
        {item.primary_photo_id ? (
          <img src={api.attachmentUrl(item.primary_photo_id)} alt="" loading="lazy" width={40} height={40} />
        ) : (
          <Icon name="box" size={16} />
        )}
      </Link>

      <div className="col" style={{ gap: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <Link to={`/oggetti/${item.id}`} className="item-name truncate">
            {item.name}
          </Link>
          {item.is_favorite ? <Icon name="star" size={13} filled className="faint" /> : null}
        </div>
        <span className="item-meta truncate">
          {[item.brand, item.model].filter(Boolean).join(' ') || item.category?.path || 'Senza categoria'}
        </span>
      </div>

      <div className="col hide-sm" style={{ gap: 1, minWidth: 0 }}>
        {item.location ? (
          <Link to={`/posizioni/${item.location.id}`} className="item-meta truncate" title={item.location.path}>
            <Icon name="pin" size={12} /> {item.location.name}
          </Link>
        ) : (
          <span className="item-meta faint">Nessuna posizione</span>
        )}
        {alert}
      </div>

      <div className="hide-md row" style={{ gap: 6, minWidth: 0 }}>
        <StatusBadge label={item.status.label} color={item.status.color} />
      </div>

      <div className="hide-sm">
        <div className="qty-control">
          <button
            type="button"
            onClick={() => adjust.mutate({ delta: -1 })}
            disabled={item.quantity <= 0 || adjust.isPending}
            aria-label="Diminuisci quantità"
          >
            <Icon name="minus" size={13} />
          </button>
          <span className={`qty-value${item.below_min ? ' below' : ''}`} title={`${formatQuantity(item.quantity, item.unit)}`}>
            {formatQuantity(item.quantity)}
          </span>
          <button type="button" onClick={() => adjust.mutate({ delta: 1 })} disabled={adjust.isPending} aria-label="Aumenta quantità">
            <Icon name="plus" size={13} />
          </button>
        </div>
      </div>

      <div className="hide-md num small muted" style={{ textAlign: 'right' }}>
        {money(item.total_value, item.currency)}
      </div>

      <div className="row-actions">
        {onEdit ? (
          <button type="button" className="btn btn-icon btn-ghost" onClick={() => onEdit(item)} aria-label={`Modifica ${item.name}`}>
            <Icon name="edit" size={15} />
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={() => duplicate.mutate()}
          aria-label={`Duplica ${item.name}`}
          disabled={duplicate.isPending}
        >
          <Icon name="copy" size={15} />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={() => remove.mutate()}
          aria-label={`Sposta ${item.name} nel cestino`}
          disabled={remove.isPending}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  );
}
