import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api';

interface LoginPageProps {
  onLoginSuccess: (user: { phone: string; token: string; role: string }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phoneInputRef.current?.focus();
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const clean = phone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      phoneInputRef.current?.focus();
      return;
    }

    if (!password) {
      setError('Please enter your access password.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      passwordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(clean, password);
      localStorage.setItem('smart_invoice_auth_session', JSON.stringify(res));
      onLoginSuccess(res);
    } catch (err: any) {
      setError(
        err.message ||
          'Access Denied: Mobile number is not authorized or password is incorrect.'
      );
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      {/* Background radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div
          className={`overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-800/90 shadow-2xl backdrop-blur-xl transition-all ${
            shake ? 'animate-shake' : ''
          }`}
        >
          {/* Top Brand Banner */}
          <div className="border-b border-slate-700/80 bg-slate-850/80 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <h1 className="mt-4 text-xl font-extrabold tracking-tight text-white">
              SmartInvoice Studio
            </h1>
            <p className="mt-1 text-xs font-medium text-indigo-300">
              ADMS e Bikes — Authorized Access Portal
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Warning / Error Message Banner */}
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/50 p-3.5 text-xs text-rose-200">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed font-medium">{error}</div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Mobile Number Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Authorized Mobile Number
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center gap-1.5 text-xs font-bold text-slate-400 border-r border-slate-600 pr-2.5">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Enter 10-digit number"
                    maxLength={14}
                    className="w-full rounded-xl border border-slate-600 bg-slate-900/80 py-3 pl-20 pr-4 text-sm font-semibold text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Access Password
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Enter password"
                    className="w-full rounded-xl border border-slate-600 bg-slate-900/80 py-3 pl-10 pr-11 text-sm font-semibold text-white placeholder-slate-500 shadow-inner outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !phone.trim() || !password.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Sign In to Studio</span>
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Footer Security Badges */}
          <div className="flex items-center justify-center gap-4 border-t border-slate-700/80 bg-slate-900/60 px-6 py-3.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3 text-emerald-400" /> 256-bit Secure
            </span>
            <span>•</span>
            <span>Whitelisted Mobile Access</span>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          SmartInvoice Studio • Protected by Whitelisted Mobile & Password
        </p>
      </div>
    </div>
  );
};
