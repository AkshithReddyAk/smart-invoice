import type {
  AppSettings,
  DashboardStats,
  InvoiceFormState,
  InvoiceRecord,
  InvoiceTemplate,
  TemplateMappings,
} from './types';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function formatApiUrl(path: string): string {
  if (path.startsWith('/api') && API_BASE) {
    return `${API_BASE}${path}`;
  }
  return path;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = formatApiUrl(url);
  const res = await fetch(fullUrl, options);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') {
        detail = data.detail;
      } else if (Array.isArray(data.detail)) {
        detail = data.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ');
      }
    } catch {
      // ignore json parse failure
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  // Auth
  sendOtp: (phone: string) =>
    request<{ status: string; phone: string; message: string; otp: string; expires_in: number }>(
      '/api/auth/send-otp',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      }
    ),
  verifyOtp: (phone: string, otp: string) =>
    request<{ status: string; token: string; phone: string; role: string }>('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    }),

  getDashboard: () => request<DashboardStats>('/api/dashboard'),

  // Settings & Backup
  getSettings: () => request<AppSettings>('/api/settings'),
  updateSettings: (data: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<AppSettings>('/api/settings/logo', { method: 'POST', body: fd });
  },
  getLogoUrl: () => formatApiUrl(`/api/settings/logo/image?t=${Date.now()}`),
  getBackupExportUrl: () => formatApiUrl('/api/settings/backup/export'),
  restoreBackup: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{ status: string; message: string }>('/api/settings/backup/restore', {
      method: 'POST',
      body: fd,
    });
  },

  // Templates
  listTemplates: () => request<InvoiceTemplate[]>('/api/templates'),
  uploadTemplate: (file: File, name: string, setAsDefault: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name);
    fd.append('set_as_default', String(setAsDefault));
    return request<InvoiceTemplate>('/api/templates/upload', { method: 'POST', body: fd });
  },
  updateTemplate: (id: string, payload: { name?: string; field_mappings?: TemplateMappings; is_default?: boolean }) =>
    request<InvoiceTemplate>(`/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  setDefaultTemplate: (id: string) =>
    request<InvoiceTemplate>(`/api/templates/${id}/set-default`, { method: 'POST' }),
  replaceTemplateFile: (id: string, file: File, preserveMappings: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('preserve_mappings', String(preserveMappings));
    return request<InvoiceTemplate>(`/api/templates/${id}/replace`, { method: 'POST', body: fd });
  },
  deleteTemplate: (id: string) =>
    request<{ status: string; id: string }>(`/api/templates/${id}`, { method: 'DELETE' }),
  getTemplatePageUrl: (id: string, pageNum: number, cacheBust?: string) =>
    formatApiUrl(`/api/templates/${id}/pages/${pageNum}${cacheBust ? `?v=${encodeURIComponent(cacheBust)}` : ''}`),
  getDocxStructure: (id: string) => request<any>(`/api/templates/${id}/docx-structure`),
  getPdfWidgets: (id: string) => request<{ widgets: any[] }>(`/api/templates/${id}/pdf-widgets`),
  locateTemplateLabel: (
    id: string,
    fieldKey: string,
    label: string,
    page: number,
    existingFields: any[]
  ) =>
    request<{
      found: boolean;
      matched_label?: string;
      placement?: string;
      x_pct?: number;
      y_pct?: number;
      w_pct?: number;
      h_pct?: number;
      font_size?: number;
      font_weight?: 'normal' | 'bold';
      color?: string;
      align?: 'left' | 'center' | 'right';
    }>(`/api/templates/${id}/locate-label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_key: fieldKey,
        label,
        page,
        existing_fields: existingFields,
      }),
    }),
  detectBoxStyle: (
    id: string,
    box: { x_pct: number; y_pct: number; w_pct: number; h_pct: number },
    fieldKey: string,
    page: number
  ) =>
    request<{
      font_size: number;
      font_weight: 'normal' | 'bold';
      color: string;
      align: 'left' | 'center' | 'right';
    }>(`/api/templates/${id}/detect-style`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...box, field_key: fieldKey, page }),
    }),
  matchAllFieldStyles: (id: string, fields: any[]) =>
    request<{ fields: any[] }>(`/api/templates/${id}/match-styles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }),

  // Invoices
  getNextInvoiceNumber: () => request<{ invoice_number: string }>('/api/invoices/next-number'),
  listInvoices: (params?: { q?: string; customer?: string; date_from?: string; date_to?: string; template_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.customer) qs.set('customer', params.customer);
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.template_id) qs.set('template_id', params.template_id);
    const str = qs.toString();
    return request<InvoiceRecord[]>(`/api/invoices${str ? `?${str}` : ''}`);
  },
  getInvoice: (id: string) => request<InvoiceRecord>(`/api/invoices/${id}`),
  createInvoice: (form: InvoiceFormState) =>
    request<InvoiceRecord>('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, confirm_overwrite: false }),
    }),
  updateInvoice: (id: string, form: InvoiceFormState, confirmOverwrite: boolean) =>
    request<InvoiceRecord>(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, confirm_overwrite: confirmOverwrite }),
    }),
  regeneratePdf: (id: string, confirmOverwrite: boolean) =>
    request<InvoiceRecord>(`/api/invoices/${id}/regenerate?confirm_overwrite=${confirmOverwrite}`, {
      method: 'POST',
    }),
  duplicateInvoice: (id: string) =>
    request<InvoiceRecord>(`/api/invoices/${id}/duplicate`, { method: 'POST' }),
  deleteInvoice: (id: string) =>
    request<{ status: string; id: string }>(`/api/invoices/${id}`, { method: 'DELETE' }),
  previewDocxLive: (form: InvoiceFormState) =>
    request<any>('/api/invoices/preview-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }),
  getInvoicePdfUrl: (id: string, inline = false) => formatApiUrl(`/api/invoices/${id}/pdf?inline=${inline}`),
  getInvoiceDocxUrl: (id: string) => formatApiUrl(`/api/invoices/${id}/docx`),
};
