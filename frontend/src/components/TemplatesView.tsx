import React, { useRef, useState } from 'react';
import {
  Check,
  Edit3,
  FileText,
  PlusCircle,
  RefreshCw,
  Sliders,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { InvoiceTemplate } from '../types';

interface TemplatesViewProps {
  templates: InvoiceTemplate[];
  onRefresh: () => Promise<void>;
  onEditTemplate: (tpl: InvoiceTemplate) => void;
  onUseTemplate: (tpl: InvoiceTemplate) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  templates,
  onRefresh,
  onEditTemplate,
  onUseTemplate,
}) => {
  const [name, setName] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const created = await api.uploadTemplate(file, name, setAsDefault);
      setName('');
      await onRefresh();
      // Immediately open visual editor / inspector on newly uploaded template
      onEditTemplate(created);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReplace = async (file: File) => {
    if (!replaceTargetId) return;
    setError('');
    try {
      await api.replaceTemplateFile(replaceTargetId, file, true);
      await onRefresh();
    } catch (err: any) {
      setError(err.message || 'Replace failed');
    } finally {
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleRename = async (id: string) => {
    if (!renameVal.trim()) return;
    try {
      await api.updateTemplate(id, { name: renameVal.trim() });
      setRenamingId(null);
      await onRefresh();
    } catch (err: any) {
      setError(err.message || 'Rename failed');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Invoice Templates</h1>
        <p className="text-sm text-slate-500">
          Upload your existing PDF, DOCX, PNG, or JPG invoice template once. Map editable fields visually and reuse forever.
        </p>
      </div>

      {/* Upload Box */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="text-xs font-semibold uppercase text-slate-600">
              Template Name (Optional)
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ADMS Tax Invoice"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="md:col-span-3">
            <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="h-4 w-4 rounded text-indigo-600"
              />
              Set as default template
            </label>
          </div>
          <div className="md:col-span-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Processing Template...' : 'Upload Template (PDF, DOCX, PNG, JPG)'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.docx,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleReplace(f);
        }}
      />

      {/* Saved Templates Grid */}
      {templates.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No templates saved yet. Upload your first invoice template above.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${
                tpl.is_default ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'
              }`}
            >
              {/* Preview Thumbnail */}
              <div className="relative h-56 overflow-hidden border-b border-slate-200 bg-slate-100">
                {tpl.mode === 'background' && tpl.preview_images.length > 0 ? (
                  <img
                    src={api.getTemplatePageUrl(tpl.id, 1, tpl.updated_at)}
                    alt={tpl.name}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <FileText className="h-12 w-12 text-indigo-500" />
                    <div className="mt-2 text-sm font-bold text-slate-800">DOCX Template</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {tpl.docx_placeholders.length} placeholders detected
                    </div>
                  </div>
                )}

                <div className="absolute left-3 top-3 flex gap-1.5">
                  <span className="rounded bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    {tpl.file_type}
                  </span>
                  {tpl.is_default && (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col p-4">
                {renamingId === tpl.id ? (
                  <div className="flex gap-1.5">
                    <input
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleRename(tpl.id)}
                      className="rounded bg-indigo-600 px-2.5 text-white hover:bg-indigo-700"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900">{tpl.name}</h3>
                      <p className="text-xs text-slate-500">
                        {tpl.mode === 'background'
                          ? `${tpl.field_mappings.fields.length} mapped fields · ${tpl.field_mappings.masks.length} masks`
                          : `${tpl.docx_placeholders.length} DOCX placeholders`}
                      </p>
                    </div>
                    <button
                      title="Rename"
                      onClick={() => {
                        setRenamingId(tpl.id);
                        setRenameVal(tpl.name);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => onUseTemplate(tpl)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> Use Template
                  </button>
                  <button
                    onClick={() => onEditTemplate(tpl)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Sliders className="h-3.5 w-3.5" />{' '}
                    {tpl.mode === 'docx' ? 'Inspect' : 'Map Fields'}
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                  {!tpl.is_default ? (
                    <button
                      onClick={() => api.setDefaultTemplate(tpl.id).then(onRefresh)}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Set as Default
                    </button>
                  ) : (
                    <span className="font-medium text-emerald-600">Active Default</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplaceTargetId(tpl.id);
                        replaceInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Replace
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete template "${tpl.name}"?`)) {
                          api.deleteTemplate(tpl.id).then(onRefresh);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
