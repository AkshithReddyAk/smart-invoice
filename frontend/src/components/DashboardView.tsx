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
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-5 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Upload your invoice template once, map your fields, and generate exact-layout PDFs in seconds.
          </p>
        </div>
        <div className="flex flex-col xs:flex-row gap-2 sm:gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => onNavigate('templates')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation"
          >
            <Upload className="h-4 w-4 text-indigo-600 shrink-0" /> Upload Template
          </button>
          <button
            onClick={() => onNavigate('create')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 touch-manipulation"
          >
            <PlusCircle className="h-4 w-4 shrink-0" /> Create New Invoice
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Invoices Generated
            </span>
            <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
          </div>
          <div className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-900">
            {stats?.total_invoices ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Invoice Value
            </span>
            <IndianRupee className="h-5 w-5 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-900 truncate">
            ₹ {fmt(stats?.total_invoice_value ?? 0)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saved Templates
            </span>
            <LayoutTemplate className="h-5 w-5 text-amber-600 shrink-0" />
          </div>
          <div className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-900">
            {stats?.saved_templates ?? 0}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent Invoices
            </span>
            <FileSpreadsheet className="h-5 w-5 text-sky-600 shrink-0" />
          </div>
          <div className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-900">
            {stats?.recent_invoices.length ?? 0}
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Recent Invoices</h2>
          <button
            onClick={() => onNavigate('history')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 touch-manipulation"
          >
            View All <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {!stats || stats.recent_invoices.length === 0 ? (
          <div className="p-8 sm:p-10 text-center text-xs sm:text-sm text-slate-500">
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
          <>
            {/* Mobile Cards (screens < 640px) */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {stats.recent_invoices.map((inv) => (
                <div key={inv.id} className="p-3.5 space-y-2 hover:bg-slate-50/70">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{inv.invoice_number}</div>
                      <div className="text-xs text-slate-600 font-medium">{inv.customer_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-indigo-700">₹ {fmt(inv.grand_total)}</div>
                      <div className="text-[11px] text-slate-400">{inv.invoice_date}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 truncate max-w-[150px]">
                      {inv.template_name_snapshot || 'Standard A4'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenInvoice(inv.id)}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 touch-manipulation"
                      >
                        Edit
                      </button>
                      <a
                        href={api.getInvoicePdfUrl(inv.id, false)}
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 touch-manipulation"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / Tablet Table (screens >= 640px) */}
            <div className="hidden sm:block overflow-x-auto mobile-scroll">
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
                            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 touch-manipulation"
                          >
                            Edit
                          </button>
                          <a
                            href={api.getInvoicePdfUrl(inv.id, false)}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 touch-manipulation"
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
          </>
        )}
      </div>
    </div>
  );
};
