import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eraser,
  Layers,
  MousePointer,
  PenTool,
  Plus,
  Save,
  Table as TableIcon,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '../api';
import type {
  EraseMask,
  FieldOverlay,
  InvoiceTemplate,
  TableColumnMapping,
  TemplateMappings,
} from '../types';
import { FIELD_PALETTE, ITEM_COLUMN_KEYS } from '../utils/calculator';

interface TemplateEditorModalProps {
  template: InvoiceTemplate;
  onClose: () => void;
  onSaved: (updated: InvoiceTemplate) => void;
}

type DragState =
  | {
      kind: 'field' | 'mask';
      id: string;
      mode: 'move' | 'resize';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      kind: 'table';
      mode: 'move' | 'resize';
      startY: number;
      origYStart: number;
      origYEnd: number;
    }
  | {
      kind: 'col';
      id: string;
      mode: 'move' | 'resize';
      startX: number;
      origX: number;
      origW: number;
    }
  | {
      kind: 'draw';
      tool: 'field' | 'mask';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    };

interface PendingDrawRect {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  template,
  onClose,
  onSaved,
}) => {
  const [mappings, setMappings] = useState<TemplateMappings>(() =>
    JSON.parse(JSON.stringify(template.field_mappings))
  );
  const [tplName, setTplName] = useState(template.name);
  const [activeTab, setActiveTab] = useState<'fields' | 'masks' | 'table'>('fields');
  const [selectedId, setSelectedId] = useState<string | null>(
    template.field_mappings.fields[0]?.id ?? null
  );
  const [selectedKind, setSelectedKind] = useState<'field' | 'mask' | 'col' | null>(
    template.field_mappings.fields[0] ? 'field' : null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [drawTool, setDrawTool] = useState<'draw_field' | 'select' | 'draw_mask'>('draw_field');
  const [drawPreview, setDrawPreview] = useState<PendingDrawRect | null>(null);
  const [pendingBox, setPendingBox] = useState<PendingDrawRect | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [pendingMultiline, setPendingMultiline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [docxStruct, setDocxStruct] = useState<any>(null);
  const [copiedToken, setCopiedToken] = useState('');
  const [embeddedWidgets, setEmbeddedWidgets] = useState<FieldOverlay[]>([]);
  const [mobileEditorTab, setMobileEditorTab] = useState<'canvas' | 'palette' | 'properties'>('canvas');

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const drawPreviewRef = useRef<PendingDrawRect | null>(null);

  useEffect(() => {
    if (template.mode === 'docx') {
      api.getDocxStructure(template.id).then(setDocxStruct).catch(() => {});
    } else if (template.file_type === 'pdf') {
      api
        .getPdfWidgets(template.id)
        .then((res) => setEmbeddedWidgets(res.widgets || []))
        .catch(() => {});
    }
  }, [template.id, template.mode, template.file_type]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const el = canvasRef.current;
      if (!d || !el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (d.kind === 'draw') {
        const curX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const curY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        const x_pct = Number(Math.min(d.origX, curX).toFixed(2));
        const y_pct = Number(Math.min(d.origY, curY).toFixed(2));
        const w_pct = Number(Math.abs(curX - d.origX).toFixed(2));
        const h_pct = Number(Math.abs(curY - d.origY).toFixed(2));
        const box = { x_pct, y_pct, w_pct, h_pct };
        drawPreviewRef.current = box;
        setDrawPreview(box);
        return;
      }

      if (d.kind === 'field' || d.kind === 'mask') {
        const dxPct = ((e.clientX - d.startX) / rect.width) * 100;
        const dyPct = ((e.clientY - d.startY) / rect.height) * 100;

        setMappings((prev) => {
          const listKey = d.kind === 'field' ? 'fields' : 'masks';
          return {
            ...prev,
            [listKey]: prev[listKey].map((item: any) => {
              if (item.id !== d.id) return item;
              if (d.mode === 'move') {
                const nx = Math.max(0, Math.min(100 - item.w_pct, d.origX + dxPct));
                const ny = Math.max(0, Math.min(100 - item.h_pct, d.origY + dyPct));
                return { ...item, x_pct: Number(nx.toFixed(2)), y_pct: Number(ny.toFixed(2)) };
              } else {
                const nw = Math.max(2, Math.min(100 - item.x_pct, d.origW + dxPct));
                const nh = Math.max(1.2, Math.min(100 - item.y_pct, d.origH + dyPct));
                return { ...item, w_pct: Number(nw.toFixed(2)), h_pct: Number(nh.toFixed(2)) };
              }
            }),
          };
        });
      } else if (d.kind === 'table') {
        const dyPct = ((e.clientY - d.startY) / rect.height) * 100;
        setMappings((prev) => {
          const tbl = prev.items_table;
          if (d.mode === 'move') {
            const h = d.origYEnd - d.origYStart;
            const ny = Math.max(0, Math.min(100 - h, d.origYStart + dyPct));
            return {
              ...prev,
              items_table: {
                ...tbl,
                y_start_pct: Number(ny.toFixed(2)),
                y_end_pct: Number((ny + h).toFixed(2)),
              },
            };
          } else {
            const nEnd = Math.max(d.origYStart + 3, Math.min(99, d.origYEnd + dyPct));
            return {
              ...prev,
              items_table: { ...tbl, y_end_pct: Number(nEnd.toFixed(2)) },
            };
          }
        });
      } else if (d.kind === 'col') {
        const dxPct = ((e.clientX - d.startX) / rect.width) * 100;
        setMappings((prev) => ({
          ...prev,
          items_table: {
            ...prev.items_table,
            columns: prev.items_table.columns.map((c) => {
              if (c.id !== d.id) return c;
              if (d.mode === 'move') {
                const nx = Math.max(0, Math.min(100 - c.w_pct, d.origX + dxPct));
                return { ...c, x_pct: Number(nx.toFixed(2)) };
              } else {
                const nw = Math.max(2.5, Math.min(100 - c.x_pct, d.origW + dxPct));
                return { ...c, w_pct: Number(nw.toFixed(2)) };
              }
            }),
          },
        }));
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      const box = drawPreviewRef.current;
      if (d && d.kind === 'draw' && box) {
        if (box.w_pct >= 1.5 && box.h_pct >= 0.8) {
          if (d.tool === 'mask') {
            const id = `mask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            setMappings((prev) => ({
              ...prev,
              masks: [
                ...prev.masks,
                {
                  id,
                  page: currentPage,
                  x_pct: box.x_pct,
                  y_pct: box.y_pct,
                  w_pct: box.w_pct,
                  h_pct: box.h_pct,
                  color: '#FFFFFF',
                },
              ],
            }));
            setSelectedId(id);
            setSelectedKind('mask');
          } else {
            setPendingBox(box);
            setPendingLabel('');
            setPendingMultiline(box.h_pct >= 4.0);
          }
        }
      }
      dragRef.current = null;
      drawPreviewRef.current = null;
      setDrawPreview(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [currentPage]);

  const createDrawnField = async (
    labelInput: string,
    keyOverride?: string,
    multilineOverride?: boolean
  ) => {
    if (!pendingBox) return;
    const box = pendingBox;
    const cleanLabel = labelInput.trim() || `Field ${mappings.fields.length + 1}`;
    const generatedKey =
      keyOverride ||
      cleanLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') ||
      `field_${mappings.fields.length + 1}`;

    setPendingBox(null);
    setPendingLabel('');

    let font_size = 9.0;
    let font_weight: 'normal' | 'bold' = 'normal';
    let color = '#111827';
    let align: 'left' | 'center' | 'right' = 'left';

    try {
      const style = await api.detectBoxStyle(template.id, box, generatedKey, currentPage);
      font_size = style.font_size || font_size;
      font_weight = style.font_weight || font_weight;
      color = style.color || color;
      align = style.align || align;
    } catch {
      // fallback defaults
    }

    const id = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newField: FieldOverlay = {
      id,
      field_key: generatedKey,
      label: cleanLabel,
      kind: generatedKey === 'company_logo' ? 'image' : 'text',
      page: currentPage,
      x_pct: box.x_pct,
      y_pct: box.y_pct,
      w_pct: box.w_pct,
      h_pct: box.h_pct,
      font_size,
      font_weight,
      color,
      align,
      multiline: multilineOverride ?? pendingMultiline,
      bg_color: '',
    };
    setMappings((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
    setSelectedId(id);
    setSelectedKind('field');
  };

  const addPaletteField = async (p: (typeof FIELD_PALETTE)[number]) => {
    const id = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const offset = (mappings.fields.length % 6) * 2;
    let x_pct = Math.min(75, 10 + offset);
    let y_pct = Math.min(85, 14 + offset);
    let w_pct = p.defaultW || 20;
    let h_pct = p.defaultH || 3.0;
    let multiline = Boolean(p.multiline);
    let font_size = 9.0;
    let font_weight: 'normal' | 'bold' = 'normal';
    let color = '#111827';
    let align: 'left' | 'center' | 'right' = 'left';

    try {
      const loc = await api.locateTemplateLabel(
        template.id,
        p.key,
        p.label,
        currentPage,
        mappings.fields
      );
      if (loc.found && loc.x_pct !== undefined && loc.y_pct !== undefined) {
        x_pct = loc.x_pct;
        y_pct = loc.y_pct;
        w_pct = loc.w_pct || w_pct;
        h_pct = loc.h_pct || h_pct;
        font_size = loc.font_size || font_size;
        font_weight = loc.font_weight || font_weight;
        color = loc.color || color;
        align = loc.align || align;
        if (h_pct >= 4.0) multiline = true;
      }
    } catch {
      // fallback to default coords
    }

    const newField: FieldOverlay = {
      id,
      field_key: p.key,
      label: p.label,
      kind: p.kind || 'text',
      page: currentPage,
      x_pct,
      y_pct,
      w_pct,
      h_pct,
      font_size,
      font_weight,
      color,
      align,
      multiline,
      bg_color: '',
    };
    setMappings((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
    setSelectedId(id);
    setSelectedKind('field');
  };

  const addCustomField = async () => {
    const key = customKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    if (!key) return;
    const label = customLabel.trim() || key.replace(/_/g, ' ');
    const id = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let x_pct = 20;
    let y_pct = 30;
    let w_pct = 22;
    let h_pct = 3.0;
    let multiline = false;
    let font_size = 9.0;
    let font_weight: 'normal' | 'bold' = 'normal';
    let color = '#111827';
    let align: 'left' | 'center' | 'right' = 'left';

    try {
      const loc = await api.locateTemplateLabel(
        template.id,
        key,
        label,
        currentPage,
        mappings.fields
      );
      if (loc.found && loc.x_pct !== undefined && loc.y_pct !== undefined) {
        x_pct = loc.x_pct;
        y_pct = loc.y_pct;
        w_pct = loc.w_pct || w_pct;
        h_pct = loc.h_pct || h_pct;
        font_size = loc.font_size || font_size;
        font_weight = loc.font_weight || font_weight;
        color = loc.color || color;
        align = loc.align || align;
        if (h_pct >= 4.0) multiline = true;
      }
    } catch {
      // fallback
    }

    const newField: FieldOverlay = {
      id,
      field_key: key,
      label,
      kind: 'text',
      page: currentPage,
      x_pct,
      y_pct,
      w_pct,
      h_pct,
      font_size,
      font_weight,
      color,
      align,
      multiline,
      bg_color: '',
    };
    setMappings((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
    setSelectedId(id);
    setSelectedKind('field');
    setCustomKey('');
    setCustomLabel('');
  };

  const addMask = (color = '#FFFFFF') => {
    const id = `mask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const offset = (mappings.masks.length % 5) * 2;
    const mask: EraseMask = {
      id,
      page: currentPage,
      x_pct: 25 + offset,
      y_pct: 20 + offset,
      w_pct: 20,
      h_pct: 3.5,
      color,
    };
    setMappings((prev) => ({ ...prev, masks: [...prev.masks, mask] }));
    setSelectedId(id);
    setSelectedKind('mask');
  };

  const toggleTableColumn = (colDef: (typeof ITEM_COLUMN_KEYS)[number]) => {
    setMappings((prev) => {
      const existing = prev.items_table.columns.find((c) => c.key === colDef.key);
      if (existing) {
        return {
          ...prev,
          items_table: {
            ...prev.items_table,
            columns: prev.items_table.columns.filter((c) => c.key !== colDef.key),
          },
        };
      }
      const nextX =
        prev.items_table.columns.length === 0
          ? 8
          : Math.min(
              88,
              Math.max(...prev.items_table.columns.map((c) => c.x_pct + c.w_pct))
            );
      const newCol: TableColumnMapping = {
        id: `col_${colDef.key}_${Date.now()}`,
        key: colDef.key,
        label: colDef.label,
        x_pct: Number(nextX.toFixed(2)),
        w_pct: Math.min(colDef.defaultW, Number((96 - nextX).toFixed(2)) || 8),
        align: colDef.align,
      };
      return {
        ...prev,
        items_table: {
          ...prev.items_table,
          enabled: true,
          page: currentPage,
          columns: [...prev.items_table.columns, newCol],
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateTemplate(template.id, {
        name: tplName.trim() || template.name,
        field_mappings: mappings,
      });
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const selectedField =
    selectedKind === 'field' ? mappings.fields.find((f) => f.id === selectedId) : null;
  const selectedMask =
    selectedKind === 'mask' ? mappings.masks.find((m) => m.id === selectedId) : null;
  const selectedCol =
    selectedKind === 'col'
      ? mappings.items_table.columns.find((c) => c.id === selectedId)
      : null;

  const updateSelectedField = (patch: Partial<FieldOverlay>) => {
    if (!selectedField) return;
    setMappings((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === selectedField.id ? { ...f, ...patch } : f)),
    }));
  };

  const updateSelectedMask = (patch: Partial<EraseMask>) => {
    if (!selectedMask) return;
    setMappings((prev) => ({
      ...prev,
      masks: prev.masks.map((m) => (m.id === selectedMask.id ? { ...m, ...patch } : m)),
    }));
  };

  const updateSelectedCol = (patch: Partial<TableColumnMapping>) => {
    if (!selectedCol) return;
    setMappings((prev) => ({
      ...prev,
      items_table: {
        ...prev.items_table,
        columns: prev.items_table.columns.map((c) =>
          c.id === selectedCol.id ? { ...c, ...patch } : c
        ),
      },
    }));
  };

  const deleteSelected = () => {
    if (!selectedId || !selectedKind) return;
    if (selectedKind === 'field') {
      setMappings((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== selectedId) }));
    } else if (selectedKind === 'mask') {
      setMappings((prev) => ({ ...prev, masks: prev.masks.filter((m) => m.id !== selectedId) }));
    } else if (selectedKind === 'col') {
      setMappings((prev) => ({
        ...prev,
        items_table: {
          ...prev.items_table,
          columns: prev.items_table.columns.filter((c) => c.id !== selectedId),
        },
      }));
    }
    setSelectedId(null);
    setSelectedKind(null);
  };

  // Mode B: DOCX Inspector Modal
  if (template.mode === 'docx') {
    const standardTokens = [
      'invoice_number', 'invoice_date', 'due_date', 'place_of_supply', 'payment_terms', 'po_number',
      'company_name', 'company_logo', 'company_address', 'company_gstin', 'company_pan', 'company_phone', 'company_email',
      'customer_name', 'billing_address', 'shipping_address', 'customer_gstin', 'customer_phone', 'customer_email',
      'subtotal', 'discount_total', 'taxable_total', 'cgst_total', 'sgst_total', 'igst_total', 'round_off', 'grand_total', 'amount_in_words',
      'payment_instructions', 'bank_account_details', 'upi_id',
    ];
    const itemTokens = ['sl_no', 'description', 'hsn_sac', 'quantity', 'unit', 'rate', 'discount', 'gst_percent', 'taxable_amount', 'total_amount'];

    const copyToken = (t: string) => {
      const val = `{{${t}}}`;
      navigator.clipboard?.writeText(val);
      setCopiedToken(t);
      setTimeout(() => setCopiedToken(''), 1500);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">DOCX Template Inspector</h3>
              <p className="text-xs text-slate-500">
                Mode B: Preserves original Word formatting, borders, fonts, and logos.
              </p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 touch-manipulation">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-4 sm:gap-6 overflow-y-auto p-4 sm:p-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">Template Name</label>
                <input
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <h4 className="text-sm font-bold text-emerald-900">
                  Detected Placeholders ({template.docx_placeholders.length})
                </h4>
                {template.docx_placeholders.length === 0 ? (
                  <p className="mt-1 text-xs text-emerald-800">
                    No <code>{'{{placeholder}}'}</code> tags were found in this DOCX yet. Add placeholders like{' '}
                    <code>{'{{customer_name}}'}</code> or <code>{'{{invoice_number}}'}</code> in Word and use{' '}
                    <strong>Replace File</strong>.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {template.docx_placeholders.map((ph) => (
                      <span
                        key={ph}
                        className="rounded-md bg-white px-2 py-1 font-mono text-xs font-medium text-emerald-800 shadow-sm"
                      >
                        {`{{${ph}}}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-xs font-bold uppercase text-slate-700">
                  Supported Placeholders (Click to Copy)
                </h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {standardTokens.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => copyToken(t)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                    >
                      {copiedToken === t ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-50" />}
                      {`{{${t}}}`}
                    </button>
                  ))}
                </div>
                <h5 className="mt-3 text-xs font-bold uppercase text-slate-700">
                  Repeating Item Table Row Placeholders
                </h5>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Put these in a single table row — the row is cloned automatically for every product!
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {itemTokens.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => copyToken(t)}
                      className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] text-indigo-800 hover:bg-indigo-100"
                    >
                      {`{{${t}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-100 p-4">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-600">
                Extracted DOCX Structure Preview
              </div>
              <div className="max-h-[58vh] overflow-y-auto rounded border border-slate-300 bg-white p-5 text-xs">
                {!docxStruct ? (
                  <div className="py-12 text-center text-slate-400">Loading structure...</div>
                ) : (
                  <div className="space-y-2">
                    {(docxStruct.blocks || []).map((b: any, i: number) =>
                      b.type === 'paragraph' ? (
                        <p key={i} style={{ textAlign: b.align || 'left' }}>
                          {(b.runs || []).map((r: any, j: number) => (
                            <span
                              key={j}
                              style={{
                                fontWeight: r.bold ? 700 : 400,
                                color: r.color || '#111827',
                              }}
                            >
                              {r.text}
                            </span>
                          ))}
                        </p>
                      ) : (
                        <table key={i} className="w-full border-collapse border border-slate-300">
                          <tbody>
                            {(b.rows || []).map((row: any, rIdx: number) => (
                              <tr key={rIdx} className={row.is_item_row ? 'bg-indigo-50/70' : ''}>
                                {(row.cells || []).map((c: any, cIdx: number) => (
                                  <td
                                    key={cIdx}
                                    style={{ backgroundColor: c.bg_color || undefined }}
                                    className="border border-slate-300 px-2 py-1"
                                  >
                                    {(c.paragraphs || []).map((cp: any) => cp.raw_text).join(' ')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mode A: Visual Background Template Field Mapper
  const pageInfo =
    template.preview_images.find((p) => p.page === currentPage) || template.preview_images[0];
  const aspectRatio = pageInfo
    ? pageInfo.height_pt / Math.max(1, pageInfo.width_pt)
    : 841.89 / 595.28;
  const canvasPxWidth = Math.round(680 * (zoom / 100));
  const canvasPxHeight = Math.round(canvasPxWidth * aspectRatio);

  const groupedPalette = FIELD_PALETTE.reduce<Record<string, typeof FIELD_PALETTE>>((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/75">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-slate-700 bg-slate-900 px-3 py-2 sm:px-5 sm:py-3 text-white overflow-x-auto mobile-scroll">
        <div className="flex items-center gap-2 sm:gap-3">
          <Layers className="h-5 w-5 text-indigo-400 shrink-0" />
          <div>
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs sm:text-sm font-semibold text-white focus:border-indigo-400 focus:outline-none touch-manipulation"
            />
            <span className="ml-3 hidden text-xs text-slate-400 md:inline">
              Click & drag on any blank to draw your own field box
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setDrawTool('draw_field')}
              className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 touch-manipulation ${
                drawTool === 'draw_field' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <PenTool className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Draw</span> Field
            </button>
            <button
              type="button"
              onClick={() => setDrawTool('select')}
              className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 touch-manipulation ${
                drawTool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <MousePointer className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Select /</span> Move
            </button>
            <button
              type="button"
              onClick={() => setDrawTool('draw_mask')}
              className={`inline-flex items-center gap-1 rounded-md px-2 sm:px-2.5 py-1 touch-manipulation ${
                drawTool === 'draw_mask' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Eraser className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Draw</span> Mask
            </button>
          </div>

          {embeddedWidgets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMappings((prev) => ({ ...prev, fields: embeddedWidgets }));
                setSelectedId(embeddedWidgets[0]?.id ?? null);
                setSelectedKind(embeddedWidgets[0] ? 'field' : null);
              }}
              className="rounded-lg border border-emerald-500/60 bg-emerald-600/20 px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/40 touch-manipulation"
            >
              Import PDF Fields ({embeddedWidgets.length})
            </button>
          )}

          {mappings.fields.length > 0 && (
            <>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.matchAllFieldStyles(template.id, mappings.fields);
                    if (res.fields) {
                      setMappings((prev) => ({ ...prev, fields: res.fields }));
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="hidden sm:inline-block rounded-lg border border-indigo-400/60 bg-indigo-600/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/40 touch-manipulation"
              >
                Match Template Fonts
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Remove all mapped fields from this template?')) {
                    setMappings((prev) => ({ ...prev, fields: [] }));
                    setSelectedId(null);
                    setSelectedKind(null);
                  }
                }}
                className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white touch-manipulation"
              >
                Clear
              </button>
            </>
          )}
          {template.page_count > 1 && (
            <div className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs">
              <span>Page:</span>
              {Array.from({ length: template.page_count }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`rounded px-2 py-0.5 touch-manipulation ${
                    currentPage === pg ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {pg}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs">
            <button onClick={() => setZoom((z) => Math.max(60, z - 15))} className="p-1 hover:text-indigo-300 touch-manipulation">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-9 sm:w-11 text-center">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(180, z + 15))} className="p-1 hover:text-indigo-300 touch-manipulation">
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 touch-manipulation"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 sm:px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 touch-manipulation"
          >
            <Save className="h-4 w-4" />
            <span className="truncate">{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Mobile/Tablet Workspace Mode Switcher */}
      <div className="flex items-center justify-around border-b border-slate-700 bg-slate-800 p-1.5 text-xs font-semibold text-slate-300 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileEditorTab('palette')}
          className={`flex-1 py-1.5 text-center rounded-md transition touch-manipulation ${
            mobileEditorTab === 'palette' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
          }`}
        >
          🎨 Palette
        </button>
        <button
          type="button"
          onClick={() => setMobileEditorTab('canvas')}
          className={`flex-1 py-1.5 text-center rounded-md transition touch-manipulation ${
            mobileEditorTab === 'canvas' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
          }`}
        >
          📄 Canvas
        </button>
        <button
          type="button"
          onClick={() => setMobileEditorTab('properties')}
          className={`flex-1 py-1.5 text-center rounded-md transition touch-manipulation ${
            mobileEditorTab === 'properties' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
          }`}
        >
          ⚙️ Properties
        </button>
      </div>

      {error && (
        <div className="bg-red-600 px-5 py-2 text-xs font-medium text-white">{error}</div>
      )}

      {/* Main 3-Pane Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Palette */}
        <div className={`w-full lg:w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3.5 sm:p-4 mobile-scroll ${mobileEditorTab === 'palette' ? 'block' : 'hidden lg:block'}`}>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab('fields')}
              className={`flex items-center justify-center gap-1 rounded-md py-1.5 ${
                activeTab === 'fields' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Type className="h-3.5 w-3.5" /> Fields
            </button>
            <button
              onClick={() => setActiveTab('masks')}
              className={`flex items-center justify-center gap-1 rounded-md py-1.5 ${
                activeTab === 'masks' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Eraser className="h-3.5 w-3.5" /> Erase
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center justify-center gap-1 rounded-md py-1.5 ${
                activeTab === 'table' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
          </div>

          {activeTab === 'fields' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Click any field below to place it onto the invoice template, then drag & resize it to align.
              </p>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                <div className="text-[11px] font-bold uppercase text-slate-600">Add Custom Field</div>
                <input
                  placeholder="Key (e.g. chassis_no)"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <input
                  placeholder="Label (e.g. Chassis No.)"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={addCustomField}
                  className="inline-flex w-full items-center justify-center gap-1 rounded bg-slate-800 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Place Custom Field
                </button>
              </div>

              {Object.entries(groupedPalette).map(([group, items]) => (
                <div key={group}>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {group}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => addPaletteField(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Plus className="h-3 w-3" /> {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'masks' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Add erase masks to hide old text on a filled/scanned invoice before placing new fields.
              </p>
              <button
                type="button"
                onClick={() => addMask('#FFFFFF')}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" /> Add White Erase Mask
              </button>
              <button
                type="button"
                onClick={() => addMask('#F9BF91')}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-orange-100 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-200"
              >
                <Plus className="h-4 w-4" /> Add Peach Header Mask
              </button>
              <div className="pt-2 text-xs font-semibold text-slate-700">
                Active Masks ({mappings.masks.filter((m) => m.page === currentPage).length})
              </div>
              <div className="space-y-1">
                {mappings.masks
                  .filter((m) => m.page === currentPage)
                  .map((m, idx) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedId(m.id);
                        setSelectedKind('mask');
                      }}
                      className={`flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-xs ${
                        selectedId === m.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'
                      }`}
                    >
                      <span>Mask #{idx + 1}</span>
                      <span
                        className="h-4 w-4 rounded border border-slate-300"
                        style={{ backgroundColor: m.color }}
                      />
                    </button>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold">
                <span>Enable Dynamic Items Table</span>
                <input
                  type="checkbox"
                  checked={mappings.items_table.enabled}
                  onChange={(e) =>
                    setMappings((prev) => ({
                      ...prev,
                      items_table: { ...prev.items_table, enabled: e.target.checked, page: currentPage },
                    }))
                  }
                  className="h-4 w-4 rounded text-indigo-600"
                />
              </label>

              <p className="text-xs text-slate-500">
                Toggle columns below, then drag the blue table box & column bars on the canvas.
              </p>

              <div className="space-y-1.5">
                {ITEM_COLUMN_KEYS.map((col) => {
                  const active = mappings.items_table.columns.some((c) => c.key === col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleTableColumn(col)}
                      className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{col.label}</span>
                      <span>{active ? 'Included' : '+ Add'}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500">Row Height %</label>
                    <input
                      type="number"
                      step="0.2"
                      min="1"
                      max="15"
                      value={mappings.items_table.row_height_pct}
                      onChange={(e) =>
                        setMappings((prev) => ({
                          ...prev,
                          items_table: {
                            ...prev.items_table,
                            row_height_pct: Number(e.target.value) || 3,
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Font Size (pt)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="6"
                      max="20"
                      value={mappings.items_table.font_size}
                      onChange={(e) =>
                        setMappings((prev) => ({
                          ...prev,
                          items_table: {
                            ...prev.items_table,
                            font_size: Number(e.target.value) || 9,
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mappings.items_table.show_grid_lines}
                    onChange={(e) =>
                      setMappings((prev) => ({
                        ...prev,
                        items_table: { ...prev.items_table, show_grid_lines: e.target.checked },
                      }))
                    }
                  />
                  <span>Draw PDF cell borders</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Center Interactive Template Canvas */}
        <div className={`flex-1 overflow-auto bg-slate-200 p-2 sm:p-6 mobile-scroll ${mobileEditorTab === 'canvas' ? 'block' : 'hidden lg:block'}`}>
          <div
            ref={canvasRef}
            onPointerDown={(e) => {
              if (drawTool === 'select') return;
              const el = canvasRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const ox = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
              const oy = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
              dragRef.current = {
                kind: 'draw',
                tool: drawTool === 'draw_mask' ? 'mask' : 'field',
                startX: e.clientX,
                startY: e.clientY,
                origX: ox,
                origY: oy,
              };
            }}
            style={{ width: `${canvasPxWidth}px`, height: `${canvasPxHeight}px` }}
            className={`relative mx-auto select-none overflow-hidden rounded bg-white shadow-xl ${
              drawTool !== 'select' ? 'cursor-crosshair' : ''
            }`}
          >
            <img
              src={api.getTemplatePageUrl(template.id, currentPage, template.updated_at)}
              alt="Template canvas"
              draggable={false}
              className="pointer-events-none h-full w-full object-fill"
            />

            {drawPreview && (
              <div
                style={{
                  left: `${drawPreview.x_pct}%`,
                  top: `${drawPreview.y_pct}%`,
                  width: `${drawPreview.w_pct}%`,
                  height: `${drawPreview.h_pct}%`,
                }}
                className={`pointer-events-none absolute z-50 border-2 border-dashed ${
                  drawTool === 'draw_mask'
                    ? 'border-amber-500 bg-amber-200/40'
                    : 'border-indigo-600 bg-indigo-500/20'
                }`}
              />
            )}

            {/* Erase Masks */}
            {mappings.masks
              .filter((m) => m.page === currentPage)
              .map((m) => {
                const isSel = selectedKind === 'mask' && selectedId === m.id;
                return (
                  <div
                    key={m.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(m.id);
                      setSelectedKind('mask');
                      dragRef.current = {
                        kind: 'mask',
                        id: m.id,
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: m.x_pct,
                        origY: m.y_pct,
                        origW: m.w_pct,
                        origH: m.h_pct,
                      };
                    }}
                    style={{
                      left: `${m.x_pct}%`,
                      top: `${m.y_pct}%`,
                      width: `${m.w_pct}%`,
                      height: `${m.h_pct}%`,
                      backgroundColor: m.color,
                    }}
                    className={`absolute cursor-move border ${
                      isSel ? 'z-30 border-2 border-amber-500 ring-2 ring-amber-300/60' : 'z-10 border-dashed border-amber-400'
                    }`}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(m.id);
                        setSelectedKind('mask');
                        dragRef.current = {
                          kind: 'mask',
                          id: m.id,
                          mode: 'resize',
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: m.x_pct,
                          origY: m.y_pct,
                          origW: m.w_pct,
                          origH: m.h_pct,
                        };
                      }}
                      className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm bg-amber-500"
                    />
                  </div>
                );
              })}

            {/* Dynamic Items Table Region */}
            {mappings.items_table.enabled && mappings.items_table.page === currentPage && (
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragRef.current = {
                    kind: 'table',
                    mode: 'move',
                    startY: e.clientY,
                    origYStart: mappings.items_table.y_start_pct,
                    origYEnd: mappings.items_table.y_end_pct,
                  };
                }}
                style={{
                  left: '2%',
                  width: '96%',
                  top: `${mappings.items_table.y_start_pct}%`,
                  height: `${Math.max(3, mappings.items_table.y_end_pct - mappings.items_table.y_start_pct)}%`,
                }}
                className="absolute z-20 cursor-ns-resize border-2 border-dashed border-sky-600 bg-sky-500/10"
              >
                <span className="absolute -top-5 left-1 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Items Table Zone (drag vertically)
                </span>
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = {
                      kind: 'table',
                      mode: 'resize',
                      startY: e.clientY,
                      origYStart: mappings.items_table.y_start_pct,
                      origYEnd: mappings.items_table.y_end_pct,
                    };
                  }}
                  className="absolute bottom-0 left-1/2 h-2.5 w-12 -translate-x-1/2 cursor-ns-resize rounded-t bg-sky-600"
                />
              </div>
            )}

            {/* Table Column Overlays */}
            {mappings.items_table.enabled &&
              mappings.items_table.page === currentPage &&
              mappings.items_table.columns.map((col) => {
                const isSel = selectedKind === 'col' && selectedId === col.id;
                return (
                  <div
                    key={col.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(col.id);
                      setSelectedKind('col');
                      dragRef.current = {
                        kind: 'col',
                        id: col.id,
                        mode: 'move',
                        startX: e.clientX,
                        origX: col.x_pct,
                        origW: col.w_pct,
                      };
                    }}
                    style={{
                      left: `${col.x_pct}%`,
                      top: `${mappings.items_table.y_start_pct}%`,
                      width: `${col.w_pct}%`,
                      height: `${mappings.items_table.row_height_pct}%`,
                    }}
                    className={`absolute z-30 flex cursor-ew-resize items-center justify-center truncate border bg-sky-100/80 px-1 text-[10px] font-semibold text-sky-900 ${
                      isSel ? 'border-2 border-sky-700 ring-2 ring-sky-400' : 'border-sky-500'
                    }`}
                  >
                    {col.label}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(col.id);
                        setSelectedKind('col');
                        dragRef.current = {
                          kind: 'col',
                          id: col.id,
                          mode: 'resize',
                          startX: e.clientX,
                          origX: col.x_pct,
                          origW: col.w_pct,
                        };
                      }}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-sky-600"
                    />
                  </div>
                );
              })}

            {/* Mapped Fields */}
            {mappings.fields
              .filter((f) => f.page === currentPage)
              .map((fld) => {
                const isSel = selectedKind === 'field' && selectedId === fld.id;
                return (
                  <div
                    key={fld.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(fld.id);
                      setSelectedKind('field');
                      dragRef.current = {
                        kind: 'field',
                        id: fld.id,
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: fld.x_pct,
                        origY: fld.y_pct,
                        origW: fld.w_pct,
                        origH: fld.h_pct,
                      };
                    }}
                    style={{
                      left: `${fld.x_pct}%`,
                      top: `${fld.y_pct}%`,
                      width: `${fld.w_pct}%`,
                      height: `${fld.h_pct}%`,
                      backgroundColor: fld.bg_color || 'rgba(79, 70, 229, 0.14)',
                    }}
                    className={`absolute flex cursor-move items-center overflow-hidden rounded-sm border px-1 text-[10px] font-semibold text-indigo-950 ${
                      isSel
                        ? 'z-40 border-2 border-indigo-600 ring-2 ring-indigo-300'
                        : 'z-20 border-indigo-500/80'
                    }`}
                  >
                    <span className="truncate">{fld.label || fld.field_key}</span>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(fld.id);
                        setSelectedKind('field');
                        dragRef.current = {
                          kind: 'field',
                          id: fld.id,
                          mode: 'resize',
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: fld.x_pct,
                          origY: fld.y_pct,
                          origW: fld.w_pct,
                          origH: fld.h_pct,
                        };
                      }}
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 cursor-nwse-resize rounded-tl bg-indigo-600"
                    />
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right Inspector */}
        <div className={`w-full lg:w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3.5 sm:p-4 mobile-scroll ${mobileEditorTab === 'properties' ? 'block' : 'hidden lg:block'}`}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Properties</h4>
            {(selectedField || selectedMask || selectedCol) && (
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>

          {!selectedField && !selectedMask && !selectedCol && (
            <p className="text-xs text-slate-500">
              Select a field, erase mask, or table column on the template canvas to adjust its font, alignment, color, or coordinates.
            </p>
          )}

          {selectedField && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-600">Field Key</label>
                <input
                  value={selectedField.field_key}
                  onChange={(e) => updateSelectedField({ field_key: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="font-medium text-slate-600">Display Label</label>
                <input
                  value={selectedField.label}
                  onChange={(e) => updateSelectedField({ label: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-600">Font Size</label>
                  <input
                    type="number"
                    step="0.5"
                    min="5"
                    max="48"
                    value={selectedField.font_size}
                    onChange={(e) => updateSelectedField({ font_size: Number(e.target.value) || 9.5 })}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-600">Weight</label>
                  <select
                    value={selectedField.font_weight}
                    onChange={(e) =>
                      updateSelectedField({ font_weight: e.target.value as 'normal' | 'bold' })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-600">Align</label>
                  <select
                    value={selectedField.align}
                    onChange={(e) =>
                      updateSelectedField({ align: e.target.value as 'left' | 'center' | 'right' })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-600">Text Color</label>
                  <input
                    type="color"
                    value={selectedField.color}
                    onChange={(e) => updateSelectedField({ color: e.target.value })}
                    className="mt-1 h-8 w-full rounded border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="font-medium text-slate-600">Optional Background Mask</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    placeholder="Empty = transparent"
                    value={selectedField.bg_color}
                    onChange={(e) => updateSelectedField({ bg_color: e.target.value })}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => updateSelectedField({ bg_color: selectedField.bg_color ? '' : '#FFFFFF' })}
                    className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                  >
                    {selectedField.bg_color ? 'Clear' : 'White'}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={selectedField.multiline}
                  onChange={(e) => updateSelectedField({ multiline: e.target.checked })}
                />
                <span>Multiline wrap</span>
              </label>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                <div>
                  <label className="text-[11px] text-slate-500">X %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedField.x_pct}
                    onChange={(e) => updateSelectedField({ x_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Y %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedField.y_pct}
                    onChange={(e) => updateSelectedField({ y_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Width %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedField.w_pct}
                    onChange={(e) => updateSelectedField({ w_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Height %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedField.h_pct}
                    onChange={(e) => updateSelectedField({ h_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedMask && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-600">Mask Fill Color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedMask.color}
                    onChange={(e) => updateSelectedMask({ color: e.target.value })}
                    className="h-8 w-12 rounded border border-slate-300"
                  />
                  <input
                    value={selectedMask.color}
                    onChange={(e) => updateSelectedMask({ color: e.target.value })}
                    className="flex-1 rounded border border-slate-300 px-2 py-1 font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500">X %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedMask.x_pct}
                    onChange={(e) => updateSelectedMask({ x_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Y %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedMask.y_pct}
                    onChange={(e) => updateSelectedMask({ y_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Width %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedMask.w_pct}
                    onChange={(e) => updateSelectedMask({ w_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Height %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedMask.h_pct}
                    onChange={(e) => updateSelectedMask({ h_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedCol && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-600">Column Header Label</label>
                <input
                  value={selectedCol.label}
                  onChange={(e) => updateSelectedCol({ label: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="font-medium text-slate-600">Alignment</label>
                <select
                  value={selectedCol.align}
                  onChange={(e) =>
                    updateSelectedCol({ align: e.target.value as 'left' | 'center' | 'right' })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500">X %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedCol.x_pct}
                    onChange={(e) => updateSelectedCol({ x_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Width %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedCol.w_pct}
                    onChange={(e) => updateSelectedCol({ w_pct: Number(e.target.value) })}
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Name / Field Assignment Dialog after Drawing a Box */}
      {pendingBox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h4 className="text-base font-bold text-slate-900">Name Your Field</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              Type any custom field name you want for this box, or click a quick option below.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDrawnField(pendingLabel);
              }}
              className="mt-3 space-y-3"
            >
              <input
                autoFocus
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                placeholder="e.g. Customer Name, Phone, Chassis No, Date..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={pendingMultiline}
                  onChange={(e) => setPendingMultiline(e.target.checked)}
                />
                Allow multiple lines (for addresses / long text)
              </label>

              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase text-slate-500">
                  Or Pick a Standard Field
                </div>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {FIELD_PALETTE.slice(0, 18).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => createDrawnField(p.label, p.key, p.multiline)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingBox(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Add Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
