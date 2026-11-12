import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { InvoiceFormState, InvoiceItem, InvoiceTemplate } from '../types';
import { buildPreviewValueMap, calculateInvoice } from '../utils/calculator';

interface LivePreviewProps {
  template: InvoiceTemplate | null;
  form: InvoiceFormState;
  hasLogo: boolean;
  activeFieldKey?: string | null;
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;

function formatItemCell(item: InvoiceItem, key: string): string {
  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  switch (key) {
    case 'sl_no':
      return String(item.sl_no);
    case 'description':
    case 'item_description':
      return item.description || '';
    case 'hsn_sac':
    case 'hsn':
      return item.hsn_sac || '';
    case 'quantity':
    case 'qty':
      return String(item.quantity);
    case 'unit':
      return item.unit || 'Nos';
    case 'rate':
      return fmt(item.rate);
    case 'discount':
      return item.discount_type === 'percent' && item.discount > 0
        ? `${item.discount}%`
        : fmt(item.discount);
    case 'gst_percent':
    case 'gst_pct':
      return `${item.gst_percent}%`;
    case 'taxable_amount':
      return fmt(item.taxable_amount);
    case 'gst_amount':
      return fmt(item.gst_amount);
    case 'total_amount':
    case 'total':
      return fmt(item.total_amount);
    default:
      return '';
  }
}

export const LivePreview: React.FC<LivePreviewProps> = ({
  template,
  form,
  hasLogo,
  activeFieldKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(560);
  const [docxStruct, setDocxStruct] = useState<any>(null);
  const [docxError, setDocxError] = useState('');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!template || template.mode !== 'docx') {
      setDocxStruct(null);
      setDocxError('');
      return;
    }
    let cancelled = false;
    api
      .getDocxStructure(template.id)
      .then((data) => {
        if (!cancelled) {
          setDocxStruct(data);
          setDocxError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setDocxError(err.message || 'Failed to load DOCX preview');
      });
    return () => {
      cancelled = true;
    };
  }, [template?.id, template?.mode, template?.updated_at]);

  const calc = useMemo(
    () => calculateInvoice(form.items, form.tax_mode, form.auto_round_off, form.invoice_discount),
    [form.items, form.tax_mode, form.auto_round_off, form.invoice_discount]
  );

  const valueMap = useMemo(() => {
    const raw = buildPreviewValueMap(form, calc);
    const hasPriced = form.items.some((it) => Number(it.rate) > 0);
    if (!hasPriced) {
      const summaryKeys = [
        'subtotal',
        'discount_total',
        'discount',
        'taxable_total',
        'taxable',
        'cgst_total',
        'cgst',
        'sgst_total',
        'sgst',
        'igst_total',
        'igst',
        'round_off',
        'grand_total',
        'total',
      ];
      for (const sk of summaryKeys) {
        if (!(sk in form.extra_fields)) {
          raw[sk] = '';
        }
      }
      if (!form.amount_in_words_manual && !('amount_in_words' in form.extra_fields)) {
        raw.amount_in_words = '';
      }
    }
    return raw;
  }, [form, calc]);

  // Mode A: Background PDF / Image
  if (template && template.mode === 'background') {
    const pages = template.preview_images.length
      ? template.preview_images
      : [{ page: 1, filename: '', width_pt: template.page_width_pt, height_pt: template.page_height_pt, width_px: 1000, height_px: 1414 }];

    const baseWidthPt = template.page_width_pt || 595.28;
    const ptToPx = containerWidth / baseWidthPt;

    const itemsCfg = template.field_mappings.items_table;
    // Compute row pagination for items table
    let page1Items: InvoiceItem[] = [];
    const overflowPages: InvoiceItem[][] = [];

    if (itemsCfg.enabled && itemsCfg.columns.length > 0 && calc.items.length > 0) {
      const availPct = Math.max(2, itemsCfg.y_end_pct - itemsCfg.y_start_pct);
      const maxRowsPage1 = Math.max(1, Math.floor(availPct / Math.max(1, itemsCfg.row_height_pct)));
      page1Items = calc.items.slice(0, maxRowsPage1);
      const rest = calc.items.slice(maxRowsPage1);
      const rowsPerOverflow = Math.max(1, Math.floor(80 / Math.max(1, itemsCfg.row_height_pct)));
      for (let i = 0; i < rest.length; i += rowsPerOverflow) {
        overflowPages.push(rest.slice(i, i + rowsPerOverflow));
      }
    }

    const totalPages = pages.length + overflowPages.length;

    return (
      <div ref={containerRef} className="w-full space-y-5">
        {pages.map((pg) => {
          const aspectRatio = (pg.height_pt || 841.89) / Math.max(1, pg.width_pt || 595.28);
          const pageFields = template.field_mappings.fields.filter((f) => f.page === pg.page);
          const pageMasks = template.field_mappings.masks.filter((m) => m.page === pg.page);
          const showTableOnThisPage =
            itemsCfg.enabled && itemsCfg.page === pg.page && itemsCfg.columns.length > 0;

          return (
            <div
              key={pg.page}
              className="relative w-full overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md"
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

              {/* Mapped Dynamic Items Table */}
              {showTableOnThisPage && (
                <>
                  {itemsCfg.bg_color && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(...itemsCfg.columns.map((c) => c.x_pct))}%`,
                        top: `${itemsCfg.y_start_pct}%`,
                        width: `${
                          Math.max(...itemsCfg.columns.map((c) => c.x_pct + c.w_pct)) -
                          Math.min(...itemsCfg.columns.map((c) => c.x_pct))
                        }%`,
                        height: `${Math.max(1, itemsCfg.y_end_pct - itemsCfg.y_start_pct)}%`,
                        backgroundColor: itemsCfg.bg_color,
                      }}
                    />
                  )}
                  {page1Items.map((it, rIdx) => {
                    const rowTop = itemsCfg.y_start_pct + rIdx * itemsCfg.row_height_pct;
                    return (
                      <React.Fragment key={it.sl_no}>
                        {itemsCfg.columns.map((col) => (
                          <div
                            key={`${it.sl_no}-${col.id}`}
                            style={{
                              position: 'absolute',
                              left: `${col.x_pct}%`,
                              top: `${rowTop}%`,
                              width: `${col.w_pct}%`,
                              height: `${itemsCfg.row_height_pct}%`,
                              fontSize: `${Math.max(6, itemsCfg.font_size * ptToPx)}px`,
                              fontWeight: itemsCfg.font_weight,
                              color: itemsCfg.color || '#111827',
                              textAlign: col.align,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent:
                                col.align === 'center'
                                  ? 'center'
                                  : col.align === 'right'
                                  ? 'flex-end'
                                  : 'flex-start',
                              padding: '0 3px',
                              overflow: 'hidden',
                              lineHeight: 1.15,
                              border: itemsCfg.show_grid_lines ? '1px solid #cbd5e1' : 'none',
                            }}
                          >
                            <span className="truncate">{formatItemCell(it, col.key)}</span>
                          </div>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </>
              )}

              {/* Mapped Single Fields */}
              {pageFields.map((fld) => {
                const val = valueMap[fld.field_key] ?? '';
                const isActive = activeFieldKey === fld.field_key;
                return (
                  <div
                    key={fld.id}
                    style={{
                      position: 'absolute',
                      left: `${fld.x_pct}%`,
                      top: `${fld.y_pct}%`,
                      width: `${fld.w_pct}%`,
                      height: `${fld.h_pct}%`,
                      backgroundColor:
                        fld.bg_color || (isActive ? 'rgba(79, 70, 229, 0.14)' : 'transparent'),
                      outline: isActive ? '2px solid #4f46e5' : 'none',
                      fontSize: `${Math.max(6, fld.font_size * ptToPx)}px`,
                      fontWeight: fld.font_weight,
                      color: fld.color || '#111827',
                      textAlign: fld.align,
                      display: 'flex',
                      alignItems: fld.multiline ? 'flex-start' : 'center',
                      justifyContent:
                        fld.align === 'center'
                          ? 'center'
                          : fld.align === 'right'
                          ? 'flex-end'
                          : 'flex-start',
                      padding: '1px 3px',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      whiteSpace: fld.multiline ? 'pre-wrap' : 'nowrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {fld.kind === 'image' || fld.field_key === 'company_logo' ? (
                      hasLogo ? (
                        <img
                          src={api.getLogoUrl()}
                          alt="Company Logo"
                          className="h-full w-full object-contain"
                        />
                      ) : null
                    ) : (
                      val
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div className="pointer-events-none absolute bottom-1.5 right-3 text-[10px] text-slate-500">
                  Page {pg.page} of {totalPages}
                </div>
              )}
            </div>
          );
        })}

        {/* Overflow Pages for Multi-Page Invoices */}
        {overflowPages.map((chunk, idx) => {
          const aspectRatio = 841.89 / 595.28;
          return (
            <div
              key={`overflow-${idx}`}
              className="relative w-full rounded-lg border border-slate-300 bg-white p-6 shadow-md"
              style={{ minHeight: `${containerWidth * aspectRatio * 0.6}px` }}
            >
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 text-xs font-semibold text-slate-700">
                <span>Invoice {form.invoice_number} — Continued Items</span>
                <span>
                  Page {pages.length + idx + 1} of {totalPages}
                </span>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    {itemsCfg.columns.map((col) => (
                      <th
                        key={col.id}
                        className="border border-slate-300 px-2 py-1.5 font-semibold"
                        style={{ textAlign: col.align }}
                      >
                        {col.label || col.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((it) => (
                    <tr key={it.sl_no}>
                      {itemsCfg.columns.map((col) => (
                        <td
                          key={col.id}
                          className="border border-slate-300 px-2 py-1.5"
                          style={{ textAlign: col.align }}
                        >
                          {formatItemCell(it, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  // Mode B: DOCX Live Preview
  if (template && template.mode === 'docx') {
    const sub = (text: string, rowVals: Record<string, string>) =>
      (text || '').replace(PLACEHOLDER_REGEX, (_, k: string) => {
        const key = k.trim();
        return rowVals[key] ?? rowVals[key.toLowerCase()] ?? '';
      });

    const renderParagraph = (p: any, rowVals: Record<string, string>, keyPrefix: string) => {
      const fullText = (p.runs || []).map((r: any) => r.text).join('');
      if (fullText.includes('{{company_logo}}') && hasLogo) {
        return (
          <div key={keyPrefix} style={{ textAlign: p.align || 'left' }} className="my-1">
            <img src={api.getLogoUrl()} alt="Logo" className="inline-block max-h-16 object-contain" />
          </div>
        );
      }

      const anySingleRun = (p.runs || []).some((r: any) => PLACEHOLDER_REGEX.test(r.text || ''));
      PLACEHOLDER_REGEX.lastIndex = 0;

      return (
        <p
          key={keyPrefix}
          style={{
            textAlign: p.align || 'left',
            marginTop: `${p.space_before_pt || 0}px`,
            marginBottom: `${p.space_after_pt || 3}px`,
          }}
          className="leading-snug"
        >
          {(p.runs || []).map((run: any, rIdx: number) => {
            let txt = run.text || '';
            if (PLACEHOLDER_REGEX.test(fullText)) {
              PLACEHOLDER_REGEX.lastIndex = 0;
              if (anySingleRun) {
                txt = sub(txt, rowVals);
              } else {
                txt = rIdx === 0 ? sub(fullText, rowVals) : '';
              }
            }
            PLACEHOLDER_REGEX.lastIndex = 0;

            return (
              <React.Fragment key={rIdx}>
                {(run.images || []).map((img: any, iIdx: number) => (
                  <img
                    key={iIdx}
                    src={img.data_uri}
                    alt="Embedded"
                    style={{ width: `${img.width_pt}px`, height: `${img.height_pt}px` }}
                    className="inline-block object-contain"
                  />
                ))}
                {txt && (
                  <span
                    style={{
                      fontWeight: run.bold ? 700 : 400,
                      fontStyle: run.italic ? 'italic' : 'normal',
                      textDecoration: run.underline ? 'underline' : 'none',
                      fontSize: `${Math.max(8, (run.font_size_pt || 10) * 1.1)}px`,
                      color: run.color || '#111827',
                    }}
                  >
                    {txt}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </p>
      );
    };

    const itemMapFor = (it: InvoiceItem): Record<string, string> => ({
      ...valueMap,
      sl_no: formatItemCell(it, 'sl_no'),
      description: formatItemCell(it, 'description'),
      item_description: formatItemCell(it, 'description'),
      hsn_sac: formatItemCell(it, 'hsn_sac'),
      hsn: formatItemCell(it, 'hsn_sac'),
      quantity: formatItemCell(it, 'quantity'),
      qty: formatItemCell(it, 'quantity'),
      unit: formatItemCell(it, 'unit'),
      rate: formatItemCell(it, 'rate'),
      discount: formatItemCell(it, 'discount'),
      gst_percent: formatItemCell(it, 'gst_percent'),
      gst_pct: formatItemCell(it, 'gst_percent'),
      taxable_amount: formatItemCell(it, 'taxable_amount'),
      gst_amount: formatItemCell(it, 'gst_amount'),
      total_amount: formatItemCell(it, 'total_amount'),
      total: formatItemCell(it, 'total_amount'),
    });

    return (
      <div ref={containerRef} className="w-full">
        <div className="min-h-[760px] w-full rounded-lg border border-slate-300 bg-white p-8 shadow-md">
          {docxError && (
            <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{docxError}</div>
          )}
          {!docxStruct ? (
            <div className="py-20 text-center text-sm text-slate-400">Loading DOCX template preview...</div>
          ) : (
            <div className="space-y-2 text-slate-900">
              {(docxStruct.header_blocks || []).map((hb: any, i: number) =>
                renderParagraph(hb, valueMap, `hdr-${i}`)
              )}
              {(docxStruct.blocks || []).map((blk: any, bIdx: number) => {
                if (blk.type === 'paragraph') {
                  return renderParagraph(blk, valueMap, `blk-${bIdx}`);
                }
                if (blk.type === 'table') {
                  return (
                    <table
                      key={`tbl-${bIdx}`}
                      className={`my-2 w-full border-collapse text-xs ${
                        blk.has_borders ? 'border border-slate-400' : ''
                      }`}
                    >
                      <tbody>
                        {(blk.rows || []).flatMap((row: any, rIdx: number) => {
                          if (row.is_item_row) {
                            return calc.items.map((it) => {
                              const iv = itemMapFor(it);
                              return (
                                <tr key={`r-${rIdx}-item-${it.sl_no}`}>
                                  {(row.cells || []).map((cell: any, cIdx: number) => (
                                    <td
                                      key={cIdx}
                                      style={{ backgroundColor: cell.bg_color || 'transparent' }}
                                      className={`px-2 py-1 align-middle ${
                                        blk.has_borders ? 'border border-slate-400' : ''
                                      }`}
                                    >
                                      {(cell.paragraphs || []).map((cp: any, pIdx: number) =>
                                        renderParagraph(cp, iv, `c-${rIdx}-${it.sl_no}-${cIdx}-${pIdx}`)
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              );
                            });
                          }
                          return [
                            <tr key={`r-${rIdx}`}>
                              {(row.cells || []).map((cell: any, cIdx: number) => (
                                <td
                                  key={cIdx}
                                  style={{ backgroundColor: cell.bg_color || 'transparent' }}
                                  className={`px-2 py-1 align-middle ${
                                    blk.has_borders ? 'border border-slate-400' : ''
                                  }`}
                                >
                                  {(cell.paragraphs || []).map((cp: any, pIdx: number) =>
                                    renderParagraph(cp, valueMap, `c-${rIdx}-${cIdx}-${pIdx}`)
                                  )}
                                </td>
                              ))}
                            </tr>,
                          ];
                        })}
                      </tbody>
                    </table>
                  );
                }
                return null;
              })}
              {(docxStruct.footer_blocks || []).map((fb: any, i: number) =>
                renderParagraph(fb, valueMap, `ftr-${i}`)
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback Standard Preview (when no template uploaded yet)
  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div ref={containerRef} className="w-full">
      <div className="min-h-[760px] w-full rounded-lg border border-slate-300 bg-white p-8 shadow-md">
        <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          No template selected — showing standard A4 layout. Upload your own template in{' '}
          <strong>My Invoice Templates</strong> for an exact match.
        </div>
        <div className="mt-4 flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            {hasLogo && (
              <img src={api.getLogoUrl()} alt="Logo" className="mb-2 max-h-12 object-contain" />
            )}
            <h2 className="text-xl font-bold text-slate-900">
              {form.company_details.company_name || 'Your Company Name'}
            </h2>
            <p className="whitespace-pre-line text-xs text-slate-600">
              {form.company_details.company_address}
            </p>
            {form.company_details.gstin && (
              <p className="text-xs text-slate-600">GSTIN: {form.company_details.gstin}</p>
            )}
          </div>
          <div className="text-right text-xs">
            <div className="text-lg font-bold uppercase tracking-wide text-indigo-700">Tax Invoice</div>
            <div className="mt-1 font-semibold">Invoice #: {form.invoice_number}</div>
            <div>Date: {form.invoice_date}</div>
            {form.due_date && <div>Due Date: {form.due_date}</div>}
          </div>
        </div>

        <div className="my-4 grid grid-cols-2 gap-4 text-xs">
          <div className="rounded bg-slate-50 p-3">
            <div className="font-bold uppercase text-slate-500">Bill To</div>
            <div className="mt-1 font-semibold text-slate-900">
              {form.customer_name || 'Customer Name'}
            </div>
            <div className="whitespace-pre-line text-slate-600">{form.billing_address}</div>
            {form.customer_gstin && <div>GSTIN: {form.customer_gstin}</div>}
            {form.customer_phone && <div>Phone: {form.customer_phone}</div>}
          </div>
          <div className="rounded bg-slate-50 p-3">
            <div className="font-bold uppercase text-slate-500">Ship To</div>
            <div className="mt-1 font-semibold text-slate-900">
              {form.customer_name || 'Customer Name'}
            </div>
            <div className="whitespace-pre-line text-slate-600">
              {form.shipping_address || form.billing_address}
            </div>
            {form.place_of_supply && <div>Place of Supply: {form.place_of_supply}</div>}
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="border border-slate-700 px-2 py-1.5 text-center">#</th>
              <th className="border border-slate-700 px-2 py-1.5 text-left">Description</th>
              <th className="border border-slate-700 px-2 py-1.5 text-center">HSN</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Rate</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">GST%</th>
              <th className="border border-slate-700 px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {calc.items.map((it) => (
              <tr key={it.sl_no}>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{it.sl_no}</td>
                <td className="border border-slate-300 px-2 py-1.5">{it.description || '-'}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-center">{it.hsn_sac}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">
                  {it.quantity} {it.unit}
                </td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">{fmt(it.rate)}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right">{it.gst_percent}%</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-medium">
                  {fmt(it.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between gap-6 text-xs">
          <div className="flex-1 space-y-2">
            <div>
              <span className="font-semibold">Amount in Words:</span>{' '}
              {form.amount_in_words_manual && form.amount_in_words ? form.amount_in_words : calc.amount_in_words}
            </div>
            {form.bank_account_details && (
              <div className="whitespace-pre-line text-slate-600">
                <span className="font-semibold text-slate-800">Bank Details:</span>{'\n'}
                {form.bank_account_details}
              </div>
            )}
            {form.upi_id && (
              <div>
                <span className="font-semibold">UPI ID:</span> {form.upi_id}
              </div>
            )}
          </div>
          <div className="w-56 space-y-1">
            <div className="flex justify-between">
              <span>Taxable Value:</span>
              <span>{fmt(calc.taxable_total)}</span>
            </div>
            {form.tax_mode === 'cgst_sgst' && (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{fmt(calc.cgst_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{fmt(calc.sgst_total)}</span>
                </div>
              </>
            )}
            {form.tax_mode === 'igst' && (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{fmt(calc.igst_total)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold">
              <span>Grand Total:</span>
              <span>₹ {fmt(calc.grand_total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
