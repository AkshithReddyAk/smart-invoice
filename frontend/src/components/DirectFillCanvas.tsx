import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { FieldOverlay, InvoiceFormState, InvoiceTemplate } from '../types';
import { amountToIndianWords, buildPreviewValueMap, calculateInvoice, round2 } from '../utils/calculator';

interface DirectFillCanvasProps {
  template: InvoiceTemplate;
  form: InvoiceFormState;
  setForm: React.Dispatch<React.SetStateAction<InvoiceFormState>>;
  mirrorShipTo: boolean;
  autoCalcGst5: boolean;
}

const STANDARD_BINDINGS = new Set([
  'invoice_number',
  'invoice_no',
  'invoice_date',
  'due_date',
  'place_of_supply',
  'payment_terms',
  'po_number',
  'customer_name',
  'bill_to',
  'billing_address',
  'shipping_address',
  'customer_gstin',
  'customer_phone',
  'customer_email',
  'payment_instructions',
  'bank_account_details',
  'upi_id',
]);

function parseNum(v: string): number {
  const cleaned = String(v || '').replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function fmtNum(n: number): string {
  if (!n) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function normalizeDisplayDateToIso(val: string): string | null {
  const s = val.trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  return null;
}

function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const DirectFillCanvas: React.FC<DirectFillCanvasProps> = ({
  template,
  form,
  setForm,
  mirrorShipTo,
  autoCalcGst5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(820);
  const [mobileZoom, setMobileZoom] = useState<'fit' | 'zoom'>('fit');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const calc = useMemo(
    () => calculateInvoice(form.items, form.tax_mode, form.auto_round_off, form.invoice_discount),
    [form.items, form.tax_mode, form.auto_round_off, form.invoice_discount]
  );

  const baseValues = useMemo(() => buildPreviewValueMap(form, calc), [form, calc]);

  const getFieldDisplayValue = (fld: FieldOverlay): string => {
    const k = fld.field_key;
    if (k in form.extra_fields) {
      return form.extra_fields[k];
    }
    if (k === 'display_date') {
      return isoToDmy(form.invoice_date);
    }
    if (STANDARD_BINDINGS.has(k)) {
      if (k === 'shipping_address') return form.shipping_address;
      return baseValues[k] ?? '';
    }
    // For unedited numeric summary fields, return empty until user fills an item/price
    if (
      ['taxable_total', 'discount_total', 'cgst_total', 'sgst_total', 'igst_total', 'grand_total', 'amount_in_words'].includes(k)
    ) {
      const hasAnyItemVal = form.items.some((it) => it.rate > 0 || it.description.trim() !== '');
      return hasAnyItemVal ? baseValues[k] ?? '' : '';
    }
    return baseValues[k] ?? '';
  };

  const handleFieldChange = (fld: FieldOverlay, rawVal: string) => {
    const k = fld.field_key;

    setForm((prev) => {
      const next: InvoiceFormState = {
        ...prev,
        extra_fields: { ...prev.extra_fields },
        items: prev.items.map((it) => ({ ...it })),
      };

      // 1. Apply value to standard field or extra_fields
      if (k === 'invoice_number' || k === 'invoice_no') {
        next.invoice_number = rawVal;
      } else if (k === 'display_date') {
        next.extra_fields.display_date = rawVal;
        const iso = normalizeDisplayDateToIso(rawVal);
        if (iso) next.invoice_date = iso;
      } else if (k === 'invoice_date') {
        next.invoice_date = rawVal;
      } else if (k === 'due_date') {
        next.due_date = rawVal;
      } else if (k === 'po_number') {
        next.po_number = rawVal;
      } else if (k === 'customer_name' || k === 'bill_to') {
        next.customer_name = rawVal;
        if (mirrorShipTo) {
          next.extra_fields.bill_name = rawVal;
          next.extra_fields.shipped_to = rawVal;
          next.extra_fields.ship_name = rawVal;
        }
      } else if (k === 'bill_name') {
        next.extra_fields.bill_name = rawVal;
        if (!next.customer_name.trim()) next.customer_name = rawVal;
        if (mirrorShipTo) next.extra_fields.ship_name = rawVal;
      } else if (k === 'customer_phone') {
        next.customer_phone = rawVal;
        if (mirrorShipTo) next.extra_fields.ship_phone = rawVal;
      } else if (k === 'bill_alt_phone') {
        next.extra_fields.bill_alt_phone = rawVal;
        if (mirrorShipTo) next.extra_fields.ship_alt_phone = rawVal;
      } else if (k === 'customer_email') {
        next.customer_email = rawVal;
        if (mirrorShipTo) next.extra_fields.ship_email = rawVal;
      } else if (k === 'billing_address') {
        next.billing_address = rawVal;
        if (mirrorShipTo) next.shipping_address = rawVal;
      } else if (k === 'shipping_address') {
        next.shipping_address = rawVal;
      } else if (k === 'customer_gstin') {
        next.customer_gstin = rawVal;
        if (mirrorShipTo) next.extra_fields.ship_gstin = rawVal;
      } else if (k === 'amount_in_words') {
        next.amount_in_words = rawVal;
        next.amount_in_words_manual = true;
        next.extra_fields.amount_in_words = rawVal;
      } else {
        next.extra_fields[k] = rawVal;
      }

      // 2. Sync primary ADMS item fields with items[0]
      if (!next.items.length) {
        next.items = [
          {
            sl_no: 1,
            description: '',
            hsn_sac: '',
            quantity: 1,
            unit: 'Nos',
            rate: 0,
            discount: 0,
            discount_type: 'amount',
            gst_percent: 5,
            taxable_amount: 0,
            gst_amount: 0,
            total_amount: 0,
          },
        ];
      }

      const item0 = next.items[0];
      if (k === 'item_model' || k === 'item_colour') {
        const model = (k === 'item_model' ? rawVal : next.extra_fields.item_model || '').trim();
        const col = (k === 'item_colour' ? rawVal : next.extra_fields.item_colour || '').trim();
        item0.description = [model, col].filter(Boolean).join(' - ') || 'Vehicle';
      }
      if (k === 'hsn_code') {
        item0.hsn_sac = rawVal;
      }
      if (!next.extra_fields.item_sl_no && (k === 'item_model' || k === 'item_ex_showroom_price')) {
        next.extra_fields.item_sl_no = '1';
      }

      // 3. Auto-calculate GST 5% & totals from Ex-Showroom Price / Discount / Down Payment / Subsidy
      const calcTriggers = new Set([
        'item_ex_showroom_price',
        'item_offer_discount',
        'item_down_payment',
        'subsidy',
      ]);
      if (autoCalcGst5 && calcTriggers.has(k)) {
        const exShowroom = parseNum(next.extra_fields.item_ex_showroom_price || '');
        const disc = parseNum(next.extra_fields.item_offer_discount || '');
        const subsidy = parseNum(next.extra_fields.subsidy || '');
        const downPay = parseNum(next.extra_fields.item_down_payment || '');

        if (exShowroom > 0) {
          const netPrice = round2(Math.max(0, exShowroom - disc - subsidy));
          const taxable = round2(netPrice / 1.05);
          const gst5 = round2(netPrice - taxable);
          const cgst = round2(gst5 / 2);
          const sgst = round2(gst5 - cgst);
          const balance = round2(Math.max(0, netPrice - downPay));

          item0.rate = taxable;
          item0.gst_percent = 5;
          item0.discount = 0;
          if (!item0.description.trim()) item0.description = 'Electric Vehicle';

          next.tax_mode = 'cgst_sgst';
          next.auto_round_off = false;
          next.extra_fields.item_gst_amount = gst5.toFixed(2);
          next.extra_fields.item_balance_amount = fmtNum(balance);
          next.extra_fields.taxable_total = taxable.toFixed(2);
          next.extra_fields.discount_total = disc > 0 ? disc.toFixed(2) : '';
          next.extra_fields.cgst_total = cgst.toFixed(2);
          next.extra_fields.sgst_total = sgst.toFixed(2);
          next.extra_fields.grand_total = fmtNum(netPrice);
          next.extra_fields.total_invoice_value = fmtNum(netPrice);
          const words = amountToIndianWords(netPrice);
          next.extra_fields.amount_in_words = words;
          next.amount_in_words = words;
          next.amount_in_words_manual = false;
        }
      }

      return next;
    });
  };

  const pages = template.preview_images.length
    ? template.preview_images
    : [
        {
          page: 1,
          filename: '',
          width_pt: template.page_width_pt,
          height_pt: template.page_height_pt,
          width_px: 1389,
          height_px: 1797,
        },
      ];

  const baseWidthPt = template.page_width_pt || 595.28;
  const ptToPx = containerWidth / baseWidthPt;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 mb-2 sm:hidden px-1">
        <span className="text-[11px] text-slate-500 font-medium">Canvas Mode:</span>
        <div className="inline-flex rounded-lg bg-slate-200 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMobileZoom('fit')}
            className={`px-2.5 py-1 rounded-md transition touch-manipulation ${
              mobileZoom === 'fit' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Fit Screen
          </button>
          <button
            type="button"
            onClick={() => setMobileZoom('zoom')}
            className={`px-2.5 py-1 rounded-md transition touch-manipulation ${
              mobileZoom === 'zoom' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Zoom to Type 🔍
          </button>
        </div>
      </div>

      <div className="overflow-x-auto mobile-scroll pb-2">
        <div
          ref={containerRef}
          className={`mx-auto space-y-6 ${
            mobileZoom === 'zoom' ? 'w-[720px] max-w-none' : 'w-full max-w-[880px]'
          }`}
        >
          {pages.map((pg) => {
        const aspectRatio = (pg.height_pt || 841.89) / Math.max(1, pg.width_pt || 595.28);
        const pageFields = template.field_mappings.fields.filter((f) => f.page === pg.page);
        const pageMasks = template.field_mappings.masks.filter((m) => m.page === pg.page);

        return (
          <div
            key={pg.page}
            className="relative w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg"
            style={{ height: `${containerWidth * aspectRatio}px` }}
          >
            <img
              src={api.getTemplatePageUrl(template.id, pg.page, template.updated_at)}
              alt={`${template.name} page ${pg.page}`}
              className="pointer-events-none h-full w-full select-none object-fill"
            />

            {/* Erase Masks */}
            {pageMasks.map((m) => (
              <div
                key={m.id}
                style={{
                  position: 'absolute',
                  left: `${m.x_pct}%`,
                  top: `${m.y_pct}%`,
                  width: `${m.w_pct}%`,
                  height: `${m.h_pct}%`,
                  backgroundColor: m.color || '#FFFFFF',
                }}
              />
            ))}

            {/* Directly Editable Blank Inputs */}
            {pageFields.map((fld) => {
              const val = getFieldDisplayValue(fld);
              const pxFont = Math.max(7, Number((fld.font_size * ptToPx).toFixed(1)));

              const sharedStyle: React.CSSProperties = {
                position: 'absolute',
                left: `${fld.x_pct}%`,
                top: `${fld.y_pct}%`,
                width: `${fld.w_pct}%`,
                height: `${fld.h_pct}%`,
                fontSize: `${pxFont}px`,
                fontWeight: fld.font_weight === 'bold' ? 700 : 400,
                color: fld.color || '#111827',
                textAlign: fld.align,
                backgroundColor: fld.bg_color || 'rgba(238, 242, 255, 0.35)',
                lineHeight: 1.2,
              };

              if (fld.kind === 'image' || fld.field_key === 'company_logo') {
                return null;
              }

              if (fld.multiline) {
                return (
                  <textarea
                    key={fld.id}
                    value={val}
                    onChange={(e) => handleFieldChange(fld, e.target.value)}
                    placeholder={fld.label}
                    title={fld.label}
                    style={sharedStyle}
                    className="resize-none rounded-sm border border-transparent px-1 py-0.5 placeholder:text-[10px] placeholder:font-normal placeholder:text-indigo-400/70 hover:border-indigo-300 focus:border-indigo-600 focus:bg-white/95 focus:outline-none"
                  />
                );
              }

              return (
                <input
                  key={fld.id}
                  type="text"
                  value={val}
                  onChange={(e) => handleFieldChange(fld, e.target.value)}
                  placeholder={fld.label}
                  title={fld.label}
                  style={sharedStyle}
                  className="rounded-sm border border-transparent px-1 placeholder:text-[10px] placeholder:font-normal placeholder:text-indigo-400/70 hover:border-indigo-300 focus:border-indigo-600 focus:bg-white/95 focus:outline-none"
                />
              );
            })}
          </div>
        );
      })}
        </div>
      </div>
    </div>
  );
};
