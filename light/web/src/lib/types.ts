/**
 * Tipi delle risposte API.
 *
 * Sono scritti a mano e rispecchiano `server/src/modules/*.types.ts`. Client e
 * server restano due workspace indipendenti: un pacchetto condiviso avrebbe
 * complicato build e deploy piu' di quanto risolva, su un progetto dove le due
 * parti evolvono insieme e i tipi sono pochi.
 */

export type TagRef = { id: number; name: string; color: string | null };

export type WarrantyStatus = 'none' | 'active' | 'expiring' | 'expired';
export type ExpirationStatus = 'none' | 'ok' | 'expiring' | 'expired';

export type Item = {
  id: number;
  uid: string;
  name: string;
  description: string | null;
  category: { id: number; name: string; path: string } | null;
  location: {
    id: number;
    name: string;
    path: string;
    kind: string;
    room_id: number | null;
    room_name: string | null;
  } | null;
  status: { id: number; key: string; label: string; color: string | null; counts_as_owned: boolean; is_wishlist: boolean };
  vendor: { id: number; name: string } | null;
  quantity: number;
  unit: string;
  is_consumable: boolean;
  min_quantity: number | null;
  initial_quantity: number | null;
  below_min: boolean;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  sku: string | null;
  barcode: string | null;
  purchase_price: number | null;
  current_value: number | null;
  currency: string;
  total_value: number | null;
  purchase_date: string | null;
  product_url: string | null;
  warranty: {
    months: number | null;
    start: string | null;
    end: string | null;
    notes: string | null;
    status: WarrantyStatus;
    days_left: number | null;
  };
  expiration_date: string | null;
  expiration_status: ExpirationStatus;
  expiration_days_left: number | null;
  expected_lifespan_months: number | null;
  notes: string | null;
  specs: Record<string, string>;
  is_favorite: boolean;
  tags: TagRef[];
  attachment_count: number;
  photo_count: number;
  document_count: number;
  primary_photo_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ItemList = { items: Item[]; total: number; limit: number; offset: number; total_value: number };

export type Category = {
  id: number;
  parent_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  path: string;
  depth: number;
  item_count: number;
};

export type CategoryNode = Category & { children: CategoryNode[]; total_item_count: number };

export const LOCATION_KINDS = ['building', 'floor', 'room', 'area', 'furniture', 'shelf', 'container', 'other'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  building: 'Edificio',
  floor: 'Piano',
  room: 'Stanza',
  area: 'Area',
  furniture: 'Mobile',
  shelf: 'Ripiano',
  container: 'Contenitore',
  other: 'Altro',
};

export type Location = {
  id: number;
  parent_id: number | null;
  name: string;
  kind: LocationKind;
  code: string | null;
  notes: string | null;
  color: string | null;
  sort_order: number;
  path: string;
  depth: number;
  room_id: number | null;
  room_name: string | null;
  item_count: number;
};

export type LocationNode = Location & { children: LocationNode[]; total_item_count: number };

export type Status = {
  id: number;
  key: string;
  label: string;
  color: string | null;
  counts_as_owned: number;
  is_wishlist: number;
  is_default: number;
  is_system: number;
  sort_order: number;
  item_count: number;
};

export type Tag = { id: number; name: string; color: string | null; created_at: string; item_count: number };

export type Vendor = { id: number; name: string; website: string | null; notes: string | null; item_count: number };

export type Attachment = {
  id: number;
  file_id: number;
  entity_type: string;
  entity_id: number;
  kind: 'photo' | 'receipt' | 'invoice' | 'manual' | 'warranty' | 'other';
  title: string | null;
  original_filename: string;
  is_primary: number;
  sort_order: number;
  created_at: string;
  sha256: string;
  byte_size: number;
  mime: string;
  rel_path: string;
};

export const ATTACHMENT_KIND_LABELS: Record<Attachment['kind'], string> = {
  photo: 'Foto',
  receipt: 'Ricevuta',
  invoice: 'Fattura',
  manual: 'Manuale',
  warranty: 'Garanzia',
  other: 'Documento',
};

export const PRIORITIES = ['bassa', 'media', 'alta', 'urgente'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SHOPPING_STATUSES = ['da_comprare', 'ordinato', 'acquistato', 'annullato'] as const;
export type ShoppingStatus = (typeof SHOPPING_STATUSES)[number];

export const SHOPPING_STATUS_LABELS: Record<ShoppingStatus, string> = {
  da_comprare: 'Da comprare',
  ordinato: 'Ordinato',
  acquistato: 'Acquistato',
  annullato: 'Annullato',
};

export type ShoppingItem = {
  id: number;
  name: string;
  notes: string | null;
  category_id: number | null;
  category_path: string | null;
  location_id: number | null;
  location_path: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  desired_quantity: number;
  unit: string;
  estimated_price: number | null;
  currency: string;
  priority: Priority;
  status: ShoppingStatus;
  url: string | null;
  item_id: number | null;
  source_item_id: number | null;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
  estimated_total: number | null;
};

export type Dashboard = {
  totals: {
    items: number;
    units: number;
    categories: number;
    locations: number;
    rooms: number;
    containers: number;
    tags: number;
    attachments: number;
    trash: number;
    inventory_value: number;
    currency: string;
  };
  spending: { last_30_days: number; this_month: number; this_year: number; total: number };
  recent_added: Item[];
  recent_updated: Item[];
  to_buy: { count: number; estimated_total: number; items: ShoppingItem[] };
  low_stock: { count: number; items: Item[] };
  warranties: { expiring_count: number; expired_count: number; items: Item[] };
  expirations: { expiring_count: number; expired_count: number; items: Item[] };
  attention_count: number;
};

export type Bucket = { key: string; label: string; items: number; units: number; value: number };

export type Stats = {
  currency: string;
  totals: { items: number; units: number; value: number; current_value: number; with_price: number; without_price: number };
  by_category: Bucket[];
  by_room: Bucket[];
  by_status: Bucket[];
  by_vendor: Bucket[];
  by_month: Array<{ month: string; items: number; value: number }>;
  top_items: Array<{ id: number; name: string; value: number; currency: string; category: string | null }>;
};

export type ItemEvent = {
  id: number;
  item_id: number;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  occurred_at: string;
};

export type BackupInfo = {
  name: string;
  created_at: string;
  label: string | null;
  bytes: number;
  files: number;
  schema_version: number;
  valid: boolean;
};

export type StorageCheck = {
  files: number;
  attachments: number;
  total_bytes: number;
  missing: Array<{ id: number; rel_path: string }>;
  corrupted: Array<{ id: number; rel_path: string }>;
  orphan_blobs: number;
};

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name?: string; message: string }>;
  created_categories: number;
  created_locations: number;
};

export type SearchResults = {
  query: string;
  items: Item[];
  items_total: number;
  categories: Array<{ id: number; name: string; path: string; item_count: number }>;
  locations: Array<{ id: number; name: string; path: string; kind: string; item_count: number }>;
  tags: Array<{ id: number; name: string }>;
  shopping: Array<{ id: number; name: string; status: string; priority: string }>;
};

export type Health = {
  status: string;
  app: string;
  schema_version: number;
  database: string;
  data_dir: string;
  integrity: string;
  uptime_seconds: number;
  node: string;
};

export type ItemFilters = {
  q?: string;
  category_id?: number;
  include_subcategories?: boolean;
  location_id?: number;
  include_sublocations?: boolean;
  room_id?: number;
  status_ids?: number[];
  tag_ids?: number[];
  vendor_id?: number;
  brand?: string;
  price_min?: number;
  price_max?: number;
  purchased_from?: string;
  purchased_to?: string;
  is_consumable?: boolean;
  below_min?: boolean;
  warranty?: WarrantyStatus;
  expiring_within_days?: number;
  expired?: boolean;
  has_attachments?: boolean;
  is_favorite?: boolean;
  owned_only?: boolean;
  wishlist_only?: boolean;
  no_category?: boolean;
  no_location?: boolean;
  trash?: 'exclude' | 'include' | 'only';
  sort?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};
