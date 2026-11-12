export type TaxMode = 'cgst_sgst' | 'igst' | 'exempt' | 'non_taxable';
export type DiscountType = 'amount' | 'percent';
export type PaperSize = 'A4' | 'TEMPLATE';

export interface FieldOverlay {
  id: string;
  field_key: string;
  label: string;
  kind: 'text' | 'image';
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  font_size: number;
  font_weight: 'normal' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
  multiline: boolean;
  bg_color: string;
}

export interface EraseMask {
  id: string;
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  color: string;
}

export interface TableColumnMapping {
  id: string;
  key: string;
  label: string;
  x_pct: number;
  w_pct: number;
  align: 'left' | 'center' | 'right';
}

export interface ItemsTableConfig {
  enabled: boolean;
  page: number;
  y_start_pct: number;
  y_end_pct: number;
  row_height_pct: number;
  font_size: number;
  font_weight: 'normal' | 'bold';
  color: string;
  bg_color: string;
  show_grid_lines: boolean;
  columns: TableColumnMapping[];
}

export interface TemplateMappings {
  fields: FieldOverlay[];
  masks: EraseMask[];
  items_table: ItemsTableConfig;
}

export interface PreviewPageInfo {
  page: number;
  filename: string;
  width_pt: number;
  height_pt: number;
  width_px: number;
  height_px: number;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  file_type: 'pdf' | 'docx' | 'png' | 'jpg';
  mode: 'background' | 'docx';
  original_filename: string;
  preview_images: PreviewPageInfo[];
  page_width_pt: number;
  page_height_pt: number;
  page_count: number;
  field_mappings: TemplateMappings;
  docx_placeholders: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyDetails {
  company_name: string;
  company_logo_path: string;
  company_address: string;
  gstin: string;
  pan_number: string;
  phone: string;
  email: string;
  website: string;
}

export interface AppSettings extends CompanyDetails {
  id: number;
  default_place_of_supply: string;
  default_payment_terms: string;
  default_payment_instructions: string;
  bank_account_details: string;
  upi_id: string;
  invoice_prefix: string;
  next_invoice_seq: number;
  default_paper_size: PaperSize;
  updated_at: string;
}

export interface InvoiceItem {
  sl_no: number;
  description: string;
  hsn_sac: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  discount_type: DiscountType;
  gst_percent: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
}

export interface InvoiceFormState {
  id?: string;
  template_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  place_of_supply: string;
  payment_terms: string;
  po_number: string;
  customer_name: string;
  billing_address: string;
  shipping_address: string;
  customer_gstin: string;
  customer_phone: string;
  customer_email: string;
  company_details: CompanyDetails;
  tax_mode: TaxMode;
  auto_round_off: boolean;
  invoice_discount: number;
  amount_in_words: string;
  amount_in_words_manual: boolean;
  payment_instructions: string;
  bank_account_details: string;
  upi_id: string;
  extra_fields: Record<string, string>;
  paper_size: PaperSize;
  items: InvoiceItem[];
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  template_id: string | null;
  template_name_snapshot: string;
  invoice_date: string;
  due_date: string;
  place_of_supply: string;
  payment_terms: string;
  po_number: string;
  customer_name: string;
  billing_address: string;
  shipping_address: string;
  customer_gstin: string;
  customer_phone: string;
  customer_email: string;
  company_details: CompanyDetails;
  tax_mode: TaxMode;
  auto_round_off: boolean;
  invoice_discount: number;
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  round_off: number;
  grand_total: number;
  amount_in_words: string;
  payment_instructions: string;
  bank_account_details: string;
  upi_id: string;
  extra_fields: Record<string, string>;
  paper_size: PaperSize;
  has_pdf: boolean;
  has_docx: boolean;
  status: string;
  items: InvoiceItem[];
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_invoices: number;
  total_invoice_value: number;
  saved_templates: number;
  recent_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    invoice_date: string;
    grand_total: number;
    template_name_snapshot: string;
    created_at: string;
  }>;
}

export type NavSection =
  | 'dashboard'
  | 'templates'
  | 'create'
  | 'generated'
  | 'history'
  | 'settings';
