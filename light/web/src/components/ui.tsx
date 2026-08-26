/**
 * Primitive dell'interfaccia: modale, notifiche, campi, stati vuoti.
 * Vocabolario unico: se un bottone "salva" appare uguale ovunque e' perche'
 * viene sempre da qui.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon.tsx';
import { ApiError } from '../lib/api.ts';

/* ============================================================================
   Notifiche
   ========================================================================== */

type Toast = { id: number; message: string; tone: 'info' | 'success' | 'error'; action?: { label: string; run: () => void } };

type ToastContextValue = {
  notify: (message: string, action?: Toast['action']) => void;
  success: (message: string, action?: Toast['action']) => void;
  fail: (error: unknown, fallback?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast['tone'], action?: Toast['action']) => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone, action }]);
    // Gli errori restano piu' a lungo: vanno letti, non intravisti.
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      notify: (message, action) => push(message, 'info', action),
      success: (message, action) => push(message, 'success', action),
      fail: (error, fallback = 'Operazione non riuscita') => {
        const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
        const fields = error instanceof ApiError ? error.fieldErrors : [];
        push(fields.length > 0 ? `${message}: ${fields.map((f) => f.message).join(', ')}` : message, 'error');
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.tone}`}>
              <span className="toast-icon" style={{ flex: 'none', marginTop: 1 }}>
                <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'success' ? 'check' : 'info'} size={16} />
              </span>
              <span className="grow">{toast.message}</span>
              {toast.action ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={toast.action.run}>
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
                aria-label="Chiudi notifica"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast va usato dentro <ToastProvider>');
  return context;
}

/* ============================================================================
   Modale
   ========================================================================== */

export type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    /* Il primo campo utile prende il fuoco, si puo' iniziare a scrivere subito.
       Cercare `input, textarea, select, button` su tutto il modale pescava
       sempre la X di chiusura, che nell'ordine del documento viene prima del
       modulo: l'`autoFocus` del primo campo veniva annullato ogni volta. */
    const target =
      ref.current?.querySelector<HTMLElement>(
        '.modal-body input:not([type="hidden"]):not([disabled]), .modal-body textarea, .modal-body select',
      ) ??
      ref.current?.querySelector<HTMLElement>('.modal-footer button') ??
      ref.current?.querySelector<HTMLElement>('button');
    target?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header className="modal-header">
          <h2 id={titleId} style={{ fontSize: 'var(--text-lg)' }}>
            {title}
          </h2>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Chiudi">
            <Icon name="close" size={18} />
          </button>
        </header>
        {children}
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </>,
    document.body,
  );
}

export type ConfirmProps = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Quando la conferma richiede una scelta che l'utente non ha ancora fatto
   *  (per esempio: a quale stato spostare gli oggetti). Meglio un bottone
   *  spento di un errore dal server a cose fatte. */
  confirmDisabled?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  onClose: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Conferma',
  destructive,
  confirmDisabled,
  onConfirm,
  onClose,
}: ConfirmProps) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}${busy ? ' loading' : ''}`}
            onClick={run}
            disabled={busy || confirmDisabled}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="modal-body">{typeof message === 'string' ? <p>{message}</p> : message}</div>
    </Modal>
  );
}

/* ============================================================================
   Campi
   ========================================================================== */

export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <span className="label">{label}</span>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

/** Sezione richiudibile: il modulo non mostra trenta campi tutti insieme. */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  summary,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="form-section">
      <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chevron" size={16} className="chevron" />
        {title}
        {summary && !open ? <span className="muted small" style={{ fontWeight: 400 }}>· {summary}</span> : null}
      </button>
      {open ? children : null}
    </section>
  );
}

/* ============================================================================
   Stati
   ========================================================================== */

export function EmptyState({
  icon = 'box',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="col" style={{ gap: 8, padding: 'var(--space-3)' }} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Errore imprevisto';
  return (
    <div className="error-box">
      <Icon name="alert" size={18} />
      <div className="grow">
        <strong>Qualcosa non ha funzionato</strong>
        <p className="small">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Riprova
        </button>
      ) : null}
    </div>
  );
}

/* ============================================================================
   Etichette di stato
   ========================================================================== */

export function StatusBadge({ label, color }: { label: string; color?: string | null }) {
  return (
    <span className="badge" style={color ? { background: `color-mix(in oklab, ${color} 16%, transparent)`, color } : undefined}>
      <span className="badge-dot" style={color ? { background: color } : undefined} />
      {label}
    </span>
  );
}

/** Il testo accompagna sempre il colore: mai un pallino colorato e basta. */
export function AlertBadge({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  const icon: IconName = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : tone === 'warn' ? 'clock' : 'alert';
  return (
    <span className={`badge ${tone}`}>
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}
