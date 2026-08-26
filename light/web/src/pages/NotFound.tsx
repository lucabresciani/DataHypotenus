import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <div className="page">
      <div className="panel">
        <EmptyState
          icon="search"
          title="Pagina non trovata"
          description="Il collegamento non corrisponde a nessuna sezione di datahypotenus."
          action={
            <Link to="/" className="btn btn-primary">
              Torna alla dashboard
            </Link>
          }
        />
      </div>
    </div>
  );
}
