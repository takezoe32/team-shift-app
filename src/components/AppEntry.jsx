import { lazy, useEffect, useState } from 'react';
const App = lazy(() => import('../App.jsx'));
const DataSafety = lazy(() => import('./DataSafety.jsx'));
const InventoryAccess = lazy(() => import('./InventoryAccess.jsx'));
export default function AppEntry() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route === '#data-safety' ? <DataSafety/> : route === '#inventory-access' ? <InventoryAccess/> : <App/>;
}
