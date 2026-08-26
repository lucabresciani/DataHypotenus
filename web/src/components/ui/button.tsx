import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Bottone del sistema "Archivio".
 *
 * Due scelte che lo distinguono dal bottone predefinito di shadcn:
 *  - `destructive` non e' mai pieno. Un rosso pieno attira il clic per
 *    abitudine: qui l'azione pericolosa e' un contorno con inchiostro rosso,
 *    e si riempie solo al passaggio del mouse.
 *  - la pressione si vede: 1px di affondamento, 120ms. Il bottone deve
 *    sembrare che stia ascoltando.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'text-sm font-medium outline-none transition-[background-color,border-color,color,transform] duration-150',
    'ease-[var(--ease-out-quint)] touch-manipulation',
    'focus-visible:ring-ring/45 focus-visible:border-ring focus-visible:ring-[3px]',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:translate-y-px',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border border-input bg-background hover:bg-secondary hover:border-border-strong',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        destructive:
          'border border-input bg-background text-destructive hover:bg-destructive-soft hover:border-destructive focus-visible:ring-destructive/35',
        link: 'text-primary-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[2.125rem] px-3.5 has-[>svg]:px-3',
        sm: 'h-7 gap-1.5 px-2.5 text-xs has-[>svg]:px-2',
        lg: 'h-10 px-5 text-base',
        icon: 'size-[2.125rem]',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
