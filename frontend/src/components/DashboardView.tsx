import React from 'react';
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  LayoutTemplate,
  PlusCircle,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { DashboardStats, NavSection } from '../types';

interface DashboardViewProps {
  stats: DashboardStats | null;
  onNavigate: (sec: NavSection) => void;
  onOpenInvoice: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  onNavigate,
  onOpenInvoice,
}) => {
  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Upload your invoice template once, map your fields, and generate exact-layout PDFs in seconds.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onNavigate('templates')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-4 w-4 text-indigo-600" /> Upload Template
          </button>
          <button
            onClick={() => onNavigate('create')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <PlusCircle className="h-4 w-4" /> Create New Invoice
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Invoices Generated
            </span>
            <FileText className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">
            {stats?.total_invoices ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Invoice Value
            </span>
            <IndianRupee className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">
            ₹ {fmt(stats?.total_invoice_value ?? 0)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Templates
            </span>
            <LayoutTemplate className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">
            {stats?.saved_templates ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent Invoices
            </span>
            <FileSpreadsheet className="h-5 w-5 text-sky-600" />
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">
            {stats?.recent_invoices.length ?? 0}
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Recent Invoices</h2>
          <button
            onClick={() => onNavigate('history')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View All <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {!stats || stats.recent_invoices.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No invoices generated yet. Upload a template or click{' '}
            <button
              onClick={() => onNavigate('create')}
              className="font-semibold text-indigo-600 hover:underline"
            >
              Create New Invoice
            </button>{' '}
            to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Invoice #</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Template</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent_invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{inv.customer_name}</td>
                    <td className="px-5 py-3 text-slate-600">{inv.invoice_date}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {inv.template_name_snapshot || 'Standard A4'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">
                      ₹ {fmt(inv.grand_total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => onOpenInvoice(inv.id)}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <a
                          href={api.getInvoicePdfUrl(inv.id, false)}
                          className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
