from datetime import date, datetime
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


TaxMode = Literal["cgst_sgst", "igst", "exempt", "non_taxable"]
DiscountType = Literal["amount", "percent"]
PaperSize = Literal["A4", "TEMPLATE"]


class FieldOverlay(BaseModel):
    id: str
    field_key: str
    label: str = ""
    kind: Literal["text", "image"] = "text"
    page: int = Field(default=1, ge=1)
    x_pct: float = Field(ge=0.0, le=100.0)
    y_pct: float = Field(ge=0.0, le=100.0)
    w_pct: float = Field(gt=0.0, le=100.0)
    h_pct: float = Field(gt=0.0, le=100.0)
    font_size: float = Field(default=10.0, ge=4.0, le=72.0)
    font_weight: Literal["normal", "bold"] = "normal"
    color: str = "#111827"
    align: Literal["left", "center", "right"] = "left"
    multiline: bool = False
    bg_color: str = ""  # Optional mask background behind text (e.g. "#FFFFFF")


class EraseMask(BaseModel):
    id: str
    page: int = Field(default=1, ge=1)
    x_pct: float = Field(ge=0.0, le=100.0)
    y_pct: float = Field(ge=0.0, le=100.0)
    w_pct: float = Field(gt=0.0, le=100.0)
    h_pct: float = Field(gt=0.0, le=100.0)
    color: str = "#FFFFFF"


class TableColumnMapping(BaseModel):
    id: str
    key: str  # sl_no, description, hsn_sac, quantity, unit, rate, discount, gst_percent, taxable_amount, total_amount
    label: str = ""
    x_pct: float = Field(ge=0.0, le=100.0)
    w_pct: float = Field(gt=0.0, le=100.0)
    align: Literal["left", "center", "right"] = "left"


class ItemsTableConfig(BaseModel):
    enabled: bool = False
    page: int = Field(default=1, ge=1)
    y_start_pct: float = Field(default=48.0, ge=0.0, le=100.0)
    y_end_pct: float = Field(default=72.0, ge=0.0, le=100.0)
    row_height_pct: float = Field(default=3.2, ge=1.0, le=20.0)
    font_size: float = Field(default=9.0, ge=5.0, le=24.0)
    font_weight: Literal["normal", "bold"] = "normal"
    color: str = "#111827"
    bg_color: str = ""
    show_grid_lines: bool = False
    columns: list[TableColumnMapping] = Field(default_factory=list)


class TemplateMappings(BaseModel):
    fields: list[FieldOverlay] = Field(default_factory=list)
    masks: list[EraseMask] = Field(default_factory=list)
    items_table: ItemsTableConfig = Field(default_factory=ItemsTableConfig)


class CompanyDetailsPayload(BaseModel):
    company_name: str = ""
    company_logo_path: str = ""
    company_address: str = ""
    gstin: str = ""
    pan_number: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""


class SettingsUpdate(CompanyDetailsPayload):
    default_place_of_supply: str = ""
    default_payment_terms: str = "Due on Receipt"
    default_payment_instructions: str = ""
    bank_account_details: str = ""
    upi_id: str = ""
    invoice_prefix: str = "INV-"
    next_invoice_seq: int = Field(default=1, ge=1)
    default_paper_size: PaperSize = "A4"


class SettingsOut(SettingsUpdate):
    id: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplateUpdate(BaseModel):
    name: str | None = None
    field_mappings: TemplateMappings | None = None
    is_default: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Template name cannot be empty")
        return v


class TemplateOut(BaseModel):
    id: str
    name: str
    file_type: str
    mode: str
    original_filename: str
    preview_images: list[dict[str, Any]]
    page_width_pt: float
    page_height_pt: float
    page_count: int
    field_mappings: TemplateMappings
    docx_placeholders: list[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class InvoiceItemInput(BaseModel):
    sl_no: int | None = None
    description: str
    hsn_sac: str = ""
    quantity: float = Field(gt=0)
    unit: str = "Nos"
    rate: float = Field(ge=0)
    discount: float = Field(default=0.0, ge=0)
    discount_type: DiscountType = "amount"
    gst_percent: float = Field(default=0.0, ge=0, le=100)

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Product/service description cannot be empty")
        return cleaned

    @model_validator(mode="after")
    def validate_discount(self):
        if self.discount_type == "percent" and self.discount > 100:
            raise ValueError("Percentage discount cannot exceed 100%")
        return self


class InvoiceItemOut(BaseModel):
    sl_no: int
    description: str
    hsn_sac: str
    quantity: float
    unit: str
    rate: float
    discount: float
    discount_type: str
    gst_percent: float
    taxable_amount: float
    gst_amount: float
    total_amount: float


class InvoicePayload(BaseModel):
    template_id: str | None = None
    invoice_number: str
    invoice_date: str = ""
    due_date: str = ""
    place_of_supply: str = ""
    payment_terms: str = ""
    po_number: str = ""

    customer_name: str
    billing_address: str = ""
    shipping_address: str = ""
    customer_gstin: str = ""
    customer_phone: str = ""
    customer_email: str = ""

    company_details: CompanyDetailsPayload | None = None
    tax_mode: TaxMode = "cgst_sgst"
    auto_round_off: bool = True
    invoice_discount: float = Field(default=0.0, ge=0)
    amount_in_words: str | None = None
    payment_instructions: str = ""
    bank_account_details: str = ""
    upi_id: str = ""
    extra_fields: dict[str, str] = Field(default_factory=dict)
    paper_size: PaperSize = "A4"
    items: list[InvoiceItemInput] = Field(min_length=1)
    confirm_overwrite: bool = False

    @field_validator("invoice_number", "customer_name")
    @classmethod
    def not_blank(cls, v: str, info) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name.replace('_', ' ').title()} is required")
        return cleaned

    @field_validator("invoice_date")
    @classmethod
    def validate_invoice_date(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            return ""
        try:
            date.fromisoformat(s)
        except ValueError:
            raise ValueError("Invoice date must be a valid date in YYYY-MM-DD format")
        return s

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v: str) -> str:
        v = v.strip()
        if v:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("Due date must be a valid date in YYYY-MM-DD format")
        return v

    @model_validator(mode="after")
    def validate_dates_order(self):
        if self.due_date and self.invoice_date:
            inv_d = date.fromisoformat(self.invoice_date)
            due_d = date.fromisoformat(self.due_date)
            if due_d < inv_d:
                raise ValueError("Due date cannot be earlier than invoice date")
        return self


class InvoiceCalculationRequest(BaseModel):
    tax_mode: TaxMode = "cgst_sgst"
    auto_round_off: bool = True
    invoice_discount: float = Field(default=0.0, ge=0)
    items: list[InvoiceItemInput] = Field(default_factory=list)


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    template_id: str | None
    template_name_snapshot: str
    invoice_date: str
    due_date: str
    place_of_supply: str
    payment_terms: str
    po_number: str

    customer_name: str
    billing_address: str
    shipping_address: str
    customer_gstin: str
    customer_phone: str
    customer_email: str

    company_details: CompanyDetailsPayload
    tax_mode: str
    auto_round_off: bool
    invoice_discount: float

    subtotal: float
    discount_total: float
    taxable_total: float
    cgst_total: float
    sgst_total: float
    igst_total: float
    round_off: float
    grand_total: float
    amount_in_words: str

    payment_instructions: str
    bank_account_details: str
    upi_id: str
    extra_fields: dict[str, str]
    paper_size: str

    has_pdf: bool
    has_docx: bool
    status: str
    items: list[InvoiceItemOut]
    created_at: datetime
    updated_at: datetime
