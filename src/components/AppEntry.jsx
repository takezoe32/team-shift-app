import { lazy, useEffect, useState } from 'react';
const App = lazy(() => import('../App.jsx'));
const InventoryAccess = lazy(() => import('./InventoryAccess.jsx'));
export default function AppEntry() {
  const [inventory, setInventory] = useState(() => window.location.hash === '#inventory-access');
  useEffect(() => {
    const update = () => setInventory(window.location.hash === '#inventory-access');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return inventory ? <InventoryAccess/> : <App/>;
}
