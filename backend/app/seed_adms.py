from pathlib import Path

from app.database import SessionLocal
from app.models import CompanySettings, InvoiceTemplate
from app.services.template_processor import process_template_file

DEFAULT_BLANK_PDF = Path(__file__).resolve().parent / "assets" / "adms_invoice_template.pdf"

HARDCODED_ADMS_FIELDS: list[dict] = [
    {"id": "fld_1794480860013_9xh1", "field_key": "date", "label": "date", "kind": "text", "page": 1, "x_pct": 74.9, "y_pct": 8.2, "w_pct": 9.21, "h_pct": 1.33, "font_size": 7.5, "font_weight": "bold", "color": "#111827", "align": "left", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481132245_5umd", "field_key": "bill_to", "label": "bill to", "kind": "text", "page": 1, "x_pct": 51.07, "y_pct": 11.72, "w_pct": 13.55, "h_pct": 2.45, "font_size": 7.5, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481163344_j2el", "field_key": "shipped_to", "label": "shipped to", "kind": "text", "page": 1, "x_pct": 74.22, "y_pct": 11.72, "w_pct": 13.65, "h_pct": 2.45, "font_size": 7.5, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481187009_obps", "field_key": "name", "label": "name", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 14.72, "w_pct": 13.55, "h_pct": 2.45, "font_size": 7.5, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481223745_ozcz", "field_key": "name", "label": "Name", "kind": "text", "page": 1, "x_pct": 74.22, "y_pct": 14.63, "w_pct": 13.65, "h_pct": 2.45, "font_size": 7.5, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481244244_a3by", "field_key": "contact_no", "label": "Contact NO", "kind": "text", "page": 1, "x_pct": 74.23, "y_pct": 17.5, "w_pct": 13.65, "h_pct": 1.7, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481258397_c1yw", "field_key": "contact_no", "label": "Contact NO", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 17.5, "w_pct": 13.55, "h_pct": 1.7, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481273999_t5x3", "field_key": "alternative_no", "label": "Alternative NO", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 19.57, "w_pct": 13.55, "h_pct": 1.7, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481281749_jq7d", "field_key": "alternative_no", "label": "Alternative NO", "kind": "text", "page": 1, "x_pct": 74.25, "y_pct": 19.55, "w_pct": 13.65, "h_pct": 1.7, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481329434_sgcp", "field_key": "mail_id", "label": "Mail ID", "kind": "text", "page": 1, "x_pct": 74.25, "y_pct": 21.55, "w_pct": 13.65, "h_pct": 2.25, "font_size": 7.0, "font_weight": "bold", "color": "#111827", "align": "left", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481334099_alda", "field_key": "mail_id", "label": "Mail ID", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 21.55, "w_pct": 13.55, "h_pct": 2.25, "font_size": 7.0, "font_weight": "bold", "color": "#111827", "align": "left", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481345767_jfp8", "field_key": "address", "label": "Address", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 24.25, "w_pct": 13.55, "h_pct": 8.6, "font_size": 7.0, "font_weight": "bold", "color": "#111827", "align": "left", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481354851_8ji4", "field_key": "address", "label": "Address", "kind": "text", "page": 1, "x_pct": 74.25, "y_pct": 24.25, "w_pct": 13.65, "h_pct": 8.6, "font_size": 7.0, "font_weight": "bold", "color": "#111827", "align": "left", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481366950_r4ve", "field_key": "gst_no", "label": "GST NO", "kind": "text", "page": 1, "x_pct": 51.05, "y_pct": 39.5, "w_pct": 13.55, "h_pct": 2.05, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481371900_49wu", "field_key": "gst_no", "label": "GST NO", "kind": "text", "page": 1, "x_pct": 74.25, "y_pct": 39.5, "w_pct": 13.65, "h_pct": 2.05, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481409566_k9uc", "field_key": "s_no", "label": "S. NO", "kind": "text", "page": 1, "x_pct": 9.72, "y_pct": 52.65, "w_pct": 4.39, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481429416_es03", "field_key": "material_model", "label": "Material model", "kind": "text", "page": 1, "x_pct": 14.54, "y_pct": 52.65, "w_pct": 8.42, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481471016_n3yp", "field_key": "colour", "label": "colour", "kind": "text", "page": 1, "x_pct": 23.4, "y_pct": 52.65, "w_pct": 14.54, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": True, "bg_color": ""},
    {"id": "fld_1794481511799_wsej", "field_key": "offer_distance", "label": "Offer/distance", "kind": "text", "page": 1, "x_pct": 38.37, "y_pct": 52.65, "w_pct": 12.17, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481550033_p5pe", "field_key": "gst_5_", "label": "gst 5%", "kind": "text", "page": 1, "x_pct": 50.97, "y_pct": 52.65, "w_pct": 5.18, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481572983_1lc5", "field_key": "ex_showroom_price", "label": "ex showroom price", "kind": "text", "page": 1, "x_pct": 56.59, "y_pct": 52.65, "w_pct": 8.06, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481602733_eu3f", "field_key": "down_payment", "label": "Down payment", "kind": "text", "page": 1, "x_pct": 65.08, "y_pct": 52.65, "w_pct": 8.64, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481620599_nkb7", "field_key": "balance_amount", "label": "Balance amount", "kind": "text", "page": 1, "x_pct": 74.15, "y_pct": 52.65, "w_pct": 5.47, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481652247_af3g", "field_key": "customer_purchase_order_id_no", "label": "Customer purchase order id no", "kind": "text", "page": 1, "x_pct": 80.06, "y_pct": 52.65, "w_pct": 7.92, "h_pct": 2.6, "font_size": 8.0, "font_weight": "bold", "color": "#111827", "align": "center", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481669283_m6wd", "field_key": "taxable", "label": "taxable", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 63.27, "w_pct": 22.65, "h_pct": 1.5, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481686599_hliv", "field_key": "discount", "label": "Discount", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 65.0, "w_pct": 22.65, "h_pct": 1.61, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481704183_6ag0", "field_key": "cgst_2_5_", "label": "cgst @ 2.5%", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 66.83, "w_pct": 22.65, "h_pct": 1.61, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481725549_zrcr", "field_key": "sgst_2_5_", "label": "sgst @ 2.5%", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 68.67, "w_pct": 22.65, "h_pct": 1.56, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481747231_qhbg", "field_key": "subsidy", "label": "subsidy", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 70.45, "w_pct": 22.65, "h_pct": 1.61, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
    {"id": "fld_1794481764932_pawl", "field_key": "total_value", "label": "Total Value", "kind": "text", "page": 1, "x_pct": 65.15, "y_pct": 72.29, "w_pct": 22.65, "h_pct": 1.56, "font_size": 8.0, "font_weight": "normal", "color": "#111827", "align": "right", "multiline": False, "bg_color": ""},
]


def build_adms_mappings() -> dict:
    return {
        "fields": HARDCODED_ADMS_FIELDS,
        "masks": [],
        "items_table": {
            "enabled": False,
            "page": 1,
            "y_start_pct": 52.5,
            "y_end_pct": 55.4,
            "row_height_pct": 2.9,
            "font_size": 8.0,
            "font_weight": "bold",
            "color": "#111827",
            "bg_color": "",
            "show_grid_lines": False,
            "columns": [],
        },
    }


def ensure_adms_default_template() -> None:
    if not DEFAULT_BLANK_PDF.exists():
        return
    db = SessionLocal()
    try:
        existing_count = db.query(InvoiceTemplate).count()
        if existing_count > 0:
            return

        tpl_id = "tpl_adms_default"
        data = DEFAULT_BLANK_PDF.read_bytes()
        mappings = build_adms_mappings()
        meta = process_template_file(
            tpl_id,
            "ADMS_eBikes_Tax_Invoice.pdf",
            data,
            preserve_mappings=mappings,
        )
        tpl = InvoiceTemplate(
            id=tpl_id,
            name="ADMS e Bikes Tax Invoice",
            is_default=True,
            **meta,
        )
        db.add(tpl)

        settings = db.query(CompanySettings).filter(CompanySettings.id == 1).first()
        if settings and settings.company_name == "My Company":
            settings.company_name = "SRI LAXMINARAYANA ENTERPRISES"
            settings.gstin = "36PAQPK1506Q1ZT"
            settings.pan_number = "PAQPK1506Q"
            settings.phone = "9908599043"
            settings.company_address = "SHUTTER NO 17-18, KARASGUTTI ROAD, NARAYANKHED, SANGAREDDY - 502286"
            settings.default_place_of_supply = "Telangana (36)"
            settings.invoice_prefix = "SA"

        db.commit()
    finally:
        db.close()
