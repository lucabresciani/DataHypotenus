/**
 * Unico punto di contatto con il backend.
 *
 * Nessun componente chiama `fetch` direttamente: gli errori vengono tradotti
 * una volta sola in `ApiError`, cosi' l'interfaccia puo' mostrare sempre un
 * messaggio comprensibile invece di una pagina bianca.
 */
import type {
  Attachment,
  BackupInfo,
  Category,
  CategoryNode,
  Dashboard,
  Health,
  ImportReport,
  Item,
  ItemEvent,
  ItemFilters,
  ItemList,
  Location,
  LocationNode,
  SearchResults,
  ShoppingItem,
  Stats,
  Status,
  StorageCheck,
  Tag,
  Vendor,
} from './types.ts';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Messaggi di validazione campo per campo, quando il server li fornisce. */
  get fieldErrors(): Array<{ field: string; message: string }> {
    return Array.isArray(this.details) ? (this.details as Array<{ field: string; message: string }>) : [];
  }
}

function toQuery(params: Record<string, unknown> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else if (typeof value === 'boolean') {
      search.set(key, value ? '1' : '0');
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network', 'Impossibile contattare il server. Controlla che datahypotenus sia in esecuzione.');
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = (payload as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'error',
      error?.message ?? `Errore ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

const get = <T>(path: string, params?: Record<string, unknown>): Promise<T> => request<T>(`${path}${toQuery(params)}`);
const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown): Promise<T> => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
  request<T>(`${path}${toQuery(params)}`, { method: 'DELETE' });

export type ItemPayload = Partial<{
  name: string;
  description: string | null;
  category_id: number | null;
  location_id: number | null;
  status_id: number | null;
  vendor_id: number | null;
  vendor_name: string | null;
  quantity: number;
  unit: string;
  is_consumable: boolean;
  min_quantity: number | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  sku: string | null;
  barcode: string | null;
  purchase_price: number | null;
  current_value: number | null;
  currency: string;
  purchase_date: string | null;
  product_url: string | null;
  warranty_months: number | null;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_notes: string | null;
  expiration_date: string | null;
  expected_lifespan_months: number | null;
  notes: string | null;
  specs: Record<string, string> | null;
  is_favorite: boolean;
  tags: string[];
}>;

export type BulkPayload =
  | { action: 'move'; location_id: number | null }
  | { action: 'categorize'; category_id: number | null }
  | { action: 'status'; status_id: number }
  | { action: 'add_tags'; tags?: string[]; tag_ids?: number[] }
  | { action: 'favorite'; value: boolean }
  | { action: 'delete' }
  | { action: 'restore' };

export const api = {
  health: () => get<Health>('/health'),

  // --- Oggetti ---------------------------------------------------------------
  items: (filters: ItemFilters = {}) => get<ItemList>('/items', filters as Record<string, unknown>),
  item: (id: number) => get<Item>(`/items/${id}`),
  itemByUid: (uid: string) => get<Item>(`/items/uid/${uid}`),
  createItem: (payload: ItemPayload) => post<Item>('/items', payload),
  updateItem: (id: number, payload: ItemPayload) => patch<Item>(`/items/${id}`, payload),
  deleteItem: (id: number, purge = false) => del<{ id: number }>(`/items/${id}`, { purge }),
  restoreItem: (id: number) => post<Item>(`/items/${id}/restore`),
  duplicateItem: (id: number) => post<Item>(`/items/${id}/duplicate`),
  adjustQuantity: (id: number, delta: number) => post<Item>(`/items/${id}/quantity`, { delta }),
  setQuantity: (id: number, value: number) => post<Item>(`/items/${id}/quantity`, { value }),
  itemHistory: (id: number) => get<{ events: ItemEvent[] }>(`/items/${id}/history`),
  itemAttachments: (id: number) => get<{ attachments: Attachment[] }>(`/items/${id}/attachments`),
  bulk: (ids: number[], action: BulkPayload) => post<{ affected: number }>('/items/bulk', { ids, action }),
  emptyTrash: () => post<{ deleted: number }>('/items/trash/empty'),
  restock: (id: number) => post<ShoppingItem>(`/items/${id}/restock`),

  // --- Categorie -------------------------------------------------------------
  categories: () => get<{ categories: Category[] }>('/categories'),
  categoryTree: () => get<{ tree: CategoryNode[] }>('/categories/tree'),
  createCategory: (payload: { name: string; parent_id?: number | null; icon?: string | null }) =>
    post<Category>('/categories', payload),
  updateCategory: (id: number, payload: { name?: string; parent_id?: number | null }) =>
    patch<Category>(`/categories/${id}`, payload),
  deleteCategory: (id: number, cascade = false) =>
    del<{ deleted: number; movedChildren: number; detachedItems: number }>(`/categories/${id}`, { cascade }),

  // --- Posizioni -------------------------------------------------------------
  locations: () => get<{ locations: Location[] }>('/locations'),
  locationTree: () => get<{ tree: LocationNode[] }>('/locations/tree'),
  location: (id: number) => get<Location>(`/locations/${id}`),
  locationContents: (id: number) =>
    get<{
      location: Location;
      breadcrumb: Array<{ id: number; name: string }>;
      children: Location[];
      items: Item[];
      items_total: number;
      value: number;
      attachments: Attachment[];
    }>(`/locations/${id}/contents`),
  createLocation: (payload: { name: string; parent_id?: number | null; kind?: string; code?: string | null; notes?: string | null }) =>
    post<Location>('/locations', payload),
  updateLocation: (id: number, payload: { name?: string; parent_id?: number | null; kind?: string; code?: string | null; notes?: string | null }) =>
    patch<Location>(`/locations/${id}`, payload),
  deleteLocation: (id: number, cascade = false) =>
    del<{ deleted: number; movedChildren: number; detachedItems: number }>(`/locations/${id}`, { cascade }),

  // --- Tag, stati, negozi ----------------------------------------------------
  tags: () => get<{ tags: Tag[] }>('/tags'),
  createTag: (name: string) => post<Tag>('/tags', { name }),
  updateTag: (id: number, payload: { name?: string; color?: string | null }) => patch<Tag>(`/tags/${id}`, payload),
  deleteTag: (id: number) => del<{ deleted: number }>(`/tags/${id}`),

  statuses: () => get<{ statuses: Status[] }>('/statuses'),
  createStatus: (payload: { label: string; color?: string | null; counts_as_owned?: boolean; is_wishlist?: boolean }) =>
    post<Status>('/statuses', payload),
  updateStatus: (id: number, payload: Partial<{ label: string; color: string | null; counts_as_owned: boolean; is_wishlist: boolean; is_default: boolean }>) =>
    patch<Status>(`/statuses/${id}`, payload),
  deleteStatus: (id: number, reassignTo?: number) =>
    del<{ deleted: number; moved: number }>(`/statuses/${id}`, { reassign_to: reassignTo }),

  vendors: () => get<{ vendors: Vendor[] }>('/vendors'),
  createVendor: (payload: { name: string; website?: string | null }) => post<Vendor>('/vendors', payload),
  deleteVendor: (id: number) => del<{ deleted: number }>(`/vendors/${id}`),

  // --- Allegati --------------------------------------------------------------
  uploadAttachments: async (
    entityType: 'item' | 'location',
    entityId: number,
    files: File[],
    kind?: string,
  ): Promise<{ attachments: Attachment[] }> => {
    const form = new FormData();
    for (const file of files) form.append('file', file);
    return request(`/attachments${toQuery({ entity_type: entityType, entity_id: entityId, kind })}`, {
      method: 'POST',
      body: form,
    });
  },
  updateAttachment: (id: number, payload: { title?: string | null; kind?: string; is_primary?: boolean }) =>
    patch<Attachment>(`/attachments/${id}`, payload),
  deleteAttachment: (id: number) => del<{ deleted: number; blob_kept: boolean }>(`/attachments/${id}`),
  attachmentUrl: (id: number, download = false) => `${BASE}/attachments/${id}/file${download ? '?download=1' : ''}`,

  storageCheck: (deep = false) => get<StorageCheck>('/storage/check', { deep }),
  collectGarbage: (dryRun = false) =>
    post<{ removed_files: number; freed_bytes: number }>('/storage/gc', { dry_run: dryRun }),

  // --- Acquisti --------------------------------------------------------------
  shopping: (filters: { status?: string; priority?: string; q?: string } = {}) =>
    get<{ items: ShoppingItem[]; estimated_total: number }>('/shopping', filters),
  createShopping: (payload: Record<string, unknown>) => post<ShoppingItem>('/shopping', payload),
  updateShopping: (id: number, payload: Record<string, unknown>) => patch<ShoppingItem>(`/shopping/${id}`, payload),
  deleteShopping: (id: number) => del<{ deleted: number }>(`/shopping/${id}`),
  convertShopping: (id: number, payload: Record<string, unknown> = {}) =>
    post<{ shopping: ShoppingItem; item: Item }>(`/shopping/${id}/convert`, payload),

  // --- Sintesi ---------------------------------------------------------------
  dashboard: () => get<Dashboard>('/dashboard'),
  stats: (months = 12) => get<Stats>('/stats', { months }),
  search: (q: string) => get<SearchResults>('/search', { q }),

  // --- Impostazioni e manutenzione ------------------------------------------
  settings: () => get<{ settings: Record<string, string> }>('/settings'),
  saveSettings: (settings: Record<string, string>) => put<{ settings: Record<string, string> }>('/settings', settings),

  backups: () => get<{ backups: BackupInfo[] }>('/backups'),
  createBackup: (label?: string) => post<BackupInfo>('/backups', { label }),
  verifyBackup: (name: string) => post<{ ok: boolean; database_ok: boolean; attachments_bad: string[]; attachments_missing: string[] }>(`/backups/${name}/verify`),
  restoreBackup: (name: string) => post<{ safety_backup: string | null; attachments_restored: number }>(`/backups/${name}/restore`),
  deleteBackup: (name: string) => del<{ deleted: string }>(`/backups/${name}`),

  exportJsonUrl: `${BASE}/export/json`,
  exportCsvUrl: `${BASE}/export/csv`,
  importCsv: (csv: string, mode: 'merge' | 'create_only' = 'merge') =>
    request<ImportReport>(`/import/csv${toQuery({ mode })}`, { method: 'POST', body: JSON.stringify({ csv }) }),
  importJson: (bundle: unknown, mode: 'merge' | 'create_only' = 'merge') =>
    request<ImportReport>(`/import/json${toQuery({ mode })}`, { method: 'POST', body: JSON.stringify(bundle) }),
  seed: (force = false) => post<{ applied: boolean; categories: number; locations: number; reason?: string }>('/seed', { force }),
};
