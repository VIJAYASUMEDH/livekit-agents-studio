import { useEffect, useMemo, useState } from 'react';
import { BenchmarkRouterView } from './components/BenchmarkRouterView';
import { CodeServingView } from './components/CodeServingView';
import { DatasetView } from './components/DatasetView';
import { ModelConfigSidebar } from './components/ModelConfigSidebar';
import { PlaygroundView } from './components/PlaygroundView';
import { TopBar } from './components/TopBar';
import { TrainingView } from './components/TrainingView';
import { DEFAULT_QLORA_CONFIG } from './lib/qloraTrainer';
import { evaluateConfidenceRouter } from './lib/routerEngine';
import type {
  DatasetSummary,
  QLoRAConfig,
  TrainingRunResult,
  WorkspaceTab,
} from './types/modelroute';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('benchmark');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [config, setConfig] = useState<QLoRAConfig>(DEFAULT_QLORA_CONFIG);
  const [activeRun, setActiveRun] = useState<TrainingRunResult | null>(null);
  const [datasetSummary, setDatasetSummary] = useState<DatasetSummary | null>(null);
  const [isLoadingState, setIsLoadingState] = useState<boolean>(true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialState() {
      setIsLoadingState(true);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/modelroute/state');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load ModelRoute platform state.');
        }
        if (!cancelled) {
          setDatasetSummary(data.datasetSummary as DatasetSummary);
          setActiveRun(data.run as TrainingRunResult);
          setConfig((data.run as TrainingRunResult).config);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(
            err instanceof Error ? err.message : 'Unable to connect to ModelRoute backend.'
          );
        }
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    }
    void loadInitialState();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRunMatchesConfig = useMemo(() => {
    if (!activeRun) return true;
    const c = activeRun.config;
    return (
      c.baseModel === config.baseModel &&
      c.quantization === config.quantization &&
      c.loraRank === config.loraRank &&
      c.loraAlpha === config.loraAlpha &&
      c.epochs === config.epochs &&
      c.learningRate === config.learningRate
    );
  }, [activeRun, config]);

  async function handleRunTraining() {
    setIsTraining(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/modelroute/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'QLoRA fine-tuning failed.');
      }
      setDatasetSummary(data.datasetSummary as DatasetSummary);
      setActiveRun(data.run as TrainingRunResult);
      setSidebarOpen(false);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'QLoRA fine-tuning failed.'
      );
    } finally {
      setIsTraining(false);
    }
  }

  async function handleChangeThreshold(nextThreshold: number) {
    const rounded = Number(Math.min(0.95, Math.max(0.5, nextThreshold)).toFixed(2));
    setConfig((prev) => ({ ...prev, confidenceThreshold: rounded }));

    if (activeRun) {
      const optimisticSummary = evaluateConfidenceRouter({
        evalRecords: activeRun.evalRecords,
        frontierBaseline: activeRun.frontierBaseline,
        studentModel: activeRun.studentModel,
        confidenceThreshold: rounded,
      });
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              config: { ...prev.config, confidenceThreshold: rounded },
              routedSummary: optimisticSummary,
            }
          : prev
      );
    }

    try {
      const res = await fetch('/api/modelroute/route-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confidenceThreshold: rounded }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRun((prev) =>
          prev
            ? {
                ...prev,
                config: { ...prev.config, confidenceThreshold: rounded },
                routedSummary: data.routedSummary,
              }
            : prev
        );
      }
    } catch {
      // Optimistic local calculation already updated state cleanly
    }
  }

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isTraining={isTraining}
        onRunTraining={() => void handleRunTraining()}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      {errorBanner && (
        <div
          role="alert"
          className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 flex items-center justify-between"
        >
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <ModelConfigSidebar
          open={sidebarOpen}
          config={config}
          onChangeConfig={setConfig}
          onChangeThreshold={(t) => void handleChangeThreshold(t)}
          onRunTraining={() => void handleRunTraining()}
          isTraining={isTraining}
          routedSummary={activeRun?.routedSummary ?? null}
          activeRunMatchesConfig={activeRunMatchesConfig}
        />

        <main className="flex-1 min-h-0 min-w-0 h-full overflow-hidden">
          {isLoadingState || !activeRun || !datasetSummary ? (
            <div className="h-full flex items-center justify-center p-8 text-sm text-slate-500">
              Initializing 3,000-ticket benchmark &amp; QLoRA student adapter...
            </div>
          ) : (
            <>
              {activeTab === 'benchmark' && (
                <BenchmarkRouterView
                  run={activeRun}
                  onSelectThreshold={(t) => void handleChangeThreshold(t)}
                />
              )}

              {activeTab === 'training' && <TrainingView run={activeRun} />}

              {activeTab === 'dataset' && (
                <DatasetView summary={datasetSummary} />
              )}

              {activeTab === 'playground' && (
                <PlaygroundView confidenceThreshold={config.confidenceThreshold} />
              )}

              {activeTab === 'code' && <CodeServingView config={config} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
