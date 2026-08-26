/**
 * I pezzi ricorrenti dell'applicazione, costruiti sopra le primitive di
 * shadcn/ui. Se un bottone "salva" e' uguale ovunque e' perche' viene da qui.
 *
 * La scelta strutturale del sistema: NIENTE riquadro dentro riquadro. Una
 * pagina e' un foglio; le sezioni si separano con un filetto e con lo spazio,
 * non impilando scatole ombreggiate. L'elevazione (la classe `Card`) resta per
 * cio' che galleggia davvero.
 */
import * as React from 'react';
import { toast as sonner } from 'sonner';

import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api.ts';
import { Icon, type IconName } from '@/components/Icon.tsx';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ============================================================================
   Notifiche
   ========================================================================== */

/**
 * Adattatore su sonner. Gli errori dell'API arrivano come `ApiError` con i
 * messaggi campo per campo: qui vengono tradotti una volta sola, cosi' nessuna
 * pagina deve sapere com'e' fatto un errore HTTP.
 */
export const toast = {
  info: (message: string, action?: { label: string; run: () => void }) =>
    sonner(message, action ? { action: { label: action.label, onClick: action.run } } : undefined),

  success: (message: string, action?: { label: string; run: () => void }) =>
    sonner.success(message, action ? { action: { label: action.label, onClick: action.run } } : undefined),

  fail: (error: unknown, fallback = 'Operazione non riuscita') => {
    const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
    const fields = error instanceof ApiError ? error.fieldErrors : [];
    sonner.error(message, {
      description: fields.length > 0 ? fields.map((f) => f.message).join(' · ') : undefined,
      duration: 7000,
    });
  },
};

/** Compatibilita' con la forma a hook usata nelle pagine. */
export function useToast() {
  return toast;
}

/* ============================================================================
   Impaginazione
   ========================================================================== */

export function Page({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-6 md:px-8 md:py-8', className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumb}
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="max-w-[70ch] text-base text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Una sezione della pagina: titolo, eventuale spiegazione, eventuale azione,
 * poi il contenuto sotto un filetto. Nessuna ombra, nessun bordo intorno:
 * e' il foglio che continua.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bare = false,
  as: Tag = 'section',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Senza filetto e senza intestazione: solo il contenuto, gia' spaziato. */
  bare?: boolean;
  as?: 'section' | 'div' | 'form';
}) {
  return (
    <Tag className={cn('flex flex-col', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="text-md font-semibold tracking-[-0.01em]">{title}</h2> : null}
            {description ? <p className="max-w-[75ch] text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(!bare && 'border-t border-border pt-4')}>{children}</div>
    </Tag>
  );
}

/** L'unica superficie che galleggia: usarla solo quando l'elevazione dice qualcosa. */
export function Card({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card shadow-[var(--shadow-raise)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * La miniatura di un oggetto. Con `width`/`height` espliciti: una foto che
 * arriva dopo non deve far saltare la riga.
 */
export function Thumb({
  photoId,
  alt = '',
  size = 34,
  className,
}: {
  photoId?: number | null;
  alt?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-faint', className)}
      style={{ width: size, height: size }}
    >
      {photoId ? (
        <img
          src={`/api/v1/attachments/${photoId}/file`}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <Icon name="box" size={Math.round(size * 0.42)} />
      )}
    </span>
  );
}

/* ============================================================================
   Moduli
   ========================================================================== */

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const id = React.useId();
  const controlId = htmlFor ?? id;
  const describedBy = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: controlId,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : children}
      {error ? (
        <span id={`${controlId}-error`} className="text-xs text-destructive">
          {error}
        </span>
      ) : hint ? (
        <span id={`${controlId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Sezione richiudibile: un modulo non mostra trenta campi tutti insieme. */
export function Collapsible({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-border pt-3 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-base font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron"
          size={15}
          className="text-faint transition-transform duration-200 ease-[var(--ease-out-quint)] group-open:rotate-90"
        />
        {title}
        {summary ? <span className="text-sm font-normal text-muted-foreground group-open:hidden">· {summary}</span> : null}
      </summary>
      <div className="pt-3 pb-1">{children}</div>
    </details>
  );
}

/* ============================================================================
   Stati della pagina
   ========================================================================== */

export function EmptyState({
  icon = 'box',
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-lg bg-secondary text-faint">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="text-md font-semibold">{title}</h3>
      {description ? <p className="max-w-[46ch] text-base text-muted-foreground">{description}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Errore imprevisto';
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive-soft p-4 text-destructive">
      <Icon name="alert" size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <strong className="text-base font-semibold">Qualcosa non ha funzionato</strong>
        <p className="text-sm break-words opacity-90">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Riprova
        </Button>
      ) : null}
    </div>
  );
}

/** Scheletro che ha la forma di quello che sta arrivando, non un cerchio che gira. */
export function LoadingRows({ rows = 4, height = 44, className }: { rows?: number; height?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} style={{ height }} className="w-full rounded-md" />
      ))}
    </div>
  );
}

/* ============================================================================
   Etichette di stato
   ========================================================================== */

export function StatusBadge({ label, color }: { label: string; color?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={
        color
          ? { background: `color-mix(in oklab, ${color} 14%, transparent)`, borderColor: `color-mix(in oklab, ${color} 28%, transparent)`, color }
          : undefined
      }
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

const alertTones = {
  ok: 'border-ok/30 bg-ok-soft text-ok',
  warn: 'border-warn/30 bg-warn-soft text-warn',
  danger: 'border-destructive/30 bg-destructive-soft text-destructive',
  info: 'border-info/30 bg-info-soft text-info',
  neutral: 'border-border bg-secondary text-muted-foreground',
} as const;

/** Il testo accompagna sempre il colore: mai un pallino colorato e basta. */
export function AlertBadge({
  tone,
  children,
  icon,
  className,
}: {
  tone: keyof typeof alertTones;
  children: React.ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const fallback: IconName = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : tone === 'warn' ? 'clock' : 'alert';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        alertTones[tone],
        className,
      )}
    >
      {tone === 'neutral' && !icon ? null : <Icon name={icon ?? fallback} size={12} />}
      {children}
    </span>
  );
}

/* ============================================================================
   Conferme
   ========================================================================== */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  destructive,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  open?: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Quando la conferma richiede una scelta che l'utente non ha ancora fatto. */
  confirmDisabled?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

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
    <AlertDialog open={open ?? true} onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {typeof message === 'string' ? (
            <AlertDialogDescription>{message}</AlertDialogDescription>
          ) : (
            <div className="text-base text-muted-foreground">{message}</div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            asChild
            onClick={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || confirmDisabled}>
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
