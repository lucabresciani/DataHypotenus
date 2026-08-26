import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useResolvedTheme } from '@/lib/theme.ts';

/**
 * Il wrapper originale legge il tema da `next-themes`, che qui non c'e':
 * il tema risolto sta su `<html data-theme>` e lo legge `useResolvedTheme`.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={16}
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'font-sans text-base',
          description: 'text-muted-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-text': 'var(--ok)',
          '--error-text': 'var(--destructive)',
          '--warning-text': 'var(--warn)',
          '--info-text': 'var(--info)',
          '--border-radius': 'var(--radius-lg)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
