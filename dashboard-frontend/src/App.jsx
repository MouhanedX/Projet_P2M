import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import TestControlPage from './components/TestControlPage';
import LoginPage from './components/LoginPage';
import { authAPI } from './services/api';
import websocketService from './services/websocket';

function App() {
  const navigate = useNavigate();
  const [wsConnected, setWsConnected] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [activeView, setActiveView] = useState('noc');

  const checkSession = useCallback(async () => {
    try {
      const response = await authAPI.me();
      if (response.data?.authenticated) {
        setIsAuthenticated(true);
        setUsername(response.data.username || 'operator');
      } else {
        setIsAuthenticated(false);
        setUsername('');
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUsername('');
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!isAuthenticated) {
      websocketService.disconnect();
      setWsConnected(false);
      return;
    }

    const syncStatus = () => {
      setWsConnected(websocketService.isConnected());
    };

    syncStatus();
    const intervalId = setInterval(syncStatus, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const handleBeforeUnload = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/auth/logout');
        return;
      }

      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        keepalive: true
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated]);

  const handleLoginSuccess = useCallback((authData) => {
    setIsAuthenticated(true);
    setUsername(authData?.username || 'operator');
    navigate('/', { replace: true });
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.warn('Logout request failed, clearing local session state anyway', error);
    }

    websocketService.disconnect();
    setWsConnected(false);
    setIsAuthenticated(false);
    setUsername('');
    navigate('/login', { replace: true });
  }, [navigate]);

  const renderProtectedPage = (content) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    return (
      <div className="h-svh overflow-y-auto overflow-x-hidden overscroll-y-none bg-white">
        <Header wsConnected={wsConnected} username={username} onLogout={handleLogout} activeView={activeView} setActiveView={setActiveView} />
        <main className="w-full px-3 sm:px-5 lg:px-8 py-5">
          {content}
        </main>
      </div>
    );
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="card text-center max-w-sm w-full">
          <p className="text-slate-700 font-medium">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to="/" replace />
            : <LoginPage onLoginSuccess={handleLoginSuccess} />
        }
      />
      <Route path="/" element={renderProtectedPage(<Dashboard activeView={activeView} setActiveView={setActiveView} />)} />
      <Route path="/config" element={renderProtectedPage(<TestControlPage configOnly />)} />
      <Route path="/test" element={renderProtectedPage(<TestControlPage />)} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default App;
