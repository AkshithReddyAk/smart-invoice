from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    version = Column(String(64), primary_key=True)
    applied_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class UserCredential(Base):
    __tablename__ = "user_credentials"

    phone = Column(String(32), primary_key=True)
    password = Column(String(255), nullable=False)
    role = Column(String(128), default="Authorized Staff", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String(255), default="", nullable=False)
    company_logo_path = Column(String(512), default="", nullable=False)
    company_address = Column(Text, default="", nullable=False)
    gstin = Column(String(64), default="", nullable=False)
    pan_number = Column(String(32), default="", nullable=False)
    phone = Column(String(64), default="", nullable=False)
    email = Column(String(255), default="", nullable=False)
    website = Column(String(255), default="", nullable=False)
    default_place_of_supply = Column(String(255), default="", nullable=False)
    default_payment_terms = Column(String(255), default="Due on Receipt", nullable=False)
    default_payment_instructions = Column(Text, default="", nullable=False)
    bank_account_details = Column(Text, default="", nullable=False)
    upi_id = Column(String(255), default="", nullable=False)
    invoice_prefix = Column(String(32), default="INV-", nullable=False)
    next_invoice_seq = Column(Integer, default=1, nullable=False)
    default_paper_size = Column(String(32), default="A4", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class InvoiceTemplate(Base):
    __tablename__ = "invoice_templates"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    file_type = Column(String(16), nullable=False)  # pdf, docx, png, jpg
    mode = Column(String(32), nullable=False)  # background | docx
    original_filename = Column(String(512), nullable=False)
    file_path = Column(String(512), nullable=False)
    preview_images_json = Column(Text, default="[]", nullable=False)
    page_width_pt = Column(Float, default=595.28, nullable=False)
    page_height_pt = Column(Float, default=841.89, nullable=False)
    page_count = Column(Integer, default=1, nullable=False)
    field_mappings_json = Column(Text, default="{}", nullable=False)
    docx_placeholders_json = Column(Text, default="[]", nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    invoices = relationship("Invoice", back_populates="template")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(64), primary_key=True)
    invoice_number = Column(String(128), unique=True, index=True, nullable=False)
    template_id = Column(String(64), ForeignKey("invoice_templates.id", ondelete="SET NULL"), nullable=True)
    template_name_snapshot = Column(String(255), default="", nullable=False)
    invoice_date = Column(String(32), index=True, nullable=False)
    due_date = Column(String(32), default="", nullable=False)
    place_of_supply = Column(String(255), default="", nullable=False)
    payment_terms = Column(String(255), default="", nullable=False)
    po_number = Column(String(128), default="", nullable=False)

    customer_name = Column(String(255), index=True, nullable=False)
    billing_address = Column(Text, default="", nullable=False)
    shipping_address = Column(Text, default="", nullable=False)
    customer_gstin = Column(String(64), default="", nullable=False)
    customer_phone = Column(String(64), default="", nullable=False)
    customer_email = Column(String(255), default="", nullable=False)

    company_snapshot_json = Column(Text, default="{}", nullable=False)
    tax_mode = Column(String(32), default="cgst_sgst", nullable=False)  # cgst_sgst, igst, exempt, non_taxable
    auto_round_off = Column(Boolean, default=True, nullable=False)
    invoice_discount = Column(Float, default=0.0, nullable=False)

    subtotal = Column(Float, default=0.0, nullable=False)
    discount_total = Column(Float, default=0.0, nullable=False)
    taxable_total = Column(Float, default=0.0, nullable=False)
    cgst_total = Column(Float, default=0.0, nullable=False)
    sgst_total = Column(Float, default=0.0, nullable=False)
    igst_total = Column(Float, default=0.0, nullable=False)
    round_off = Column(Float, default=0.0, nullable=False)
    grand_total = Column(Float, default=0.0, nullable=False)
    amount_in_words = Column(Text, default="", nullable=False)

    payment_instructions = Column(Text, default="", nullable=False)
    bank_account_details = Column(Text, default="", nullable=False)
    upi_id = Column(String(255), default="", nullable=False)
    extra_fields_json = Column(Text, default="{}", nullable=False)
    paper_size = Column(String(32), default="A4", nullable=False)

    pdf_path = Column(String(512), default="", nullable=False)
    docx_path = Column(String(512), default="", nullable=False)
    status = Column(String(32), default="generated", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    template = relationship("InvoiceTemplate", back_populates="invoices")
    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.sl_no",
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(String(64), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    sl_no = Column(Integer, nullable=False)
    description = Column(Text, nullable=False)
    hsn_sac = Column(String(64), default="", nullable=False)
    quantity = Column(Float, default=1.0, nullable=False)
    unit = Column(String(32), default="Nos", nullable=False)
    rate = Column(Float, default=0.0, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    discount_type = Column(String(16), default="amount", nullable=False)  # amount | percent
    gst_percent = Column(Float, default=0.0, nullable=False)
    taxable_amount = Column(Float, default=0.0, nullable=False)
    gst_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)

    invoice = relationship("Invoice", back_populates="items")
