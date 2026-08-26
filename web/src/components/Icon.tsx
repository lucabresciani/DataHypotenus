/**
 * Un solo alfabeto di icone per tutta l'applicazione: Lucide, la famiglia su
 * cui shadcn/ui e' costruito. Mescolarne due si vede subito, anche senza saper
 * dire perche'.
 *
 * Questo modulo resta un dizionario di nomi di dominio ("posizione", "scorta")
 * invece che di disegni: se domani il glifo giusto per "stanza" cambia, cambia
 * qui e non in trenta punti.
 */
import {
  Archive,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  Clock,
  Copy,
  DoorOpen,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  History,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  MapPin,
  Menu,
  Minus,
  Moon,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Sun,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const icons = {
  dashboard: LayoutGrid,
  box: Package,
  boxes: Boxes,
  tag: Tag,
  pin: MapPin,
  room: DoorOpen,
  container: Archive,
  cart: ShoppingCart,
  clock: Clock,
  chart: BarChart3,
  settings: Settings2,
  search: Search,
  plus: Plus,
  minus: Minus,
  close: X,
  chevron: ChevronRight,
  edit: Pencil,
  trash: Trash2,
  copy: Copy,
  move: FolderInput,
  check: Check,
  alert: TriangleAlert,
  info: Info,
  image: ImageIcon,
  file: FileText,
  upload: Upload,
  download: Download,
  star: Star,
  menu: Menu,
  sun: Sun,
  moon: Moon,
  shield: ShieldCheck,
  refresh: RefreshCw,
  external: ExternalLink,
  folder: Folder,
  history: History,
  filter: SlidersHorizontal,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  filled?: boolean;
  /** Se c'e', l'icona porta significato e viene annunciata. Altrimenti e' decoro. */
  title?: string;
  style?: React.CSSProperties;
};

export function Icon({ name, size = 16, className, filled = false, title, style }: IconProps) {
  const Glyph = icons[name];
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      absoluteStrokeWidth
      className={cn('shrink-0', className)}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    />
  );
}
