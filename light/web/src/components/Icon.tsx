/**
 * Set di icone disegnate a mano, un solo stile (tratto 1.7, viewBox 24).
 * Nessuna libreria: poche icone servono davvero, e restano coerenti fra loro
 * perche' sono tutte scritte con le stesse regole.
 */
export type IconName =
  | 'dashboard'
  | 'box'
  | 'tag'
  | 'pin'
  | 'cart'
  | 'clock'
  | 'chart'
  | 'settings'
  | 'search'
  | 'plus'
  | 'minus'
  | 'close'
  | 'chevron'
  | 'edit'
  | 'trash'
  | 'copy'
  | 'move'
  | 'check'
  | 'alert'
  | 'info'
  | 'image'
  | 'file'
  | 'upload'
  | 'download'
  | 'star'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'shield'
  | 'refresh'
  | 'external'
  | 'folder'
  | 'container'
  | 'room'
  | 'history'
  | 'filter';

const paths: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
    </>
  ),
  box: (
    <>
      <path d="M21 8.5v7a1.8 1.8 0 0 1-.95 1.6l-6.2 3.4a1.8 1.8 0 0 1-1.7 0l-6.2-3.4A1.8 1.8 0 0 1 5 15.5v-7" />
      <path d="M4.2 7.4 11.15 3.6a1.8 1.8 0 0 1 1.7 0l6.95 3.8a.7.7 0 0 1 0 1.2l-6.95 3.8a1.8 1.8 0 0 1-1.7 0L4.2 8.6a.7.7 0 0 1 0-1.2Z" />
      <path d="M12 12.6V20" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.2V5a1.5 1.5 0 0 1 1.5-1.5h6.2a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-6.2 6.2a1.5 1.5 0 0 1-2.12 0l-7.3-7.3a1.5 1.5 0 0 1-.44-1.06Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  room: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  container: (
    <>
      <rect x="3.5" y="6.5" width="17" height="13" rx="1.5" />
      <path d="M3.5 10.5h17M10 6.5V4.5h4v2" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.4a1.6 1.6 0 0 0 1.57 1.26h7.9a1.6 1.6 0 0 0 1.56-1.2L20 7.5H6" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16.5v-4M12.5 16.5v-8M17 16.5v-5.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-2.72 1.14v.17a1.9 1.9 0 1 1-3.8 0v-.09A1.6 1.6 0 0 0 7.4 18.3a1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06A1.6 1.6 0 0 0 3.3 14a1.6 1.6 0 0 0-1.47-1H1.7a1.9 1.9 0 1 1 0-3.8h.09A1.6 1.6 0 0 0 3.3 8.1a1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06A1.6 1.6 0 0 0 7.4 3.9h.08A1.6 1.6 0 0 0 8.5 2.43V2.3a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47 1h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.47 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 5.5v-.6a1.4 1.4 0 0 0-1.4-1.4H4.9a1.4 1.4 0 0 0-1.4 1.4v9.2a1.4 1.4 0 0 0 1.4 1.4h.6" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m8.5 6.5 3.5-3.5 3.5 3.5M8.5 17.5 12 21l3.5-3.5M6.5 8.5 3 12l3.5 3.5M17.5 8.5 21 12l-3.5 3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: (
    <>
      <path d="M12 3.8 2.8 20h18.4L12 3.8Z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 4.5-4.2a1.6 1.6 0 0 1 2.2 0L15 17M14 14.5l1.6-1.5a1.6 1.6 0 0 1 2.2 0L20.5 15" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z" />
      <path d="M13.5 3.5v5h5" />
    </>
  ),
  upload: (
    <>
      <path d="M4 15.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3.5" />
      <path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" />
    </>
  ),
  download: (
    <>
      <path d="M4 15.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3.5" />
      <path d="M12 4v11.5M7.5 11 12 15.5 16.5 11" />
    </>
  ),
  star: <path d="m12 3.8 2.6 5.4 5.9.85-4.25 4.15 1 5.9L12 17.3 6.75 20.1l1-5.9L3.5 10.05l5.9-.85Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.3 8.3 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2Z" />,
  shield: (
    <>
      <path d="M12 3.2 5 6v5.5c0 4.3 2.9 8.2 7 9.3 4.1-1.1 7-5 7-9.3V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5a8 8 0 1 0-.9 5" />
      <path d="M20 4.5v5h-5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </>
  ),
  folder: (
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.3V19l-3.6 1.8v-8L4 5.5Z" />,
};

export type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  filled?: boolean;
  title?: string;
  style?: React.CSSProperties;
};

export function Icon({ name, size = 18, className, filled = false, title, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}
