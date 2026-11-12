import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Edit2,
  KeyRound,
  Lock,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';

interface LoginPageProps {
  onLoginSuccess: (user: { phone: string; token: string; role: string }) => void;
}

const AUTHORIZED_LIST = [
  { phone: '9553057496', label: 'Primary Admin' },
  { phone: '9908599043', label: 'Billing Counter' },
  { phone: '9951404366', label: 'Operations & Sales' },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    phoneInputRef.current?.focus();
  }, []);

  useEffect(() => {
    let timer: any;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handlePhoneSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const clean = phone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.sendOtp(clean);
      setDemoOtp(res.otp);
      setStep('otp');
      setCountdown(30);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      setError(
        err.message ||
          'Access Denied: Mobile number is not authorized to access this website.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) {
      // Handle paste of whole OTP
      const digits = val.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        newOtp[i] = d;
      });
      setOtp(newOtp);
      const nextIdx = Math.min(digits.length, 5);
      otpInputRefs.current[nextIdx]?.focus();
      return;
    }

    const digit = val.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullOtp = otp.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter the complete 6-digit OTP code.');
      return;
    }

    const clean = phone.replace(/\D/g, '').slice(-10);
    setLoading(true);
    setError('');
    try {
      const res = await api.verifyOtp(clean, fullOtp);
      localStorage.setItem('smart_invoice_auth_session', JSON.stringify(res));
      onLoginSuccess(res);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const autoFillDemoOtp = () => {
    if (demoOtp && demoOtp.length === 6) {
      setOtp(demoOtp.split(''));
      setError('');
    }
  };

  const copyToClipboard = () => {
    if (demoOtp) {
      navigator.clipboard.writeText(demoOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      {/* Background radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-800/90 shadow-2xl backdrop-blur-xl">
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
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/50 p-3.5 text-xs text-rose-200 animate-shake">
                <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            {step === 'phone' ? (
              <form onSubmit={handlePhoneSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Enter Authorized Mobile Number
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

                {/* Quick Select Buttons for Authorized Numbers */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium">Authorized staff numbers:</span>
                    <span className="text-[10px] text-indigo-400">Click to fill</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {AUTHORIZED_LIST.map((item) => (
                      <button
                        type="button"
                        key={item.phone}
                        onClick={() => {
                          setPhone(item.phone);
                          setError('');
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                          phone.includes(item.phone)
                            ? 'border-indigo-500 bg-indigo-600/30 text-indigo-200'
                            : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                        }`}
                      >
                        <div className="font-semibold text-white">{item.phone}</div>
                        <div className="text-[9px] text-slate-400 truncate">{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !phone.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Verifying Mobile Number...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Login OTP</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                {/* Number Info Header */}
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 text-indigo-400" />
                    <div>
                      <div className="text-xs font-semibold text-white">+91 {phone.replace(/\D/g, '').slice(-10)}</div>
                      <div className="text-[10px] text-slate-400">One-Time Password Sent</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setError('');
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800"
                  >
                    <Edit2 className="h-3 w-3" /> Change
                  </button>
                </div>

                {/* Instant On-Screen OTP Notification Box */}
                {demoOtp && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-emerald-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>OTP Code Generated</span>
                      </div>
                      <button
                        type="button"
                        onClick={copyToClipboard}
                        className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300"
                      >
                        {copied ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-2xl font-black tracking-widest text-white">
                        {demoOtp}
                      </span>
                      <button
                        type="button"
                        onClick={autoFillDemoOtp}
                        className="rounded-lg bg-emerald-600/80 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                      >
                        Auto-Fill Code
                      </button>
                    </div>
                  </div>
                )}

                {/* 6 Digit Input Boxes */}
                <div>
                  <label className="block text-center text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5">
                    Enter 6-Digit OTP
                  </label>
                  <div className="flex justify-center gap-2">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => (otpInputRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        className="h-12 w-11 rounded-xl border border-slate-600 bg-slate-900/90 text-center font-mono text-lg font-bold text-white shadow-inner outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.join('').length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-500 hover:to-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Verify & Enter Portal</span>
                    </>
                  )}
                </button>

                {/* Resend Link */}
                <div className="text-center">
                  {countdown > 0 ? (
                    <span className="text-xs text-slate-400">
                      Resend code in <strong className="text-slate-200">{countdown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePhoneSubmit}
                      disabled={loading}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      Didn't get code? Resend OTP
                    </button>
                  )}
                </div>
              </form>
            )}
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
          SmartInvoice Studio • Protected by Mobile OTP Whitelist
        </p>
      </div>
    </div>
  );
};
