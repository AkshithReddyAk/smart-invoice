import React, { useEffect, useState } from 'react';
import {
  Copy,
  Download,
  Edit,
  Eye,
  FileText,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type { InvoiceRecord, InvoiceTemplate } from '../types';

interface InvoicesListViewProps {
  title: string;
  subtitle: string;
  templates: InvoiceTemplate[];
  onEditInvoice: (inv: InvoiceRecord) => void;
  onRefreshAll: () => Promise<void>;
}

export const InvoicesListView: React.FC<InvoicesListViewProps> = ({
  title,
  subtitle,
  templates,
  onEditInvoice,
  onRefreshAll,
}) => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [viewingInv, setViewingInv] = useState<InvoiceRecord | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listInvoices({
        q,
        customer,
        date_from: dateFrom,
        date_to: dateTo,
        template_id: templateId,
      });
      setInvoices(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q, customer, dateFrom, dateTo, templateId]);

  const handleDuplicate = async (inv: InvoiceRecord) => {
    try {
      const copy = await api.duplicateInvoice(inv.id);
      await onRefreshAll();
      onEditInvoice(copy);
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate invoice');
    }
  };

  const handleRegenerate = async (inv: InvoiceRecord) => {
    if (
      inv.has_pdf &&
      !window.confirm(`Overwrite existing PDF for invoice ${inv.invoice_number}?`)
    ) {
      return;
    }
    try {
      await api.regeneratePdf(inv.id, true);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate PDF');
    }
  };

  const handleDelete = async (inv: InvoiceRecord) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number} permanently?`)) return;
    try {
      await api.deleteInvoice(inv.id);
      await load();
      await onRefreshAll();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4 sm:space-y-5 p-3 sm:p-5 lg:p-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice # or customer..."
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none touch-manipulation"
          />
        </div>
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="Filter customer..."
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm touch-manipulation"
        />
        <div className="flex gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From Date"
            className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs touch-manipulation"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To Date"
            className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs touch-manipulation"
          />
        </div>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm touch-manipulation"
        >
          <option value="">All Templates</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table & Mobile Cards */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 sm:p-10 text-center text-sm text-slate-400">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 sm:p-10 text-center text-sm text-slate-500">
            No matching invoices found.
          </div>
        ) : (
          <>
            {/* Mobile View: Clean Responsive Cards (< sm) */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/70">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{inv.invoice_number}</span>
                        {inv.status === 'draft' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Draft
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-700 font-medium mt-0.5">{inv.customer_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-indigo-700">₹ {fmt(inv.grand_total)}</div>
                      <div className="text-[11px] text-slate-400">{inv.invoice_date}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Template: <span className="font-medium text-slate-700">{inv.template_name_snapshot || 'Standard A4'}</span>
                  </div>

                  {/* Mobile Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      <button
                        title="View Details"
                        onClick={() => setViewingInv(inv)}
                        className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Edit Invoice"
                        onClick={() => onEditInvoice(inv)}
                        className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Duplicate to New Invoice"
                        onClick={() => handleDuplicate(inv)}
                        className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Regenerate PDF"
                        onClick={() => handleRegenerate(inv)}
                        className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <a
                        href={api.getInvoicePdfUrl(inv.id, false)}
                        title="Download PDF"
                        className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 touch-manipulation"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </a>
                      <button
                        title="Delete Invoice"
                        onClick={() => handleDelete(inv)}
                        className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50 touch-manipulation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / Tablet: Full Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto mobile-scroll">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {inv.invoice_number}
                        {inv.status === 'draft' && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{inv.customer_name}</td>
                      <td className="px-4 py-3 text-slate-600">{inv.invoice_date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {inv.template_name_snapshot || 'Standard A4'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        ₹ {fmt(inv.grand_total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            title="View Details"
                            onClick={() => setViewingInv(inv)}
                            className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Edit Invoice"
                            onClick={() => onEditInvoice(inv)}
                            className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Duplicate to New Invoice"
                            onClick={() => handleDuplicate(inv)}
                            className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Regenerate PDF"
                            onClick={() => handleRegenerate(inv)}
                            className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 touch-manipulation"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={api.getInvoicePdfUrl(inv.id, false)}
                            title="Download PDF"
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 touch-manipulation"
                          >
                            <Download className="h-3.5 w-3.5" /> PDF
                          </a>
                          <button
                            title="Delete Invoice"
                            onClick={() => handleDelete(inv)}
                            className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50 touch-manipulation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Invoice Details Modal */}
      {viewingInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  Invoice {viewingInv.invoice_number}
                </h3>
              </div>
              <button
                onClick={() => setViewingInv(null)}
                className="rounded border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 touch-manipulation"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
              <div>
                <div className="font-bold uppercase text-slate-500">Customer</div>
                <div className="mt-1 font-semibold text-slate-900">{viewingInv.customer_name}</div>
                <div className="whitespace-pre-line text-slate-600">{viewingInv.billing_address}</div>
                {viewingInv.customer_phone && <div>Phone: {viewingInv.customer_phone}</div>}
                {viewingInv.customer_gstin && <div>GSTIN: {viewingInv.customer_gstin}</div>}
              </div>
              <div className="text-left sm:text-right">
                <div>
                  <strong>Date:</strong> {viewingInv.invoice_date}
                </div>
                <div>
                  <strong>Template:</strong> {viewingInv.template_name_snapshot}
                </div>
                <div>
                  <strong>Tax Mode:</strong> {viewingInv.tax_mode}
                </div>
                <div className="mt-1 text-base font-bold text-indigo-700">
                  Total: ₹ {fmt(viewingInv.grand_total)}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto mobile-scroll mt-4">
              <table className="w-full border-collapse text-xs min-w-[440px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-200 px-2 py-1.5">#</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Description</th>
                    <th className="border border-slate-200 px-2 py-1.5">Qty</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-right">Rate</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-right">GST%</th>
                    <th className="border border-slate-200 px-2 py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingInv.items.map((it) => (
                    <tr key={it.sl_no}>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{it.sl_no}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{it.description}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right">{fmt(it.rate)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right">{it.gst_percent}%</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold">
                        {fmt(it.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col-reverse xs:flex-row justify-end gap-2">
              <button
                onClick={() => {
                  const target = viewingInv;
                  setViewingInv(null);
                  onEditInvoice(target);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation text-center"
              >
                Edit Invoice
              </button>
              <a
                href={api.getInvoicePdfUrl(viewingInv.id, false)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 touch-manipulation text-center"
              >
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
