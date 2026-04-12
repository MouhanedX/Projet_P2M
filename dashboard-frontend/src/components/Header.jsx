import { LogOut, LayoutDashboard, Activity, Router, SlidersHorizontal, Wrench } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

function Header({ wsConnected, onLogout, activeView, setActiveView }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isConfigPath = location.pathname === '/config';
  const isTestPath = location.pathname === '/test';

  const handleSectionClick = (id) => {
    if (id === 'config') {
      navigate('/config');
      return;
    }

    if (id === 'test') {
      navigate('/test');
      return;
    }

    setActiveView(id);
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  const isSectionActive = (id) => {
    if (id === 'config') {
      return isConfigPath;
    }

    if (id === 'test') {
      return isTestPath;
    }

    return location.pathname === '/' && activeView === id;
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 min-h-20">
          <div className="flex items-center space-x-2">
            <img src="/favicon_FiberMaster.png" alt="FiberMaster" className="w-14 h-14 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                FiberMaster
              </h1>
              <p className="text-xs text-gray-500">
                Fiber Network Monitoring System
              </p>
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <div className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="flex items-center justify-center gap-1">
                {[
                  { id: 'noc', label: 'Dashboard', icon: LayoutDashboard },
                  { id: 'rtus', label: 'RTUs', icon: Activity },
                  { id: 'network', label: 'Optical Network', icon: Router },
                  { id: 'test', label: 'Alarm Test', icon: Wrench },
                  { id: 'config', label: 'Test Configuration', icon: SlidersHorizontal }
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => handleSectionClick(id)}
                    className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center justify-center space-x-1.5 text-sm ${
                      isSectionActive(id)
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-sm text-gray-600">
              <span className="font-medium">
                {new Date().toLocaleString('en-US', {
                  dateStyle: 'medium'
                })}
              </span>
            </div>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
