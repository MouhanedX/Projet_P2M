import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn, User } from 'lucide-react';
import { authAPI } from '../services/api';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const previousBodyBackground = document.body.style.background;
    const previousHtmlBackground = document.documentElement.style.background;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousHtmlOverflowX = document.documentElement.style.overflowX;

    document.body.style.background = 'linear-gradient(135deg, #020617 0%, #1e3a8a 50%, #0e7490 100%)';
    document.documentElement.style.background = '#020617';
    document.body.style.overflowX = 'hidden';
    document.documentElement.style.overflowX = 'hidden';

    return () => {
      document.body.style.background = previousBodyBackground;
      document.documentElement.style.background = previousHtmlBackground;
      document.body.style.overflowX = previousBodyOverflowX;
      document.documentElement.style.overflowX = previousHtmlOverflowX;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');

    try {
      const response = await authAPI.login({
        username: username.trim(),
        password
      });

      onLoginSuccess(response.data);
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed. Please verify your credentials.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-slate-950 via-blue-900 to-cyan-800">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />
      </div>

      <div className="relative min-h-full px-4 py-10 flex items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-white/30 bg-white/95 p-7 shadow-[0_30px_80px_-30px_rgba(2,6,23,0.85)] backdrop-blur-sm">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-sm">
              <img src="/favicon_FiberMaster.png" alt="FiberMaster" className="h-9 w-9 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">FiberMaster Login</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Username
              <div className="mt-1 relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <div className="mt-1 relative">
                <LockKeyhole className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>

            {errorMessage && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-blue-600 text-white font-semibold py-2.5 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Authorized users only
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
