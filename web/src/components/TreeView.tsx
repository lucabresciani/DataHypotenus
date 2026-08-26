/**
 * Albero riutilizzabile per categorie e posizioni: due strutture diverse ma con
 * lo stesso comportamento (espandi, seleziona, agisci sul nodo).
 */
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type TreeNodeLike = {
  id: number;
  name: string;
  item_count: number;
  total_item_count: number;
  children: TreeNodeLike[];
};

export type TreeViewProps<T extends TreeNodeLike> = {
  nodes: T[];
  selectedId?: number | null;
  onSelect?: (node: T) => void;
  renderIcon?: (node: T) => ReactNode;
  renderActions?: (node: T) => ReactNode;
  renderMeta?: (node: T) => ReactNode;
  /** Livelli aperti al primo caricamento: 1 = solo le radici espanse. */
  initialDepth?: number;
  depth?: number;
};

export function TreeView<T extends TreeNodeLike>({
  nodes,
  selectedId,
  onSelect,
  renderIcon,
  renderActions,
  renderMeta,
  initialDepth = 1,
  depth = 0,
}: TreeViewProps<T>) {
  return (
    <div role={depth === 0 ? 'tree' : 'group'} className="flex flex-col">
      {nodes.map((node) => (
        <TreeBranch
          key={node.id}
          node={node}
          depth={depth}
          selectedId={selectedId}
          onSelect={onSelect}
          renderIcon={renderIcon}
          renderActions={renderActions}
          renderMeta={renderMeta}
          initialDepth={initialDepth}
        />
      ))}
    </div>
  );
}

function TreeBranch<T extends TreeNodeLike>({
  node,
  depth,
  selectedId,
  onSelect,
  renderIcon,
  renderActions,
  renderMeta,
  initialDepth,
}: { node: T; depth: number } & Omit<TreeViewProps<T>, 'nodes' | 'depth'>) {
  const [open, setOpen] = useState(depth < (initialDepth ?? 1));
  const hasChildren = node.children.length > 0;
  const selected = selectedId === node.id;
  const hasBranchCount = node.total_item_count > node.item_count;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selected}>
      <div
        className={cn(
          'group/node flex items-center gap-1.5 rounded-md py-1 pr-1 transition-colors duration-150',
          selected ? 'bg-primary-soft' : 'hover:bg-secondary',
        )}
        style={{ paddingLeft: depth * 18 + 2 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            aria-label={open ? `Chiudi ${node.name}` : `Espandi ${node.name}`}
            className="grid size-5 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-surface-sunken hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Icon name="chevron" size={13} className={cn('transition-transform duration-200', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        {renderIcon ? renderIcon(node) : null}

        <button
          type="button"
          onClick={() => onSelect?.(node)}
          className="min-w-0 flex-1 truncate rounded px-0.5 py-0.5 text-left text-base outline-none hover:text-primary-ink focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {node.name}
        </button>

        {renderMeta ? renderMeta(node) : null}

        {node.total_item_count > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 px-1 font-mono text-xs text-faint tabular-nums">
                {hasBranchCount ? `${node.item_count}/${node.total_item_count}` : node.item_count}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasBranchCount
                ? `${node.item_count} qui, ${node.total_item_count} in tutto il ramo`
                : `${node.item_count} qui`}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {renderActions ? (
          <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/node:opacity-100 [@media(hover:hover)]:group-focus-within/node:opacity-100">
            {renderActions(node)}
          </span>
        ) : null}
      </div>

      {open && hasChildren ? (
        <TreeView
          nodes={node.children as T[]}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          renderIcon={renderIcon}
          renderActions={renderActions}
          renderMeta={renderMeta}
          initialDepth={initialDepth}
        />
      ) : null}
    </div>
  );
}
