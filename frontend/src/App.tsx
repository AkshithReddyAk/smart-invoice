import React, { useEffect, useState } from 'react';
import {
  FileCheck2,
  FilePlus2,
  History,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  LogOut,
  Menu,
  Receipt,
  RefreshCw,
  Settings as SettingsIcon,
  Unlock,
  X,
} from 'lucide-react';
import { api } from './api';
import { DashboardView } from './components/DashboardView';
import { InvoiceEditor } from './components/InvoiceEditor';
import { InvoicesListView } from './components/InvoicesListView';
import { LoginPage } from './components/LoginPage';
import { PasswordModal } from './components/PasswordModal';
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
  const [currentUser, setCurrentUser] = useState<{
    phone: string;
    token: string;
    role: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('smart_invoice_auth_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

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
  const [isTemplateUnlocked, setIsTemplateUnlocked] = useState<boolean>(false);
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  // Automatically lock templates whenever navigating away from 'templates'
  useEffect(() => {
    if (section !== 'templates') {
      sessionStorage.removeItem('smart_invoice_template_unlocked');
      setIsTemplateUnlocked(false);
    }
  }, [section]);

  const handleLogout = () => {
    localStorage.removeItem('smart_invoice_auth_session');
    sessionStorage.removeItem('smart_invoice_template_unlocked');
    setIsTemplateUnlocked(false);
    setSection('create');
    setEditingInvoice(null);
    setPreferredTemplateId(null);
    setCurrentUser(null);
  };

  const checkTemplateAuth = (
    action: () => void,
    title = 'Admin Password Required',
    description = 'Enter the password to access invoice templates and editing.'
  ) => {
    if (isTemplateUnlocked && section === 'templates') {
      action();
    } else {
      setPasswordModal({
        isOpen: true,
        title,
        description,
        action: () => {
          setIsTemplateUnlocked(true);
          action();
        },
      });
    }
  };

  const lockTemplates = () => {
    sessionStorage.removeItem('smart_invoice_template_unlocked');
    setIsTemplateUnlocked(false);
    if (section === 'templates') {
      setSection('create');
    }
  };

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
    if (sec === 'templates') {
      if (isTemplateUnlocked && section === 'templates') {
        return;
      }
      checkTemplateAuth(
        () => {
          setIsTemplateUnlocked(true);
          setSection('templates');
          setMobileOpen(false);
        },
        'Access Invoice Templates',
        'Please enter the password (Ak@200419) to view and manage invoice templates.'
      );
      return;
    }

    // Auto-lock templates whenever navigating to any other section
    setIsTemplateUnlocked(false);
    sessionStorage.removeItem('smart_invoice_template_unlocked');

    if (sec === 'create' && section !== 'create') {
      // Starting fresh when clicking Create New Invoice from nav
      setEditingInvoice(null);
      setPreferredTemplateId(null);
    }
    setSection(sec);
    setMobileOpen(false);
  };

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-white truncate">SmartInvoice</div>
            <div className="text-[11px] text-slate-400 truncate">Template-Exact Studio</div>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto mobile-scroll">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          const isLockedTemplate = item.id === 'templates' && !isTemplateUnlocked;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors touch-manipulation ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
              {item.id === 'templates' && (
                isLockedTemplate ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    <Lock className="h-2.5 w-2.5" /> PIN
                  </span>
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      lockTemplates();
                    }}
                    title="Click to lock templates"
                    className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                  >
                    <Unlock className="h-2.5 w-2.5" /> Lock
                  </span>
                )
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-3 text-xs text-slate-400 space-y-2">
        <div className="flex items-center justify-between text-[11px] px-1">
          <span>Templates: {templates.length}</span>
          <span>Invoices: {stats?.total_invoices ?? 0}</span>
        </div>

        {/* User Session Info & Logout Button */}
        {currentUser && (
          <div className="flex items-center justify-between rounded-xl bg-slate-800/80 p-2.5 border border-slate-700/60 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Authorized
              </div>
              <div className="text-xs font-semibold text-white truncate">+91 {currentUser.phone}</div>
              <div className="text-[10px] text-slate-400 truncate">{currentUser.role}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out from SmartInvoice"
              className="ml-2 rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition touch-manipulation"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(u) => {
          setCurrentUser(u);
          setSection('create');
          setEditingInvoice(null);
          setPreferredTemplateId(null);
          setEditorResetKey((k) => k + 1);
          refreshAll();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 lg:block">{renderSidebarContent(false)}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-72 max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </div>
          <div
            className="flex-1 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Mobile Header */}
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3 lg:hidden shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 touch-manipulation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-slate-900 truncate">SmartInvoice</span>
              <span className="hidden sm:inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 truncate">
                {NAV_ITEMS.find((n) => n.id === section)?.label}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 touch-manipulation"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden xs:inline">Logout</span>
          </button>
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
              onEditTemplate={(tpl) => {
                checkTemplateAuth(
                  () => setEditingTemplate(tpl),
                  'Unlock Edit Fields',
                  'Please enter the password (Ak@200419) to adjust and edit template fields.'
                );
              }}
              onUseTemplate={(tpl) => {
                setEditingInvoice(null);
                setPreferredTemplateId(tpl.id);
                setEditorResetKey((k) => k + 1);
                setSection('create');
              }}
            />
          )}

          {section === 'create' && (
            settings ? (
              <InvoiceEditor
                key={`${editingInvoice?.id || 'new'}-${preferredTemplateId || 'def'}-${editorResetKey}`}
                templates={templates}
                settings={settings}
                editingInvoice={editingInvoice}
                initialTemplateId={preferredTemplateId}
                onOpenTemplateEditor={(tpl) => {
                  checkTemplateAuth(
                    () => setEditingTemplate(tpl),
                    'Unlock Edit Fields',
                    'Please enter the password (Ak@200419) to adjust and edit template fields.'
                  );
                }}
                onSaved={() => {
                  refreshAll();
                }}
                onNewBlank={() => {
                  setEditingInvoice(null);
                  setEditorResetKey((k) => k + 1);
                }}
              />
            ) : (
              <div className="flex h-96 items-center justify-center">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-500">
                  <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
                  <span>Loading Create New Invoice...</span>
                </div>
              </div>
            )
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
              currentUserPhone={currentUser?.phone}
              onUpdated={(s) => setSettings(s)}
              onRestored={refreshAll}
            />
          )}
        </main>
      </div>

      {editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setEditingTemplate(null);
            setIsTemplateUnlocked(false);
            sessionStorage.removeItem('smart_invoice_template_unlocked');
          }}
          onSaved={async () => {
            setEditingTemplate(null);
            setIsTemplateUnlocked(false);
            sessionStorage.removeItem('smart_invoice_template_unlocked');
            await refreshAll();
          }}
        />
      )}

      {passwordModal?.isOpen && (
        <PasswordModal
          title={passwordModal.title}
          description={passwordModal.description}
          currentUserPhone={currentUser?.phone}
          onSuccess={() => {
            const act = passwordModal.action;
            setPasswordModal(null);
            act();
          }}
          onClose={() => setPasswordModal(null)}
        />
      )}
    </div>
  );
}

export default App;
