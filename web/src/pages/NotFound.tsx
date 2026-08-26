import { Link } from 'react-router-dom';

import { EmptyState, Page } from '@/components/patterns.tsx';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        icon="search"
        title="Pagina non trovata"
        description="Il collegamento non corrisponde a nessuna sezione di datahypotenus."
        action={
          <Button asChild>
            <Link to="/">Torna alla dashboard</Link>
          </Button>
        }
        className="py-24"
      />
    </Page>
  );
}
