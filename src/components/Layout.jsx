import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import PlayerBar from './PlayerBar';
import FolderPermissionBanner from './FolderPermissionBanner';

export default function Layout() {
  return (
    <div className="app-layout">
      <FolderPermissionBanner />
      <Navigation />
      <main className="app-main">
        <div className="app-main-inner page-content">
          <Outlet />
        </div>
      </main>
      <PlayerBar />
    </div>
  );
}