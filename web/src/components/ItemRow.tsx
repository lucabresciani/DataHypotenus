/**
 * Riga di un oggetto nelle liste.
 *
 * Contiene le azioni rapide dell'uso quotidiano (variare la quantita',
 * modificare, duplicare, cestinare) senza aprire la scheda. Su puntatore fine
 * restano nascoste finche' non serve il mouse; su touch sono sempre visibili,
 * perche' li' l'hover non esiste.
 */
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api.ts';
import type { Item } from '@/lib/types.ts';
import { money, quantity as formatQuantity } from '@/lib/format.ts';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon.tsx';
import { AlertBadge, StatusBadge, Thumb, toast } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type ItemRowProps = {
  item: Item;
  selected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  onEdit?: (item: Item) => void;
  showSelection?: boolean;
};

export function ItemRow({ item, selected = false, onSelect, onEdit, showSelection = true }: ItemRowProps) {
  const queryClient = useQueryClient();

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
      toast.info(`«${item.name}» spostato nel cestino`, {
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
      <AlertBadge tone="warn" icon="shield">
        Garanzia in scadenza
      </AlertBadge>
    ) : item.below_min ? (
      <AlertBadge tone="warn">Scorta bassa</AlertBadge>
    ) : null;

  return (
    <div
      className={cn(
        'group/row grid items-center gap-x-3 gap-y-1 px-1 py-2 transition-colors duration-150',
        'grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_2.25rem_minmax(0,2.2fr)_minmax(0,1.3fr)_auto_auto]',
        'lg:grid-cols-[auto_2.25rem_minmax(0,2.2fr)_minmax(0,1.3fr)_8.5rem_6.5rem_5.5rem_auto]',
        selected ? 'bg-primary-soft/60' : 'hover:bg-secondary/70',
      )}
    >
      {showSelection ? (
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelect?.(item.id, checked === true)}
          aria-label={`Seleziona ${item.name}`}
        />
      ) : (
        <span />
      )}

      <Link to={`/oggetti/${item.id}`} tabIndex={-1} aria-hidden className="hidden md:block">
        <Thumb photoId={item.primary_photo_id} size={36} />
      </Link>

      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <Link
            to={`/oggetti/${item.id}`}
            className="truncate font-medium outline-none hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {item.name}
          </Link>
          {item.is_favorite ? <Icon name="star" size={13} filled className="text-warn" title="Preferito" /> : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[item.brand, item.model].filter(Boolean).join(' ') || item.category?.path || 'Senza categoria'}
        </span>
      </div>

      <div className="hidden min-w-0 flex-col gap-1 md:flex">
        {item.location ? (
          <Link
            to={`/posizioni/${item.location.id}`}
            title={item.location.path}
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground outline-none hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Icon name="pin" size={12} />
            <span className="truncate">{item.location.name}</span>
          </Link>
        ) : (
          <span className="text-xs text-faint">Nessuna posizione</span>
        )}
        {alert}
      </div>

      <div className="hidden lg:block">
        <StatusBadge label={item.status.label} color={item.status.color} />
      </div>

      {/* Quantita': tre bersagli da 28px, non due frecce da cinque. */}
      <div className="hidden items-center rounded-md border border-border md:flex">
        <button
          type="button"
          onClick={() => adjust.mutate({ delta: -1 })}
          disabled={item.quantity <= 0 || adjust.isPending}
          aria-label={`Diminuisci la quantità di ${item.name}`}
          className="grid size-7 place-items-center rounded-l-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Icon name="minus" size={13} />
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'min-w-8 px-1 text-center font-mono text-sm tabular-nums',
                item.below_min && 'font-semibold text-warn',
              )}
            >
              {formatQuantity(item.quantity)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{formatQuantity(item.quantity, item.unit)}</TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={() => adjust.mutate({ delta: 1 })}
          disabled={adjust.isPending}
          aria-label={`Aumenta la quantità di ${item.name}`}
          className="grid size-7 place-items-center rounded-r-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-35"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="hidden text-right text-sm text-muted-foreground tabular-nums lg:block">
        {money(item.total_value, item.currency)}
      </div>

      <div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100">
        {onEdit ? (
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} aria-label={`Modifica ${item.name}`}>
            <Icon name="edit" size={15} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => duplicate.mutate()}
          disabled={duplicate.isPending}
          aria-label={`Duplica ${item.name}`}
        >
          <Icon name="copy" size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label={`Sposta ${item.name} nel cestino`}
          className="hover:text-destructive"
        >
          <Icon name="trash" size={15} />
        </Button>
      </div>
    </div>
  );
}
