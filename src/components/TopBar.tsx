import {
  Activity,
  Code2,
  Cpu,
  Database,
  Play,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import type { WorkspaceTab } from '../types/modelroute';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  isTraining: boolean;
  onRunTraining: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: typeof Activity;
}> = [
  { id: 'benchmark', label: 'Benchmark & Router', icon: Activity },
  { id: 'training', label: 'QLoRA Training', icon: Cpu },
  { id: 'dataset', label: 'Dataset (3k)', icon: Database },
  { id: 'playground', label: 'Inference API', icon: Terminal },
  { id: 'code', label: 'Code & Serving', icon: Code2 },
];

export function TopBar({
  activeTab,
  onSelectTab,
  isTraining,
  onRunTraining,
  sidebarOpen,
  onToggleSidebar,
}: TopBarProps) {
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white">
      <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
        {/* Zone 1: Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label="Toggle hyperparameter sidebar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-display text-base font-bold tracking-tight text-slate-900">
              ModelRoute
            </span>
            <span className="hidden sm:inline text-xs text-slate-400">·</span>
            <span className="hidden sm:inline text-xs font-medium text-slate-500">
              QLoRA Distillation &amp; Inference Router
            </span>
          </div>
        </div>

        {/* Zone 2: Primary Navigation (Desktop) */}
        <nav
          aria-label="Workspace navigation"
          className="hidden md:flex items-center gap-1 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <button
          type="button"
          onClick={onRunTraining}
          disabled={isTraining}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3.5 py-1.5 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-sky-800 disabled:opacity-60"
        >
          <Play className={`h-3.5 w-3.5 ${isTraining ? 'animate-pulse' : ''}`} />
          <span>{isTraining ? 'Fine-Tuning...' : 'Start QLoRA Fine-Tuning'}</span>
        </button>
      </div>

      {/* Mobile Workspace Navigation */}
      <nav
        aria-label="Mobile workspace navigation"
        className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
