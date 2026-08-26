import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Unisce classi condizionali risolvendo i conflitti di Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
