/** Tipi del dominio "oggetto". Condivisi fra repository, service e route. */

export type ItemRow = {
  id: number;
  uid: string;
  name: string;
  description: string | null;
  category_id: number | null;
  location_id: number | null;
  status_id: number;
  vendor_id: number | null;
  quantity: number;
  unit: string;
  is_consumable: number;
  min_quantity: number | null;
  initial_quantity: number | null;
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
  specs: string | null;
  is_favorite: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Riga "arricchita" restituita dalle query di lettura (join gia' risolti). */
export type ItemJoinedRow = ItemRow & {
  category_name: string | null;
  category_path: string | null;
  location_name: string | null;
  location_path: string | null;
  location_kind: string | null;
  room_id: number | null;
  room_name: string | null;
  status_key: string;
  status_label: string;
  status_color: string | null;
  counts_as_owned: number;
  is_wishlist: number;
  vendor_name: string | null;
  attachment_count: number;
  photo_count: number;
  document_count: number;
  primary_photo_id: number | null;
  tags_json: string | null;
};

export type TagRef = { id: number; name: string; color: string | null };

export type WarrantyStatus = 'none' | 'active' | 'expiring' | 'expired';
export type ExpirationStatus = 'none' | 'ok' | 'expiring' | 'expired';

/** Rappresentazione dell'oggetto verso l'esterno (API e interfaccia). */
export type ItemView = {
  id: number;
  uid: string;
  name: string;
  description: string | null;
  category: { id: number; name: string; path: string } | null;
  location: { id: number; name: string; path: string; kind: string; room_id: number | null; room_name: string | null } | null;
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

export type ItemInput = {
  name: string;
  description?: string | null;
  category_id?: number | null;
  location_id?: number | null;
  status_id?: number | null;
  status_key?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
  quantity?: number;
  unit?: string;
  is_consumable?: boolean;
  min_quantity?: number | null;
  initial_quantity?: number | null;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  sku?: string | null;
  barcode?: string | null;
  purchase_price?: number | null;
  current_value?: number | null;
  currency?: string;
  purchase_date?: string | null;
  product_url?: string | null;
  warranty_months?: number | null;
  warranty_start?: string | null;
  warranty_end?: string | null;
  warranty_notes?: string | null;
  expiration_date?: string | null;
  expected_lifespan_months?: number | null;
  notes?: string | null;
  specs?: Record<string, string> | null;
  is_favorite?: boolean;
  tags?: string[];
  tag_ids?: number[];
  uid?: string;
};

export const ITEM_SORTS = [
  'name',
  'created_at',
  'updated_at',
  'purchase_date',
  'purchase_price',
  'quantity',
  'category',
  'location',
  'status',
  'relevance',
] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export type ItemFilters = {
  q?: string;
  category_id?: number;
  include_subcategories?: boolean;
  location_id?: number;
  include_sublocations?: boolean;
  room_id?: number;
  status_ids?: number[];
  tag_ids?: number[];
  tags_mode?: 'any' | 'all';
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
  sort?: ItemSort;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export type ItemListResult = {
  items: ItemView[];
  total: number;
  limit: number;
  offset: number;
  /** Somma di purchase_price * quantity sugli oggetti che rientrano nel filtro. */
  total_value: number;
};
