import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  Save,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { AppSettings, PaperSize } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  currentUserPhone?: string;
  onUpdated: (s: AppSettings) => void;
  onRestored: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  currentUserPhone,
  onUpdated,
  onRestored,
}) => {
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  // Password Reset State
  const [pwForm, setPwForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwError('');

    if (!currentUserPhone) {
      setPwError('No active user phone found. Please log in again.');
      return;
    }
    if (!pwForm.oldPassword) {
      setPwError('Please enter your current password.');
      return;
    }
    if (!pwForm.newPassword) {
      setPwError('Please enter a new password.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters long.');
      return;
    }

    setPwLoading(true);
    try {
      const res = await api.changePassword({
        phone: currentUserPhone,
        old_password: pwForm.oldPassword,
        new_password: pwForm.newPassword,
        confirm_password: pwForm.confirmPassword,
      });
      if (res.token) {
        try {
          const raw = localStorage.getItem('smart_invoice_auth_session');
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.token = res.token;
            localStorage.setItem('smart_invoice_auth_session', JSON.stringify(parsed));
          }
        } catch {
          // ignore session write error
        }
      }
      setPwMsg(res.message || 'Password updated successfully! Old password is now invalidated.');
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPwError(err.message || 'Failed to update password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const updated = await api.updateSettings(form);
      setForm(updated);
      onUpdated(updated);
      setMsg('Settings saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setError('');
    setMsg('');
    try {
      const updated = await api.uploadLogo(file);
      setForm(updated);
      onUpdated(updated);
      setMsg('Company logo updated.');
    } catch (err: any) {
      setError(err.message || 'Logo upload failed');
    }
  };

  const handleRestore = async (file: File) => {
    if (!window.confirm('Restoring a backup will replace current templates, invoices, and settings. Continue?')) {
      return;
    }
    setError('');
    setMsg('');
    try {
      await api.restoreBackup(file);
      await onRestored();
      setMsg('Backup restored successfully.');
    } catch (err: any) {
      setError(err.message || 'Restore failed');
    }
  };

  return (
    <div className="max-w-4xl space-y-4 sm:space-y-6 p-3 sm:p-5 lg:p-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Configure default company details, invoice numbering, payment details, and database backups.
        </p>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 sm:space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-bold text-slate-900">Company Profile</h2>
          <div className="mb-4 flex flex-col xs:flex-row items-start xs:items-center gap-3 sm:gap-4">
            <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {form.company_logo_path ? (
                <img src={api.getLogoUrl()} alt="Company Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <span className="text-xs text-slate-400">No Logo</span>
              )}
            </div>
            <div>
              <input
                ref={logoRef}
                type="file"
                accept=".png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Company Logo
              </button>
              <p className="mt-1 text-[11px] text-slate-500">PNG or JPG recommended.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Company Name</label>
              <input
                value={form.company_name}
                onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">GSTIN</label>
              <input
                value={form.gstin}
                onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">PAN Number</label>
              <input
                value={form.pan_number}
                onChange={(e) => setForm((p) => ({ ...p, pan_number: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Website</label>
              <input
                value={form.website}
                onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Company Address</label>
              <textarea
                rows={2}
                value={form.company_address}
                onChange={(e) => setForm((p) => ({ ...p, company_address: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
          <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-bold text-slate-900">Invoice & Payment Defaults</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Invoice Number Prefix</label>
              <input
                value={form.invoice_prefix}
                onChange={(e) => setForm((p) => ({ ...p, invoice_prefix: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Next Sequence #</label>
              <input
                type="number"
                min="1"
                value={form.next_invoice_seq}
                onChange={(e) =>
                  setForm((p) => ({ ...p, next_invoice_seq: Math.max(1, Number(e.target.value) || 1) }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Default Paper Size</label>
              <select
                value={form.default_paper_size}
                onChange={(e) =>
                  setForm((p) => ({ ...p, default_paper_size: e.target.value as PaperSize }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              >
                <option value="A4">A4</option>
                <option value="TEMPLATE">Original Template Size</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Default Place of Supply</label>
              <input
                value={form.default_place_of_supply}
                onChange={(e) =>
                  setForm((p) => ({ ...p, default_place_of_supply: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Default Payment Terms</label>
              <input
                value={form.default_payment_terms}
                onChange={(e) => setForm((p) => ({ ...p, default_payment_terms: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Default UPI ID</label>
              <input
                value={form.upi_id}
                onChange={(e) => setForm((p) => ({ ...p, upi_id: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-slate-600">Bank Account Details</label>
              <textarea
                rows={2}
                value={form.bank_account_details}
                onChange={(e) => setForm((p) => ({ ...p, bank_account_details: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs font-medium text-slate-600">Payment Instructions</label>
              <input
                value={form.default_payment_instructions}
                onChange={(e) =>
                  setForm((p) => ({ ...p, default_payment_instructions: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 touch-manipulation"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </section>
      </form>

      {/* User Security & Reset Password Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-3 sm:pb-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
              <KeyRound className="h-5 w-5 text-indigo-600 shrink-0" /> Reset Password
            </h2>
            {currentUserPhone && (
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-indigo-700">
                User: +91 {currentUserPhone}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Change your personal login password. Once updated, your old password will be <strong>immediately invalidated</strong>.
          </p>
        </div>

        {pwMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{pwMsg}</span>
          </div>
        )}

        {pwError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{pwError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3.5 sm:space-y-4 max-w-xl">
          {/* Old Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current / Old Password *
            </label>
            <div className="relative">
              <input
                type={showOldPw ? 'text' : 'password'}
                value={pwForm.oldPassword}
                onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })}
                placeholder="Enter current password"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-xs shadow-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 touch-manipulation"
              />
              <button
                type="button"
                onClick={() => setShowOldPw(!showOldPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                tabIndex={-1}
              >
                {showOldPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password *
              </label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  placeholder="Min 6 characters"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-xs shadow-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 touch-manipulation"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  placeholder="Re-type new password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-xs shadow-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 touch-manipulation"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-slate-400 hover:text-slate-600 touch-manipulation"
                  tabIndex={-1}
                >
                  {showConfirmPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={pwLoading || !pwForm.oldPassword || !pwForm.newPassword || !pwForm.confirmPassword}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-98 transition disabled:opacity-50 touch-manipulation"
            >
              {pwLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Database Backup & Restore */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-900">
              <Database className="h-5 w-5 text-indigo-600 shrink-0" /> Database Backup & Restore
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Download a complete ZIP backup of your database, uploaded templates, logos, and generated PDFs, or restore from an archive.
            </p>
          </div>
          <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto shrink-0">
            <a
              href={api.getBackupExportUrl()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation text-center"
            >
              <Download className="h-4 w-4" /> Download Backup ZIP
            </a>
            <input
              ref={restoreRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleRestore(f);
              }}
            />
            <button
              type="button"
              onClick={() => restoreRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 touch-manipulation"
            >
              <Upload className="h-4 w-4" /> Restore Backup
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
