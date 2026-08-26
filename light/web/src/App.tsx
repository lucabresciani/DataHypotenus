import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { InventoryPage } from './pages/Inventory.tsx';
import { ItemDetailPage } from './pages/ItemDetail.tsx';
import { CategoriesPage } from './pages/Categories.tsx';
import { LocationsPage } from './pages/Locations.tsx';
import { LocationDetailPage } from './pages/LocationDetail.tsx';
import { ShoppingPage } from './pages/Shopping.tsx';
import { DeadlinesPage } from './pages/Deadlines.tsx';
import { StatsPage } from './pages/Stats.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TrashPage } from './pages/Trash.tsx';
import { NotFoundPage } from './pages/NotFound.tsx';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/oggetti/:id" element={<ItemDetailPage />} />
        <Route path="/categorie" element={<CategoriesPage />} />
        <Route path="/posizioni" element={<LocationsPage />} />
        <Route path="/posizioni/:id" element={<LocationDetailPage />} />
        <Route path="/acquisti" element={<ShoppingPage />} />
        <Route path="/scadenze" element={<DeadlinesPage />} />
        <Route path="/statistiche" element={<StatsPage />} />
        <Route path="/impostazioni" element={<SettingsPage />} />
        <Route path="/cestino" element={<TrashPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
