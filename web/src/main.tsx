import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/App.tsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/styles/theme.css';

/**
 * L'applicazione gira in locale: la rete e' il loopback, quindi niente
 * retry aggressivi ne' refetch a ogni cambio finestra. Meglio dati stabili
 * e invalidazioni esplicite dopo ogni modifica.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root non trovato');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={350} skipDelayDuration={200}>
          <App />
          <Toaster />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
