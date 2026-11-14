import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { api } from '../api';

interface PasswordModalProps {
  title?: string;
  description?: string;
  currentUserPhone?: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const TEMPLATE_ACCESS_PASSWORD = 'Ak@200419';

export const PasswordModal: React.FC<PasswordModalProps> = ({
  title = 'Admin Authorization Required',
  description = 'Enter the password to access invoice templates and edit field layouts.',
  currentUserPhone,
  onSuccess,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) {
      setError('Please enter the password');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    if (currentUserPhone) {
      setVerifying(true);
      try {
        await api.verifyPassword(currentUserPhone, password);
        setError('');
        onSuccess();
      } catch (err: any) {
        setError(err.message || 'Incorrect password. Please try again.');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        inputRef.current?.select();
      } finally {
        setVerifying(false);
      }
    } else {
      if (password === TEMPLATE_ACCESS_PASSWORD) {
        setError('');
        onSuccess();
      } else {
        setError('Incorrect password. Please try again.');
        setShake(true);
        setTimeout(() => setShake(false), 500);
        inputRef.current?.select();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-md rounded-2xl bg-white shadow-2xl transition-all border border-slate-100 overflow-hidden mx-auto ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-4 sm:px-6 sm:py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md shadow-inner text-white">
              <Lock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">{title}</h3>
              <p className="text-[11px] sm:text-xs text-indigo-100">Protected Area</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white transition touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4">
          <p className="text-xs leading-relaxed text-slate-600">{description}</p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Enter Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter password..."
                className={`w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm shadow-xs outline-none transition focus:ring-2 touch-manipulation ${
                  error
                    ? 'border-red-400 bg-red-50/50 text-red-900 focus:border-red-500 focus:ring-red-200'
                    : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-100'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
            <Lock className="h-3 w-3 text-slate-400 shrink-0" />
            <span>Auto-locks immediately whenever you switch to another page.</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition disabled:opacity-50 touch-manipulation"
            >
              {verifying ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Unlock Access</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
