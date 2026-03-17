import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Enroll from './pages/Enroll';
import ChargingHistory from './pages/ChargingHistory';
import ChargerPage from './pages/ChargerPage';
import GreenImpact from './pages/GreenImpact';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState('enroll'); // start on enroll to demo the flow
  const [enrolled, setEnrolled] = useState(false);

  const handleEnrollComplete = (plan) => {
    setEnrolled(true);
    setPage('dashboard');
  };

  if (page === 'enroll' && !enrolled) {
    return <Enroll onComplete={handleEnrollComplete} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={setPage} />;
      case 'history': return <ChargingHistory />;
      case 'charger': return <ChargerPage />;
      case 'impact': return <GreenImpact />;
      case 'settings': return <Settings />;
      default: return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto">
        {renderPage()}
      </main>
    </div>
  );
}
