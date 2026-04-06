import { LogOut, UserCircle2, Wifi, WifiOff } from 'lucide-react';

function Header({ wsConnected, username, onLogout }) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <img src="/FiberMaster_Logo.png" alt="FiberMaster" className="w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                FiberMaster
              </h1>
              <p className="text-sm text-gray-500">
                Fiber Network Monitoring System
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 rounded-lg bg-slate-100 px-3 py-2">
              <UserCircle2 className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-700 font-medium">{username || 'operator'}</span>
            </div>

            <div className="flex items-center space-x-2">
              {wsConnected ? (
                <>
                  <Wifi className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-green-600 font-medium">
                    Connected
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-600 font-medium">
                    Disconnected
                  </span>
                </>
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <span className="font-medium">
                {new Date().toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </span>
            </div>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
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
