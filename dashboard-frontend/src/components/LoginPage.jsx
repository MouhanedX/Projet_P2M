import { useState } from 'react';
import { LockKeyhole, LogIn, Shield } from 'lucide-react';
import { authAPI } from '../services/api';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md card border-white/20 bg-white/95">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Login</h1>
          <p className="text-sm text-slate-600 mt-1">
            Session-based access for FiberMaster monitoring.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoComplete="username"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <div className="mt-1 relative">
              <LockKeyhole className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
      </div>
    </div>
  );
}

export default LoginPage;
