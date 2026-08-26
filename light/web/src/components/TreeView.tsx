/**
 * Albero riutilizzabile per categorie e posizioni: due strutture diverse ma con
 * lo stesso comportamento (espandi, seleziona, agisci sul nodo).
 */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

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
    <div className="tree" role={depth === 0 ? 'tree' : 'group'}>
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

  return (
    <div role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={selectedId === node.id}>
      <div
        className={`tree-node${selectedId === node.id ? ' selected' : ''}`}
        style={{ paddingLeft: depth * 18 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            aria-label={open ? `Chiudi ${node.name}` : `Espandi ${node.name}`}
          >
            <Icon name="chevron" size={13} className="chevron" />
          </button>
        ) : (
          <span className="tree-toggle" aria-hidden />
        )}

        {renderIcon ? renderIcon(node) : null}

        <button type="button" className="tree-label" onClick={() => onSelect?.(node)}>
          {node.name}
        </button>

        {renderMeta ? renderMeta(node) : null}

        <span className="tree-count" title={`${node.item_count} qui, ${node.total_item_count} in tutto il ramo`}>
          {node.total_item_count > node.item_count ? `${node.item_count} / ${node.total_item_count}` : node.item_count || ''}
        </span>

        {renderActions ? <span className="tree-actions">{renderActions(node)}</span> : null}
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
