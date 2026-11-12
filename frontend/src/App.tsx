import React, { useEffect, useState } from 'react';
import {
  FileCheck2,
  FilePlus2,
  History,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Receipt,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { api } from './api';
import { DashboardView } from './components/DashboardView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoicesListView } from './components/InvoicesListView';
import { SettingsView } from './components/SettingsView';
import { TemplateEditorModal } from './components/TemplateEditorModal';
import { TemplatesView } from './components/TemplatesView';
import type {
  AppSettings,
  DashboardStats,
  InvoiceRecord,
  InvoiceTemplate,
  NavSection,
} from './types';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'templates', label: 'My Invoice Templates', icon: LayoutTemplate },
  { id: 'create', label: 'Create New Invoice', icon: FilePlus2 },
  { id: 'generated', label: 'Generated Invoices', icon: FileCheck2 },
  { id: 'history', label: 'Invoice History', icon: History },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function App() {
  const [section, setSection] = useState<NavSection>('create');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplate | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [preferredTemplateId, setPreferredTemplateId] = useState<string | null>(null);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [bootError, setBootError] = useState('');

  const refreshAll = async () => {
    try {
      const [d, t, s] = await Promise.all([
        api.getDashboard(),
        api.listTemplates(),
        api.getSettings(),
      ]);
      setStats(d);
      setTemplates(t);
      setSettings(s);
      setBootError('');
    } catch (err: any) {
      setBootError(err.message || 'Unable to connect to SmartInvoice backend API');
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const handleOpenInvoiceById = async (id: string) => {
    try {
      const inv = await api.getInvoice(id);
      setEditingInvoice(inv);
      setPreferredTemplateId(inv.template_id);
      setSection('create');
    } catch (err: any) {
      setBootError(err.message || 'Failed to load invoice');
    }
  };

  const navigate = (sec: NavSection) => {
    if (sec === 'create' && section !== 'create') {
      // Starting fresh when clicking Create New Invoice from nav
      setEditingInvoice(null);
      setPreferredTemplateId(null);
    }
    setSection(sec);
    setMobileOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-white">SmartInvoice</div>
          <div className="text-[11px] text-slate-400">Template-Exact Studio</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
        <div>Saved Templates: {templates.length}</div>
        <div>Generated Invoices: {stats?.total_invoices ?? 0}</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 lg:block">{renderSidebarContent()}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-64">{renderSidebarContent()}</div>
          <div
            className="flex-1 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-bold text-slate-900">SmartInvoice Studio</span>
          <div className="w-8" />
        </header>

        {bootError && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {bootError}
          </div>
        )}

        <main className="flex-1">
          {section === 'dashboard' && (
            <DashboardView
              stats={stats}
              onNavigate={navigate}
              onOpenInvoice={handleOpenInvoiceById}
            />
          )}

          {section === 'templates' && (
            <TemplatesView
              templates={templates}
              onRefresh={refreshAll}
              onEditTemplate={(tpl) => setEditingTemplate(tpl)}
              onUseTemplate={(tpl) => {
                setEditingInvoice(null);
                setPreferredTemplateId(tpl.id);
                setEditorResetKey((k) => k + 1);
                setSection('create');
              }}
            />
          )}

          {section === 'create' && settings && (
            <InvoiceEditor
              key={`${editingInvoice?.id || 'new'}-${preferredTemplateId || 'def'}-${editorResetKey}`}
              templates={templates}
              settings={settings}
              editingInvoice={editingInvoice}
              initialTemplateId={preferredTemplateId}
              onOpenTemplateEditor={(tpl) => setEditingTemplate(tpl)}
              onSaved={() => {
                refreshAll();
              }}
              onNewBlank={() => {
                setEditingInvoice(null);
                setEditorResetKey((k) => k + 1);
              }}
            />
          )}

          {section === 'generated' && (
            <InvoicesListView
              title="Generated Invoices"
              subtitle="Download, print, edit, or regenerate PDFs for your generated invoices."
              templates={templates}
              onEditInvoice={(inv) => {
                setEditingInvoice(inv);
                setPreferredTemplateId(inv.template_id);
                setSection('create');
              }}
              onRefreshAll={refreshAll}
            />
          )}

          {section === 'history' && (
            <InvoicesListView
              title="Invoice History"
              subtitle="Search and filter all past invoices by date, customer, or template, and duplicate any invoice."
              templates={templates}
              onEditInvoice={(inv) => {
                setEditingInvoice(inv);
                setPreferredTemplateId(inv.template_id);
                setSection('create');
              }}
              onRefreshAll={refreshAll}
            />
          )}

          {section === 'settings' && settings && (
            <SettingsView
              settings={settings}
              onUpdated={(s) => setSettings(s)}
              onRestored={refreshAll}
            />
          )}
        </main>
      </div>

      {editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={async () => {
            setEditingTemplate(null);
            await refreshAll();
          }}
        />
      )}
    </div>
  );
}

export default App;
