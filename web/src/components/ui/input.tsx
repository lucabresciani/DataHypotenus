import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-[2.125rem] w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-base',
        'outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-quint)]',
        'placeholder:text-faint hover:border-border-strong',
        'focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/25 aria-invalid:ring-[3px]',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
