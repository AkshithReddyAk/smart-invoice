from typing import Sequence
from app.schemas import InvoiceItemInput, TaxMode


_ONES = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
]
_TENS = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
]


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def _three_digits(n: int) -> str:
    parts = []
    if n >= 100:
        parts.append(f"{_ONES[n // 100]} HUNDRED")
        n %= 100
    if n > 0:
        parts.append(_two_digits(n))
    return " ".join(parts)


def integer_to_indian_words(n: int) -> str:
    if n == 0:
        return "ZERO"
    if n < 0:
        return f"MINUS {integer_to_indian_words(-n)}"

    parts: list[str] = []
    crore = n // 10_000_000
    n %= 10_000_000
    if crore:
        parts.append(f"{integer_to_indian_words(crore)} CRORE")

    lakh = n // 100_000
    n %= 100_000
    if lakh:
        parts.append(f"{_two_digits(lakh)} LAKH")

    thousand = n // 1_000
    n %= 1_000
    if thousand:
        parts.append(f"{_two_digits(thousand)} THOUSAND")

    if n:
        parts.append(_three_digits(n))

    return " ".join(parts).strip()


def amount_to_indian_words(amount: float) -> str:
    amount = round(max(0.0, float(amount)), 2)
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    if paise == 100:
        rupees += 1
        paise = 0

    rupees_words = f"{integer_to_indian_words(rupees)} RUPEES"
    if paise > 0:
        return f"{rupees_words} AND {_two_digits(paise)} PAISE ONLY"
    return f"{rupees_words} ONLY"


def calculate_invoice_totals(
    items: Sequence[InvoiceItemInput],
    tax_mode: TaxMode,
    auto_round_off: bool = True,
    invoice_discount: float = 0.0,
) -> dict:
    computed_items = []
    subtotal = 0.0
    row_discount_total = 0.0
    taxable_total_before_inv_disc = 0.0
    cgst_total = 0.0
    sgst_total = 0.0
    igst_total = 0.0

    is_tax_applicable = tax_mode in ("cgst_sgst", "igst")

    for idx, item in enumerate(items, start=1):
        gross = round(float(item.quantity) * float(item.rate), 2)
        if item.discount_type == "percent":
            disc_amt = round(gross * (float(item.discount) / 100.0), 2)
        else:
            disc_amt = round(min(gross, float(item.discount)), 2)

        taxable = round(max(0.0, gross - disc_amt), 2)
        eff_gst_pct = float(item.gst_percent) if is_tax_applicable else 0.0
        gst_amt = round(taxable * (eff_gst_pct / 100.0), 2)
        total_amt = round(taxable + gst_amt, 2)

        subtotal += gross
        row_discount_total += disc_amt
        taxable_total_before_inv_disc += taxable

        if tax_mode == "cgst_sgst":
            half = round(gst_amt / 2.0, 2)
            cgst_total += half
            sgst_total += round(gst_amt - half, 2)
        elif tax_mode == "igst":
            igst_total += gst_amt

        computed_items.append({
            "sl_no": item.sl_no or idx,
            "description": item.description.strip(),
            "hsn_sac": item.hsn_sac.strip(),
            "quantity": float(item.quantity),
            "unit": item.unit.strip() or "Nos",
            "rate": round(float(item.rate), 2),
            "discount": round(float(item.discount), 2),
            "discount_type": item.discount_type,
            "gst_percent": round(eff_gst_pct, 2),
            "taxable_amount": taxable,
            "gst_amount": gst_amt,
            "total_amount": total_amt,
        })

    inv_disc = round(min(taxable_total_before_inv_disc, max(0.0, float(invoice_discount))), 2)

    # Proportionally adjust GST if an invoice-level discount is applied
    if inv_disc > 0 and taxable_total_before_inv_disc > 0:
        ratio = (taxable_total_before_inv_disc - inv_disc) / taxable_total_before_inv_disc
        cgst_total = round(cgst_total * ratio, 2)
        sgst_total = round(sgst_total * ratio, 2)
        igst_total = round(igst_total * ratio, 2)

    subtotal = round(subtotal, 2)
    discount_total = round(row_discount_total + inv_disc, 2)
    taxable_total = round(max(0.0, taxable_total_before_inv_disc - inv_disc), 2)
    cgst_total = round(cgst_total, 2)
    sgst_total = round(sgst_total, 2)
    igst_total = round(igst_total, 2)

    raw_total = round(taxable_total + cgst_total + sgst_total + igst_total, 2)
    round_off = round(round(raw_total) - raw_total, 2) if auto_round_off else 0.0
    grand_total = round(raw_total + round_off, 2)

    return {
        "items": computed_items,
        "subtotal": subtotal,
        "discount_total": discount_total,
        "taxable_total": taxable_total,
        "cgst_total": cgst_total,
        "sgst_total": sgst_total,
        "igst_total": igst_total,
        "round_off": round_off,
        "grand_total": grand_total,
        "amount_in_words": amount_to_indian_words(grand_total),
    }
