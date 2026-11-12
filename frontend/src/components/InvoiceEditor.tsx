import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  FileEdit,
  FilePlus2,
  FileText,
  LayoutPanelLeft,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sliders,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type {
  AppSettings,
  DiscountType,
  InvoiceFormState,
  InvoiceItem,
  InvoiceRecord,
  InvoiceTemplate,
  PaperSize,
  TaxMode,
} from '../types';
import { calculateInvoice, FIELD_PALETTE } from '../utils/calculator';
import { DirectFillCanvas } from './DirectFillCanvas';
import { LivePreview } from './LivePreview';

interface InvoiceEditorProps {
  templates: InvoiceTemplate[];
  settings: AppSettings;
  editingInvoice: InvoiceRecord | null;
  initialTemplateId?: string | null;
  onOpenTemplateEditor: (tpl: InvoiceTemplate) => void;
  onSaved: (inv: InvoiceRecord) => void;
  onNewBlank: () => void;
}

const STANDARD_KEYS = new Set([
  ...FIELD_PALETTE.map((p) => p.key),
  'gstin',
  'pan_number',
  'invoice_no',
  'date',
  'bill_to',
  'ship_to',
  'discount',
  'taxable',
  'cgst',
  'sgst',
  'igst',
  'total',
  'sl_no',
  'description',
  'item_description',
  'hsn_sac',
  'hsn',
  'quantity',
  'qty',
  'unit',
  'rate',
  'gst_percent',
  'gst_pct',
  'taxable_amount',
  'gst_amount',
  'total_amount',
]);

function makeEmptyItem(sl: number): InvoiceItem {
  return {
    sl_no: sl,
    description: '',
    hsn_sac: '',
    quantity: 1,
    unit: 'Nos',
    rate: 0,
    discount: 0,
    discount_type: 'amount',
    gst_percent: 18,
    taxable_amount: 0,
    gst_amount: 0,
    total_amount: 0,
  };
}

function buildInitialForm(
  settings: AppSettings,
  templates: InvoiceTemplate[],
  editing: InvoiceRecord | null,
  preferredTemplateId?: string | null
): InvoiceFormState {
  if (editing) {
    return {
      id: editing.id,
      template_id: editing.template_id,
      invoice_number: editing.invoice_number,
      invoice_date: editing.invoice_date,
      due_date: editing.due_date,
      place_of_supply: editing.place_of_supply,
      payment_terms: editing.payment_terms,
      po_number: editing.po_number,
      customer_name: editing.customer_name,
      billing_address: editing.billing_address,
      shipping_address: editing.shipping_address,
      customer_gstin: editing.customer_gstin,
      customer_phone: editing.customer_phone,
      customer_email: editing.customer_email,
      company_details: { ...editing.company_details },
      tax_mode: editing.tax_mode,
      auto_round_off: editing.auto_round_off,
      invoice_discount: editing.invoice_discount,
      amount_in_words: editing.amount_in_words,
      amount_in_words_manual: true,
      payment_instructions: editing.payment_instructions,
      bank_account_details: editing.bank_account_details,
      upi_id: editing.upi_id,
      extra_fields: { ...editing.extra_fields },
      paper_size: editing.paper_size || 'A4',
      items: editing.items.length ? editing.items.map((i) => ({ ...i })) : [makeEmptyItem(1)],
    };
  }

  const defaultTpl =
    templates.find((t) => t.id === preferredTemplateId) ||
    templates.find((t) => t.is_default) ||
    templates[0] ||
    null;

  const today = new Date().toISOString().slice(0, 10);
  return {
    template_id: defaultTpl ? defaultTpl.id : null,
    invoice_number: `${settings.invoice_prefix}${String(settings.next_invoice_seq).padStart(4, '0')}`,
    invoice_date: today,
    due_date: '',
    place_of_supply: settings.default_place_of_supply,
    payment_terms: settings.default_payment_terms,
    po_number: '',
    customer_name: '',
    billing_address: '',
    shipping_address: '',
    customer_gstin: '',
    customer_phone: '',
    customer_email: '',
    company_details: {
      company_name: settings.company_name,
      company_logo_path: settings.company_logo_path,
      company_address: settings.company_address,
      gstin: settings.gstin,
      pan_number: settings.pan_number,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
    },
    tax_mode: 'cgst_sgst',
    auto_round_off: true,
    invoice_discount: 0,
    amount_in_words: '',
    amount_in_words_manual: false,
    payment_instructions: settings.default_payment_instructions,
    bank_account_details: settings.bank_account_details,
    upi_id: settings.upi_id,
    extra_fields: {},
    paper_size: settings.default_paper_size || 'A4',
    items: [makeEmptyItem(1)],
  };
}

export const InvoiceEditor: React.FC<InvoiceEditorProps> = ({
  templates,
  settings,
  editingInvoice,
  initialTemplateId,
  onOpenTemplateEditor,
  onSaved,
  onNewBlank,
}) => {
  const [form, setForm] = useState<InvoiceFormState>(() =>
    buildInitialForm(settings, templates, editingInvoice, initialTemplateId)
  );
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [showCompany, setShowCompany] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'download' | 'print'>('save');
  const [mirrorShipTo, setMirrorShipTo] = useState(true);
  const [autoCalcGst5, setAutoCalcGst5] = useState(true);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === form.template_id) || null,
    [templates, form.template_id]
  );

  const canDirectFill = Boolean(
    selectedTemplate &&
      selectedTemplate.mode === 'background' &&
      selectedTemplate.field_mappings.fields.length > 0
  );
  const [editorMode, setEditorMode] = useState<'direct' | 'split'>('split');

  useEffect(() => {
    const next = buildInitialForm(settings, templates, editingInvoice, initialTemplateId);
    setForm(next);
    setError('');
    setSuccessMsg('');
    if (!editingInvoice) {
      api
        .getNextInvoiceNumber()
        .then((r) => setForm((prev) => ({ ...prev, invoice_number: r.invoice_number })))
        .catch(() => {});
    }
  }, [editingInvoice?.id, initialTemplateId]);

  useEffect(() => {
    if (!canDirectFill && editorMode === 'direct') {
      setEditorMode('split');
    }
  }, [selectedTemplate?.id, canDirectFill]);

  // Sorted, deduplicated fields belonging strictly to the selected background template
  const templateOnlyFields = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.mode !== 'background') return [];
    const seen = new Set<string>();
    return [...selectedTemplate.field_mappings.fields]
      .filter((f) => f.kind !== 'image' && f.field_key !== 'company_logo')
      .sort((a, b) => a.page - b.page || a.y_pct - b.y_pct || a.x_pct - b.x_pct)
      .filter((f) => {
        if (seen.has(f.field_key)) return false;
        seen.add(f.field_key);
        return true;
      });
  }, [selectedTemplate]);

  const docxItemKeys = useMemo(
    () =>
      new Set([
        'sl_no', 'description', 'item_description', 'hsn_sac', 'hsn',
        'quantity', 'qty', 'unit', 'rate', 'discount', 'gst_percent',
        'gst_pct', 'taxable_amount', 'gst_amount', 'total_amount', 'total',
      ]),
    []
  );

  const docxOnlyFields = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.mode !== 'docx') return [];
    const seen = new Set<string>();
    return selectedTemplate.docx_placeholders
      .filter((ph) => ph !== 'company_logo' && !docxItemKeys.has(ph.toLowerCase()))
      .filter((ph) => {
        if (seen.has(ph)) return false;
        seen.add(ph);
        return true;
      });
  }, [selectedTemplate, docxItemKeys]);

  const docxHasItemRow = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.mode !== 'docx') return false;
    return selectedTemplate.docx_placeholders.some((ph) => docxItemKeys.has(ph.toLowerCase()));
  }, [selectedTemplate, docxItemKeys]);

  const getTemplateFieldValue = (key: string): string => {
    if (key in form.extra_fields) return form.extra_fields[key];
    switch (key) {
      case 'invoice_number':
        return form.invoice_number;
      case 'invoice_date':
        return form.invoice_date;
      case 'due_date':
        return form.due_date;
      case 'place_of_supply':
        return form.place_of_supply;
      case 'payment_terms':
        return form.payment_terms;
      case 'po_number':
        return form.po_number;
      case 'customer_name':
        return form.customer_name;
      case 'billing_address':
        return form.billing_address;
      case 'shipping_address':
        return form.shipping_address;
      case 'customer_gstin':
        return form.customer_gstin;
      case 'customer_phone':
        return form.customer_phone;
      case 'customer_email':
        return form.customer_email;
      case 'payment_instructions':
        return form.payment_instructions;
      case 'bank_account_details':
        return form.bank_account_details;
      case 'upi_id':
        return form.upi_id;
      case 'amount_in_words':
        return form.amount_in_words;
      case 'company_name':
        return form.company_details.company_name;
      case 'company_address':
        return form.company_details.company_address;
      case 'company_gstin':
        return form.company_details.gstin;
      case 'company_pan':
        return form.company_details.pan_number;
      case 'company_phone':
        return form.company_details.phone;
      case 'company_email':
        return form.company_details.email;
      case 'company_website':
        return form.company_details.website;
      default:
        return form.extra_fields[key] ?? '';
    }
  };

  const setTemplateFieldValue = (key: string, val: string) => {
    setForm((prev) => {
      const next: InvoiceFormState = {
        ...prev,
        company_details: { ...prev.company_details },
        extra_fields: { ...prev.extra_fields },
      };
      switch (key) {
        case 'invoice_number':
          next.invoice_number = val;
          break;
        case 'invoice_date':
          next.invoice_date = val;
          break;
        case 'due_date':
          next.due_date = val;
          break;
        case 'place_of_supply':
          next.place_of_supply = val;
          break;
        case 'payment_terms':
          next.payment_terms = val;
          break;
        case 'po_number':
          next.po_number = val;
          break;
        case 'customer_name':
          next.customer_name = val;
          break;
        case 'billing_address':
          next.billing_address = val;
          break;
        case 'shipping_address':
          next.shipping_address = val;
          break;
        case 'customer_gstin':
          next.customer_gstin = val;
          break;
        case 'customer_phone':
          next.customer_phone = val;
          break;
        case 'customer_email':
          next.customer_email = val;
          break;
        case 'payment_instructions':
          next.payment_instructions = val;
          break;
        case 'bank_account_details':
          next.bank_account_details = val;
          break;
        case 'upi_id':
          next.upi_id = val;
          break;
        case 'amount_in_words':
          next.amount_in_words = val;
          next.amount_in_words_manual = true;
          next.extra_fields.amount_in_words = val;
          break;
        case 'company_name':
          next.company_details.company_name = val;
          break;
        case 'company_address':
          next.company_details.company_address = val;
          break;
        case 'company_gstin':
          next.company_details.gstin = val;
          break;
        case 'company_pan':
          next.company_details.pan_number = val;
          break;
        case 'company_phone':
          next.company_details.phone = val;
          break;
        case 'company_email':
          next.company_details.email = val;
          break;
        case 'company_website':
          next.company_details.website = val;
          break;
        default:
          next.extra_fields[key] = val;
          // Helpful sync for common aliases so DB records stay searchable
          if (key === 'invoice_no' && val.trim()) next.invoice_number = val.trim();
          if ((key === 'bill_to' || key === 'bill_name') && val.trim()) next.customer_name = val.trim();
          if (key === 'display_date' || key === 'date') {
            const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val.trim());
            if (dmy) next.invoice_date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
            else if (/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) next.invoice_date = val.trim();
          }
          break;
      }
      return next;
    });
  };

  // Detect any custom template fields not covered by standard form fields
  const customKeys = useMemo(() => {
    if (!selectedTemplate) return [] as Array<{ key: string; label: string }>;
    const list: Array<{ key: string; label: string }> = [];
    const seen = new Set<string>();
    if (selectedTemplate.mode === 'background') {
      for (const f of selectedTemplate.field_mappings.fields) {
        if (!STANDARD_KEYS.has(f.field_key) && !seen.has(f.field_key)) {
          seen.add(f.field_key);
          list.push({ key: f.field_key, label: f.label || f.field_key.replace(/_/g, ' ') });
        }
      }
    } else {
      for (const ph of selectedTemplate.docx_placeholders) {
        if (!STANDARD_KEYS.has(ph.toLowerCase()) && !seen.has(ph)) {
          seen.add(ph);
          list.push({ key: ph, label: ph.replace(/_/g, ' ') });
        }
      }
    }
    return list;
  }, [selectedTemplate]);

  const calc = useMemo(
    () => calculateInvoice(form.items, form.tax_mode, form.auto_round_off, form.invoice_discount),
    [form.items, form.tax_mode, form.auto_round_off, form.invoice_discount]
  );

  const validateClient = (preparedForm: InvoiceFormState): string | null => {
    if (!preparedForm.invoice_number.trim()) return 'Invoice Number is required.';
    if (!preparedForm.invoice_date.trim()) return 'Invoice Date is required.';
    if (preparedForm.due_date && preparedForm.due_date < preparedForm.invoice_date) {
      return 'Due Date cannot be earlier than Invoice Date.';
    }
    if (!preparedForm.customer_name.trim()) return 'Customer Name (Bill To) is required.';
    if (preparedForm.items.length === 0) return 'At least one product/service row is required.';
    for (let i = 0; i < preparedForm.items.length; i++) {
      const it = preparedForm.items[i];
      if (!it.description.trim()) return `Row #${i + 1}: Product/Service description cannot be empty.`;
      if (it.quantity <= 0) return `Row #${i + 1}: Quantity must be greater than 0.`;
      if (it.rate < 0) return `Row #${i + 1}: Rate cannot be negative.`;
      if (it.gst_percent < 0 || it.gst_percent > 100) {
        return `Row #${i + 1}: GST % must be between 0 and 100.`;
      }
    }
    return null;
  };

  const executeSave = async (
    action: 'save' | 'download' | 'print',
    confirmOverwrite: boolean
  ) => {
    const templateUsesItemsTable =
      !selectedTemplate ||
      (selectedTemplate.mode === 'background' && selectedTemplate.field_mappings.items_table.enabled) ||
      (selectedTemplate.mode === 'docx' && docxHasItemRow);

    const preparedItems = form.items.map((it, idx) => {
      if (idx === 0 && !templateUsesItemsTable && !it.description.trim()) {
        const modelDesc = [form.extra_fields.item_model, form.extra_fields.item_colour]
          .filter(Boolean)
          .join(' - ');
        return { ...it, description: modelDesc || 'Invoice Item' };
      }
      return it;
    });

    const hasCustomerFieldMapped =
      !selectedTemplate ||
      (selectedTemplate.mode === 'background'
        ? selectedTemplate.field_mappings.fields.some(
            (f) => f.field_key === 'customer_name' || f.field_key === 'bill_to'
          )
        : selectedTemplate.docx_placeholders.includes('customer_name'));

    let resolvedCustomerName = form.customer_name.trim();
    if (!resolvedCustomerName && !hasCustomerFieldMapped) {
      const firstVal = Object.values(form.extra_fields).find((v) => String(v || '').trim() !== '');
      resolvedCustomerName = (firstVal || 'Customer').trim();
    }

    const preparedForm: InvoiceFormState = {
      ...form,
      customer_name: resolvedCustomerName || form.customer_name,
      items: preparedItems,
      shipping_address:
        editorMode === 'direct' || selectedTemplate !== null
          ? form.shipping_address || form.billing_address
          : sameAsBilling
          ? form.billing_address
          : form.shipping_address,
      amount_in_words: form.amount_in_words_manual ? form.amount_in_words : calc.amount_in_words,
    };

    const validationErr = validateClient(preparedForm);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const saved = form.id
        ? await api.updateInvoice(form.id, preparedForm, confirmOverwrite)
        : await api.createInvoice(preparedForm);

      setForm((prev) => ({ ...prev, id: saved.id }));
      onSaved(saved);
      setSuccessMsg(`Invoice ${saved.invoice_number} saved and PDF generated.`);

      if (action === 'download') {
        const a = document.createElement('a');
        a.href = api.getInvoicePdfUrl(saved.id, false);
        a.download = `Invoice_${saved.invoice_number.replace(/[\\/]/g, '-')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (action === 'print') {
        const win = window.open(api.getInvoicePdfUrl(saved.id, true), '_blank');
        if (win) {
          win.addEventListener('load', () => {
            setTimeout(() => win.print(), 400);
          });
        }
      }
    } catch (err: any) {
      if (err.status === 409 && String(err.message).toLowerCase().includes('overwrite')) {
        setPendingAction(action);
        setConfirmOverwriteOpen(true);
      } else {
        setError(err.message || 'Failed to save invoice');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, makeEmptyItem(prev.items.length + 1)],
    }));
  };

  const removeItemRow = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items
        .filter((_, i) => i !== idx)
        .map((it, i) => ({ ...it, sl_no: i + 1 })),
    }));
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Top Action Bar */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Invoice Template
            </label>
            <div className="mt-0.5 flex items-center gap-2">
              <select
                value={form.template_id || ''}
                onChange={(e) => setForm((p) => ({ ...p, template_id: e.target.value || null }))}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Standard A4 (No Template)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.file_type.toUpperCase()}){t.is_default ? ' ★ Default' : ''}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={() => onOpenTemplateEditor(selectedTemplate)}
                  title="Adjust mapped fields on this template"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Sliders className="h-3.5 w-3.5" /> Adjust Fields
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Paper Size
            </label>
            <select
              value={form.paper_size}
              onChange={(e) => setForm((p) => ({ ...p, paper_size: e.target.value as PaperSize }))}
              className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="A4">A4 (Default)</option>
              <option value="TEMPLATE">Original Template Size</option>
            </select>
          </div>

          {canDirectFill && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Editing Mode
              </label>
              <div className="mt-0.5 inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setEditorMode('direct')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${
                    editorMode === 'direct'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <FileEdit className="h-3.5 w-3.5" /> Fill in Blanks
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('split')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${
                    editorMode === 'split'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <LayoutPanelLeft className="h-3.5 w-3.5" /> Form + Preview
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onNewBlank}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FilePlus2 className="h-4 w-4" /> New (Same Template)
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => executeSave('save', false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Invoice'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => executeSave('print', false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          {form.id && selectedTemplate?.mode === 'docx' && (
            <a
              href={api.getInvoiceDocxUrl(form.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <FileText className="h-4 w-4" /> DOCX
            </a>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => executeSave('download', false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Direct Fill-in-the-Blanks Mode OR Split-Screen Form + Preview */}
      {editorMode === 'direct' && selectedTemplate ? (
        <div className="flex-1 bg-slate-100 px-5 py-4">
          <div className="mx-auto mb-3 flex max-w-[880px] flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-indigo-900">
                Click any shaded blank on the invoice below and type directly:
              </span>
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={mirrorShipTo}
                  onChange={(e) => setMirrorShipTo(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                Auto-fill Shipped To from Bill To
              </label>
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={autoCalcGst5}
                  onChange={(e) => setAutoCalcGst5(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                Auto-calculate GST 5% & Totals
              </label>
            </div>
            <button
              type="button"
              onClick={onNewBlank}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
            >
              <Eraser className="h-3.5 w-3.5" /> Clear Blanks
            </button>
          </div>

          <DirectFillCanvas
            template={selectedTemplate}
            form={form}
            setForm={setForm}
            mirrorShipTo={mirrorShipTo}
            autoCalcGst5={autoCalcGst5}
          />
        </div>
      ) : (
      <div className="grid flex-1 grid-cols-1 gap-6 p-5 xl:grid-cols-12">
        {/* Left: Dynamic Form (Strictly matches selected template's fields!) */}
        <div className="space-y-5 xl:col-span-6">
          {selectedTemplate && selectedTemplate.mode === 'background' ? (
            <>
              {templateOnlyFields.length === 0 && !selectedTemplate.field_mappings.items_table.enabled ? (
                <section className="rounded-xl border-2 border-dashed border-indigo-300 bg-white p-8 text-center shadow-sm">
                  <Sliders className="mx-auto h-10 w-10 text-indigo-500" />
                  <h3 className="mt-3 text-base font-bold text-slate-900">
                    Define Fields for "{selectedTemplate.name}"
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
                    Only the fields you place on your template will appear here on the left. Click below to draw boxes directly over the blanks on your template.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenTemplateEditor(selectedTemplate)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Sliders className="h-4 w-4" /> Select / Draw Fields on Template
                  </button>
                </section>
              ) : (
                <>
                  {templateOnlyFields.length > 0 && (
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            Template Fields ({templateOnlyFields.length})
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Showing only the fields defined on {selectedTemplate.name}. Typing updates the matching field on the right immediately.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenTemplateEditor(selectedTemplate)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Sliders className="h-3.5 w-3.5" /> Edit Fields
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {templateOnlyFields.map((fld) => {
                          const val = getTemplateFieldValue(fld.field_key);
                          const labelText = fld.label || fld.field_key.replace(/_/g, ' ');
                          return (
                            <div
                              key={fld.id}
                              className={fld.multiline ? 'sm:col-span-2' : ''}
                            >
                              <label className="text-xs font-medium text-slate-700">
                                {labelText}
                              </label>
                              {fld.multiline ? (
                                <textarea
                                  rows={2}
                                  value={val}
                                  onFocus={() => setActiveFieldKey(fld.field_key)}
                                  onBlur={() => setActiveFieldKey(null)}
                                  onChange={(e) =>
                                    setTemplateFieldValue(fld.field_key, e.target.value)
                                  }
                                  placeholder={`Enter ${labelText}`}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                                />
                              ) : fld.field_key === 'invoice_date' || fld.field_key === 'due_date' ? (
                                <input
                                  type="date"
                                  value={val}
                                  onFocus={() => setActiveFieldKey(fld.field_key)}
                                  onBlur={() => setActiveFieldKey(null)}
                                  onChange={(e) =>
                                    setTemplateFieldValue(fld.field_key, e.target.value)
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={val}
                                  onFocus={() => setActiveFieldKey(fld.field_key)}
                                  onBlur={() => setActiveFieldKey(null)}
                                  onChange={(e) =>
                                    setTemplateFieldValue(fld.field_key, e.target.value)
                                  }
                                  placeholder={`Enter ${labelText}`}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {selectedTemplate.field_mappings.items_table.enabled && (
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Product / Service Table
                        </h3>
                        <button
                          type="button"
                          onClick={addItemRow}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Row
                        </button>
                      </div>
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-slate-600">GST Mode</label>
                          <select
                            value={form.tax_mode}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, tax_mode: e.target.value as TaxMode }))
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          >
                            <option value="cgst_sgst">CGST + SGST</option>
                            <option value="igst">IGST</option>
                            <option value="exempt">GST Exempt (0%)</option>
                            <option value="non_taxable">Non-Taxable (0%)</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {calc.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-600">Row #{it.sl_no}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-indigo-700">
                                  Total: {fmt(it.total_amount)}
                                </span>
                                {form.items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeItemRow(idx)}
                                    className="rounded p-1 text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                              <input
                                value={form.items[idx].description}
                                onChange={(e) => updateItem(idx, { description: e.target.value })}
                                placeholder="Description"
                                className="col-span-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={form.items[idx].quantity}
                                onChange={(e) =>
                                  updateItem(idx, { quantity: Number(e.target.value) })
                                }
                                placeholder="Qty"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.items[idx].rate}
                                onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })}
                                placeholder="Rate"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="100"
                                value={form.items[idx].gst_percent}
                                onChange={(e) =>
                                  updateItem(idx, { gst_percent: Number(e.target.value) })
                                }
                                placeholder="GST %"
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          ) : selectedTemplate && selectedTemplate.mode === 'docx' ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  DOCX Template Fields ({docxOnlyFields.length})
                </h3>
                {docxOnlyFields.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No single-value placeholders detected in this DOCX template.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {docxOnlyFields.map((ph) => {
                      const val = getTemplateFieldValue(ph);
                      const labelText = ph.replace(/_/g, ' ');
                      const isAddr = ph.toLowerCase().includes('address');
                      return (
                        <div key={ph} className={isAddr ? 'sm:col-span-2' : ''}>
                          <label className="text-xs font-medium capitalize text-slate-700">
                            {labelText}
                          </label>
                          {isAddr ? (
                            <textarea
                              rows={2}
                              value={val}
                              onChange={(e) => setTemplateFieldValue(ph, e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            />
                          ) : (
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setTemplateFieldValue(ph, e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              {docxHasItemRow && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Product / Service Rows</h3>
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Row
                    </button>
                  </div>
                  <div className="space-y-2">
                    {calc.items.map((it, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-6">
                        <input
                          value={form.items[idx].description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Description"
                          className="col-span-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          value={form.items[idx].quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          placeholder="Qty"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          value={form.items[idx].rate}
                          onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })}
                          placeholder="Rate"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          value={form.items[idx].gst_percent}
                          onChange={(e) => updateItem(idx, { gst_percent: Number(e.target.value) })}
                          placeholder="GST%"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <div className="flex items-center justify-between text-xs font-semibold text-indigo-700">
                          <span>{fmt(it.total_amount)}</span>
                          {form.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
          {/* 1. Standard A4 Fallback: Invoice Details */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Invoice Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-600">Invoice Number *</label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={form.invoice_number}
                    onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    title="Suggest next invoice number"
                    onClick={() =>
                      api
                        .getNextInvoiceNumber()
                        .then((r) => setForm((p) => ({ ...p, invoice_number: r.invoice_number })))
                    }
                    className="rounded-lg border border-slate-300 px-2.5 text-slate-600 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Invoice Date *</label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_date: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Due Date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Place of Supply</label>
                <input
                  value={form.place_of_supply}
                  onChange={(e) => setForm((p) => ({ ...p, place_of_supply: e.target.value }))}
                  placeholder="e.g. Telangana (36)"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Payment Terms</label>
                <input
                  value={form.payment_terms}
                  onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                  placeholder="Due on Receipt"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Purchase Order No.</label>
                <input
                  value={form.po_number}
                  onChange={(e) => setForm((p) => ({ ...p, po_number: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </section>

          {/* 2. Customer Details */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Customer Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Customer Name *</label>
                <input
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                  placeholder="Enter customer / company name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Customer Phone</label>
                <input
                  value={form.customer_phone}
                  onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Customer Email</label>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm((p) => ({ ...p, customer_email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Customer GSTIN</label>
                <input
                  value={form.customer_gstin}
                  onChange={(e) => setForm((p) => ({ ...p, customer_gstin: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600">Billing Address</label>
                <textarea
                  rows={2}
                  value={form.billing_address}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((p) => ({
                      ...p,
                      billing_address: v,
                      shipping_address: sameAsBilling ? v : p.shipping_address,
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Shipping Address</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={sameAsBilling}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameAsBilling(checked);
                        if (checked) {
                          setForm((p) => ({ ...p, shipping_address: p.billing_address }));
                        }
                      }}
                    />
                    Same as Billing Address
                  </label>
                </div>
                {!sameAsBilling && (
                  <textarea
                    rows={2}
                    value={form.shipping_address}
                    onChange={(e) => setForm((p) => ({ ...p, shipping_address: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                )}
              </div>
            </div>
          </section>

          {/* 3. Product / Service Items */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Product / Service Details</h3>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            </div>

            <div className="space-y-3">
              {calc.items.map((it, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Item #{it.sl_no}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500">
                        Taxable: <strong className="text-slate-800">{fmt(it.taxable_amount)}</strong>
                      </span>
                      <span className="text-slate-500">
                        Total: <strong className="text-indigo-700">{fmt(it.total_amount)}</strong>
                      </span>
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-medium text-slate-500">Description *</label>
                      <input
                        value={form.items[idx].description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Product or service name / details"
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-slate-500">HSN / SAC</label>
                      <input
                        value={form.items[idx].hsn_sac}
                        onChange={(e) => updateItem(idx, { hsn_sac: e.target.value })}
                        placeholder="e.g. 871190"
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-500">Qty</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={form.items[idx].quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500">Unit</label>
                      <input
                        value={form.items[idx].unit}
                        onChange={(e) => updateItem(idx, { unit: e.target.value })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500">Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.items[idx].rate}
                        onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-medium text-slate-500">Discount</label>
                      <div className="mt-0.5 flex">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.items[idx].discount}
                          onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })}
                          className="w-full rounded-l border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                        <select
                          value={form.items[idx].discount_type}
                          onChange={(e) =>
                            updateItem(idx, { discount_type: e.target.value as DiscountType })
                          }
                          className="rounded-r border border-l-0 border-slate-300 bg-slate-100 px-1.5 py-1 text-xs"
                        >
                          <option value="amount">₹</option>
                          <option value="percent">%</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500">GST %</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        disabled={form.tax_mode === 'exempt' || form.tax_mode === 'non_taxable'}
                        value={
                          form.tax_mode === 'exempt' || form.tax_mode === 'non_taxable'
                            ? 0
                            : form.items[idx].gst_percent
                        }
                        onChange={(e) => updateItem(idx, { gst_percent: Number(e.target.value) })}
                        className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Tax & Payment Summary */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Tax & Payment Summary</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-slate-600">GST Transaction Type</label>
                <select
                  value={form.tax_mode}
                  onChange={(e) => setForm((p) => ({ ...p, tax_mode: e.target.value as TaxMode }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                >
                  <option value="cgst_sgst">CGST + SGST (Intra-State)</option>
                  <option value="igst">IGST (Inter-State)</option>
                  <option value="exempt">GST Exempt (0%)</option>
                  <option value="non_taxable">Non-Taxable (0%)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Extra Invoice Discount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.invoice_discount}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, invoice_discount: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.auto_round_off}
                    onChange={(e) => setForm((p) => ({ ...p, auto_round_off: e.target.checked }))}
                  />
                  Auto Round Off Grand Total
                </label>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Subtotal:</span>{' '}
                <strong className="text-slate-900">{fmt(calc.subtotal)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Discount:</span>{' '}
                <strong className="text-slate-900">{fmt(calc.discount_total)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Taxable:</span>{' '}
                <strong className="text-slate-900">{fmt(calc.taxable_total)}</strong>
              </div>
              {form.tax_mode === 'cgst_sgst' && (
                <>
                  <div>
                    <span className="text-slate-500">CGST:</span>{' '}
                    <strong className="text-slate-900">{fmt(calc.cgst_total)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">SGST:</span>{' '}
                    <strong className="text-slate-900">{fmt(calc.sgst_total)}</strong>
                  </div>
                </>
              )}
              {form.tax_mode === 'igst' && (
                <div>
                  <span className="text-slate-500">IGST:</span>{' '}
                  <strong className="text-slate-900">{fmt(calc.igst_total)}</strong>
                </div>
              )}
              <div>
                <span className="text-slate-500">Round Off:</span>{' '}
                <strong className="text-slate-900">{fmt(calc.round_off)}</strong>
              </div>
              <div className="col-span-2 text-sm">
                <span className="text-slate-600">Grand Total:</span>{' '}
                <strong className="text-indigo-700">₹ {fmt(calc.grand_total)}</strong>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Amount in Words</label>
                  {form.amount_in_words_manual && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          amount_in_words_manual: false,
                          amount_in_words: '',
                        }))
                      }
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      Reset to Auto
                    </button>
                  )}
                </div>
                <input
                  value={
                    form.amount_in_words_manual ? form.amount_in_words : calc.amount_in_words
                  }
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      amount_in_words_manual: true,
                      amount_in_words: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">UPI ID</label>
                  <input
                    value={form.upi_id}
                    onChange={(e) => setForm((p) => ({ ...p, upi_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Payment Instructions</label>
                  <input
                    value={form.payment_instructions}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, payment_instructions: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Bank Account Details</label>
                  <textarea
                    rows={2}
                    value={form.bank_account_details}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, bank_account_details: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 5. Custom Template Fields (Auto-detected from mapped fields / DOCX) */}
          {customKeys.length > 0 && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-indigo-950">
                Additional Template Fields
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {customKeys.map((ck) => (
                  <div key={ck.key}>
                    <label className="text-xs font-medium capitalize text-slate-700">
                      {ck.label}
                    </label>
                    <input
                      value={form.extra_fields[ck.key] || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          extra_fields: { ...p.extra_fields, [ck.key]: e.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6. Company Details (Collapsible) */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowCompany((s) => !s)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">Company Details (Pre-filled)</h3>
                <p className="text-xs text-slate-500">
                  {form.company_details.company_name || 'Configure defaults in Settings'}
                </p>
              </div>
              {showCompany ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {showCompany && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">Company Name</label>
                  <input
                    value={form.company_details.company_name}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, company_name: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">GSTIN</label>
                  <input
                    value={form.company_details.gstin}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, gstin: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">PAN Number</label>
                  <input
                    value={form.company_details.pan_number}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, pan_number: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Phone</label>
                  <input
                    value={form.company_details.phone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, phone: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Email</label>
                  <input
                    value={form.company_details.email}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, email: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Website</label>
                  <input
                    value={form.company_details.website}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, website: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Company Address</label>
                  <textarea
                    rows={2}
                    value={form.company_details.company_address}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        company_details: { ...p.company_details, company_address: e.target.value },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}
          </section>
            </>
          )}
        </div>

        {/* Right: Live Preview */}
        <div className="xl:col-span-6">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-slate-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Live Invoice Preview {selectedTemplate ? `— ${selectedTemplate.name}` : ''}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                Instant Sync
              </span>
            </div>
            <div className="max-h-[calc(100vh-11rem)] overflow-y-auto pr-1">
              <LivePreview
                template={selectedTemplate}
                form={form}
                hasLogo={Boolean(settings.company_logo_path)}
                activeFieldKey={activeFieldKey}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Overwrite Confirmation Modal */}
      {confirmOverwriteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
              <div>
                <h4 className="text-base font-bold text-slate-900">Overwrite Existing Invoice PDF?</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Invoice <strong>{form.invoice_number}</strong> already has a generated PDF on disk.
                  Regenerating will replace the old PDF file. Do you want to continue?
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOverwriteOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmOverwriteOpen(false);
                  executeSave(pendingAction, true);
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Yes, Overwrite PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
