import type { InvoiceFormState, InvoiceItem, TaxMode } from '../types';

const ONES = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
}

function threeDigits(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n > 0) parts.push(twoDigits(n));
  return parts.join(' ');
}

function intToIndianWords(n: number): string {
  if (n === 0) return 'ZERO';
  if (n < 0) return `MINUS ${intToIndianWords(-n)}`;
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  if (crore) parts.push(`${intToIndianWords(crore)} CRORE`);
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH`);
  const thousand = Math.floor(n / 1_000);
  n %= 1_000;
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ').trim();
}

export function amountToIndianWords(amount: number): string {
  const rounded = Math.round(Math.max(0, amount) * 100) / 100;
  let rupees = Math.floor(rounded);
  let paise = Math.round((rounded - rupees) * 100);
  if (paise === 100) {
    rupees += 1;
    paise = 0;
  }
  const rWords = `${intToIndianWords(rupees)} RUPEES`;
  return paise > 0 ? `${rWords} AND ${twoDigits(paise)} PAISE ONLY` : `${rWords} ONLY`;
}

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export interface CalculatedTotals {
  items: InvoiceItem[];
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  round_off: number;
  grand_total: number;
  amount_in_words: string;
}

export function calculateInvoice(
  items: InvoiceItem[],
  taxMode: TaxMode,
  autoRoundOff: boolean,
  invoiceDiscount: number
): CalculatedTotals {
  const isTaxable = taxMode === 'cgst_sgst' || taxMode === 'igst';
  let subtotal = 0;
  let rowDiscTotal = 0;
  let taxableBeforeInvDisc = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  const computedItems = items.map((it, idx) => {
    const qty = Math.max(0, Number(it.quantity) || 0);
    const rate = Math.max(0, Number(it.rate) || 0);
    const disc = Math.max(0, Number(it.discount) || 0);
    const gross = round2(qty * rate);
    const discAmt =
      it.discount_type === 'percent' ? round2(gross * (Math.min(100, disc) / 100)) : round2(Math.min(gross, disc));
    const taxable = round2(Math.max(0, gross - discAmt));
    const effGst = isTaxable ? Math.min(100, Math.max(0, Number(it.gst_percent) || 0)) : 0;
    const gstAmt = round2(taxable * (effGst / 100));
    const total = round2(taxable + gstAmt);

    subtotal += gross;
    rowDiscTotal += discAmt;
    taxableBeforeInvDisc += taxable;

    if (taxMode === 'cgst_sgst') {
      const half = round2(gstAmt / 2);
      cgst += half;
      sgst += round2(gstAmt - half);
    } else if (taxMode === 'igst') {
      igst += gstAmt;
    }

    return {
      ...it,
      sl_no: idx + 1,
      gst_percent: effGst,
      taxable_amount: taxable,
      gst_amount: gstAmt,
      total_amount: total,
    };
  });

  const invDisc = round2(Math.min(taxableBeforeInvDisc, Math.max(0, Number(invoiceDiscount) || 0)));
  if (invDisc > 0 && taxableBeforeInvDisc > 0) {
    const ratio = (taxableBeforeInvDisc - invDisc) / taxableBeforeInvDisc;
    cgst = round2(cgst * ratio);
    sgst = round2(sgst * ratio);
    igst = round2(igst * ratio);
  }

  subtotal = round2(subtotal);
  const discount_total = round2(rowDiscTotal + invDisc);
  const taxable_total = round2(Math.max(0, taxableBeforeInvDisc - invDisc));
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  const rawTotal = round2(taxable_total + cgst + sgst + igst);
  const round_off = autoRoundOff ? round2(Math.round(rawTotal) - rawTotal) : 0;
  const grand_total = round2(rawTotal + round_off);

  return {
    items: computedItems,
    subtotal,
    discount_total,
    taxable_total,
    cgst_total: cgst,
    sgst_total: sgst,
    igst_total: igst,
    round_off,
    grand_total,
    amount_in_words: amountToIndianWords(grand_total),
  };
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (dmy) return trimmed;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return trimmed;
}

export function buildPreviewValueMap(form: InvoiceFormState, calc: CalculatedTotals): Record<string, string> {
  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const c = form.company_details;
  const words = form.amount_in_words_manual && form.amount_in_words.trim()
    ? form.amount_in_words
    : calc.amount_in_words;

  const formattedDate = formatDisplayDate(form.invoice_date);

  return {
    company_name: c.company_name || '',
    company_address: c.company_address || '',
    company_gstin: c.gstin || '',
    gstin: c.gstin || '',
    company_pan: c.pan_number || '',
    pan_number: c.pan_number || '',
    company_phone: c.phone || '',
    company_email: c.email || '',
    company_website: c.website || '',
    invoice_number: form.invoice_number || '',
    invoice_no: form.invoice_number || '',
    invoice_date: formattedDate,
    date: formattedDate,
    display_date: formattedDate,
    due_date: formatDisplayDate(form.due_date),
    place_of_supply: form.place_of_supply || '',
    payment_terms: form.payment_terms || '',
    po_number: form.po_number || '',
    customer_name: form.customer_name || '',
    bill_to: form.customer_name || '',
    ship_to: form.customer_name || '',
    billing_address: form.billing_address || '',
    shipping_address: form.shipping_address || form.billing_address || '',
    customer_gstin: form.customer_gstin || '',
    customer_phone: form.customer_phone || '',
    customer_email: form.customer_email || '',
    subtotal: fmt(calc.subtotal),
    discount_total: fmt(calc.discount_total),
    discount: fmt(calc.discount_total),
    taxable_total: fmt(calc.taxable_total),
    taxable: fmt(calc.taxable_total),
    cgst_total: fmt(calc.cgst_total),
    cgst: fmt(calc.cgst_total),
    sgst_total: fmt(calc.sgst_total),
    sgst: fmt(calc.sgst_total),
    igst_total: fmt(calc.igst_total),
    igst: fmt(calc.igst_total),
    round_off: fmt(calc.round_off),
    grand_total: fmt(calc.grand_total),
    total: fmt(calc.grand_total),
    amount_in_words: words,
    payment_instructions: form.payment_instructions || '',
    bank_account_details: form.bank_account_details || '',
    upi_id: form.upi_id || '',
    ...form.extra_fields,
  };
}

export const FIELD_PALETTE: Array<{
  key: string;
  label: string;
  group: string;
  kind?: 'text' | 'image';
  defaultW?: number;
  defaultH?: number;
  multiline?: boolean;
}> = [
  // Invoice
  { key: 'invoice_number', label: 'Invoice Number', group: 'Invoice', defaultW: 20, defaultH: 2.8 },
  { key: 'invoice_date', label: 'Invoice Date', group: 'Invoice', defaultW: 16, defaultH: 2.8 },
  { key: 'due_date', label: 'Due Date', group: 'Invoice', defaultW: 16, defaultH: 2.8 },
  { key: 'place_of_supply', label: 'Place of Supply', group: 'Invoice', defaultW: 22, defaultH: 2.8 },
  { key: 'payment_terms', label: 'Payment Terms', group: 'Invoice', defaultW: 22, defaultH: 2.8 },
  { key: 'po_number', label: 'PO Number', group: 'Invoice', defaultW: 18, defaultH: 2.8 },
  // Customer
  { key: 'customer_name', label: 'Customer Name', group: 'Customer', defaultW: 24, defaultH: 3.0 },
  { key: 'billing_address', label: 'Billing Address', group: 'Customer', defaultW: 26, defaultH: 7.5, multiline: true },
  { key: 'shipping_address', label: 'Shipping Address', group: 'Customer', defaultW: 26, defaultH: 7.5, multiline: true },
  { key: 'customer_gstin', label: 'Customer GSTIN', group: 'Customer', defaultW: 20, defaultH: 2.8 },
  { key: 'customer_phone', label: 'Customer Phone', group: 'Customer', defaultW: 18, defaultH: 2.8 },
  { key: 'customer_email', label: 'Customer Email', group: 'Customer', defaultW: 24, defaultH: 3.0, multiline: true },
  // Company
  { key: 'company_name', label: 'Company Name', group: 'Company', defaultW: 28, defaultH: 3.2 },
  { key: 'company_logo', label: 'Company Logo', group: 'Company', kind: 'image', defaultW: 18, defaultH: 8.0 },
  { key: 'company_address', label: 'Company Address', group: 'Company', defaultW: 28, defaultH: 6.5, multiline: true },
  { key: 'company_gstin', label: 'Company GSTIN', group: 'Company', defaultW: 20, defaultH: 2.8 },
  { key: 'company_pan', label: 'Company PAN', group: 'Company', defaultW: 18, defaultH: 2.8 },
  { key: 'company_phone', label: 'Company Phone', group: 'Company', defaultW: 18, defaultH: 2.8 },
  { key: 'company_email', label: 'Company Email', group: 'Company', defaultW: 22, defaultH: 2.8 },
  { key: 'company_website', label: 'Company Website', group: 'Company', defaultW: 22, defaultH: 2.8 },
  // Totals & Payment
  { key: 'subtotal', label: 'Subtotal', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'discount_total', label: 'Discount', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'taxable_total', label: 'Taxable Value', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'cgst_total', label: 'CGST', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'sgst_total', label: 'SGST', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'igst_total', label: 'IGST', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'round_off', label: 'Round Off', group: 'Summary', defaultW: 16, defaultH: 2.6 },
  { key: 'grand_total', label: 'Grand Total', group: 'Summary', defaultW: 18, defaultH: 3.0 },
  { key: 'amount_in_words', label: 'Amount in Words', group: 'Summary', defaultW: 42, defaultH: 4.5, multiline: true },
  { key: 'payment_instructions', label: 'Payment Instructions', group: 'Payment', defaultW: 40, defaultH: 5.0, multiline: true },
  { key: 'bank_account_details', label: 'Bank Details', group: 'Payment', defaultW: 32, defaultH: 6.0, multiline: true },
  { key: 'upi_id', label: 'UPI ID', group: 'Payment', defaultW: 22, defaultH: 2.8 },
];

export const ITEM_COLUMN_KEYS = [
  { key: 'sl_no', label: 'Sl. No.', defaultW: 5, align: 'center' as const },
  { key: 'description', label: 'Description', defaultW: 26, align: 'left' as const },
  { key: 'hsn_sac', label: 'HSN/SAC', defaultW: 9, align: 'center' as const },
  { key: 'quantity', label: 'Qty', defaultW: 6, align: 'center' as const },
  { key: 'unit', label: 'Unit', defaultW: 6, align: 'center' as const },
  { key: 'rate', label: 'Rate', defaultW: 10, align: 'right' as const },
  { key: 'discount', label: 'Discount', defaultW: 8, align: 'right' as const },
  { key: 'gst_percent', label: 'GST %', defaultW: 7, align: 'center' as const },
  { key: 'taxable_amount', label: 'Taxable', defaultW: 11, align: 'right' as const },
  { key: 'total_amount', label: 'Total', defaultW: 12, align: 'right' as const },
];
