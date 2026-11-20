import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  DEFAULT_QLORA_CONFIG,
  predictWithFrontierTeacher,
  predictWithTrainedStudent,
  trainQLoRAStudent,
  type TrainedStudentModel,
} from './src/lib/qloraTrainer.ts';
import { evaluateConfidenceRouter } from './src/lib/routerEngine.ts';
import {
  ALL_INTENTS,
  formatDatasetJsonl,
  generateSupportDataset,
  INTENT_META,
  summarizeDataset,
} from './src/lib/ticketDataset.ts';
import type {
  LivePredictionResult,
  QLoRAConfig,
  TicketIntent,
  TrainingRunResult,
} from './src/types/modelroute.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const dataset = generateSupportDataset(2400, 600, 20260415);
const datasetSummary = summarizeDataset(dataset);
const trainTickets = dataset.filter((t) => t.split === 'train');
const evalTickets = dataset.filter((t) => t.split === 'eval');

let activeRun: {
  model: TrainedStudentModel;
  result: TrainingRunResult;
} = trainQLoRAStudent(trainTickets, evalTickets, DEFAULT_QLORA_CONFIG);

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isValidIntent(val: unknown): val is TicketIntent {
  return typeof val === 'string' && ALL_INTENTS.includes(val as TicketIntent);
}

async function classifyWithGeminiFrontier(text: string): Promise<{
  intent: TicketIntent;
  confidence: number;
  latencyMs: number;
  provider: 'gemini-4-hydrogen' | 'frontier-teacher';
}> {
  const ai = getGenAIClient();
  if (!ai) {
    const teacher = predictWithFrontierTeacher(text);
    return { ...teacher, provider: 'frontier-teacher' };
  }

  const start = performance.now();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Classify this enterprise support ticket into exactly one intent from [${ALL_INTENTS.join(', ')}].\n\nTicket:\n${text}`,
      config: {
        systemInstruction:
          'You are an enterprise support ticket triage model. Choose the single primary intent from the allowed enum and output calibrated confidence between 0.5 and 0.99.',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: ALL_INTENTS,
            },
            confidence: {
              type: Type.NUMBER,
            },
          },
          required: ['intent', 'confidence'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      intent?: unknown;
      confidence?: unknown;
    };

    if (isValidIntent(parsed.intent)) {
      const conf =
        typeof parsed.confidence === 'number' &&
        Number.isFinite(parsed.confidence)
          ? Number(Math.min(0.99, Math.max(0.5, parsed.confidence)).toFixed(4))
          : 0.95;
      return {
        intent: parsed.intent,
        confidence: conf,
        latencyMs: Number(Math.max(120, performance.now() - start).toFixed(1)),
        provider: 'gemini-4-hydrogen',
      };
    }
  } catch {
    // Gracefully fall back to deterministic frontier teacher when API quota or network fails
  }

  const teacher = predictWithFrontierTeacher(text);
  return { ...teacher, provider: 'frontier-teacher' };
}

function sanitizeConfig(input: Partial<QLoRAConfig> | undefined): QLoRAConfig {
  const rank =
    input?.loraRank === 8 ||
    input?.loraRank === 16 ||
    input?.loraRank === 32 ||
    input?.loraRank === 64
      ? input.loraRank
      : DEFAULT_QLORA_CONFIG.loraRank;

  const baseModel =
    input?.baseModel === 'qwen-2.5-3b-instruct' ||
    input?.baseModel === 'llama-3.1-8b-instruct' ||
    input?.baseModel === 'mistral-7b-v0.3'
      ? input.baseModel
      : DEFAULT_QLORA_CONFIG.baseModel;

  const quantization =
    input?.quantization === 'nf4-4bit' ||
    input?.quantization === 'int8-8bit' ||
    input?.quantization === 'fp16-lora'
      ? input.quantization
      : DEFAULT_QLORA_CONFIG.quantization;

  const epochs =
    typeof input?.epochs === 'number'
      ? Math.min(5, Math.max(1, Math.round(input.epochs)))
      : DEFAULT_QLORA_CONFIG.epochs;

  const loraAlpha =
    typeof input?.loraAlpha === 'number'
      ? Math.min(128, Math.max(8, Math.round(input.loraAlpha)))
      : rank * 2;

  const learningRate =
    typeof input?.learningRate === 'number' && input.learningRate > 0
      ? Math.min(1e-3, Math.max(1e-5, input.learningRate))
      : DEFAULT_QLORA_CONFIG.learningRate;

  const confidenceThreshold =
    typeof input?.confidenceThreshold === 'number'
      ? Number(Math.min(0.95, Math.max(0.5, input.confidenceThreshold)).toFixed(2))
      : DEFAULT_QLORA_CONFIG.confidenceThreshold;

  return {
    baseModel,
    quantization,
    loraRank: rank,
    loraAlpha,
    epochs,
    learningRate,
    confidenceThreshold,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      activeRunId: activeRun.result.runId,
      datasetTotal: dataset.length,
    });
  });

  app.get('/api/modelroute/dataset', (req, res) => {
    const split = String(req.query.split || 'all');
    const intent = String(req.query.intent || 'all');
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const filtered = dataset.filter((item) => {
      if (split !== 'all' && item.split !== split) return false;
      if (intent !== 'all' && item.intent !== intent) return false;
      if (
        q &&
        !item.id.toLowerCase().includes(q) &&
        !item.subject.toLowerCase().includes(q) &&
        !item.body.toLowerCase().includes(q) &&
        !item.targetQueue.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    res.json({
      summary: datasetSummary,
      totalFiltered: filtered.length,
      items: filtered.slice(offset, offset + limit),
    });
  });

  app.get('/api/modelroute/dataset/export', (req, res) => {
    const split = req.query.split === 'eval' ? 'eval' : 'train';
    const content = formatDatasetJsonl(dataset, split);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="modelroute-${split}.jsonl"`
    );
    res.send(content);
  });

  app.get('/api/modelroute/state', (_req, res) => {
    res.json({
      datasetSummary,
      run: activeRun.result,
    });
  });

  app.post('/api/modelroute/train', (req, res) => {
    try {
      const nextConfig = sanitizeConfig(req.body as Partial<QLoRAConfig>);
      activeRun = trainQLoRAStudent(trainTickets, evalTickets, nextConfig);
      res.json({
        datasetSummary,
        run: activeRun.result,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'QLoRA fine-tuning failed.',
      });
    }
  });

  app.post('/api/modelroute/route-eval', (req, res) => {
    try {
      const { confidenceThreshold } = req.body as {
        confidenceThreshold?: number;
      };
      const threshold =
        typeof confidenceThreshold === 'number'
          ? Number(Math.min(0.95, Math.max(0.5, confidenceThreshold)).toFixed(2))
          : activeRun.result.config.confidenceThreshold;

      const routedSummary = evaluateConfidenceRouter({
        evalRecords: activeRun.result.evalRecords,
        frontierBaseline: activeRun.result.frontierBaseline,
        studentModel: activeRun.result.studentModel,
        confidenceThreshold: threshold,
      });

      activeRun.result = {
        ...activeRun.result,
        config: {
          ...activeRun.result.config,
          confidenceThreshold: threshold,
        },
        routedSummary,
      };

      res.json({
        confidenceThreshold: threshold,
        routedSummary,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Router evaluation failed.',
      });
    }
  });

  app.post('/api/modelroute/predict', async (req, res) => {
    try {
      const { text, confidenceThreshold, forceFrontier = false } = req.body as {
        text?: string;
        confidenceThreshold?: number;
        forceFrontier?: boolean;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Support ticket text is required.' });
        return;
      }

      const threshold =
        typeof confidenceThreshold === 'number'
          ? Number(Math.min(0.95, Math.max(0.5, confidenceThreshold)).toFixed(2))
          : activeRun.result.config.confidenceThreshold;

      const studentPred = predictWithTrainedStudent(activeRun.model, text);
      const studentCost = activeRun.result.studentModel.costPer1kUsd;
      const frontierCost = activeRun.result.frontierBaseline.costPer1kUsd;
      const estimatedTokens = Math.round(64 + text.trim().length / 4.2 + 28);

      if (!forceFrontier && studentPred.confidence >= threshold) {
        const meta = INTENT_META[studentPred.topIntent];
        const payload: LivePredictionResult = {
          ticketText: text.trim(),
          routedTo: 'qlora-student',
          routeReason: `Student confidence ${(studentPred.confidence * 100).toFixed(1)}% >= threshold ${(threshold * 100).toFixed(0)}%`,
          confidenceThreshold: threshold,
          predictedIntent: studentPred.topIntent,
          targetQueue: meta.queue,
          priority: meta.priority,
          confidence: studentPred.confidence,
          studentTopIntent: studentPred.topIntent,
          studentConfidence: studentPred.confidence,
          frontierProvider: 'frontier-teacher',
          probabilities: studentPred.probabilities,
          latencyMs: studentPred.latencyMs,
          estimatedTokens,
          estimatedCostPer1kUsd: studentCost,
          baselineCostPer1kUsd: frontierCost,
        };
        res.json(payload);
        return;
      }

      const frontierPred = await classifyWithGeminiFrontier(text);
      const meta = INTENT_META[frontierPred.intent];
      const payload: LivePredictionResult = {
        ticketText: text.trim(),
        routedTo: 'frontier-fallback',
        routeReason: forceFrontier
          ? 'Forced Frontier comparison mode enabled'
          : `Student confidence ${(studentPred.confidence * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(0)}% — escalated to Frontier`,
        confidenceThreshold: threshold,
        predictedIntent: frontierPred.intent,
        targetQueue: meta.queue,
        priority: meta.priority,
        confidence: frontierPred.confidence,
        studentTopIntent: studentPred.topIntent,
        studentConfidence: studentPred.confidence,
        frontierProvider: frontierPred.provider,
        probabilities: studentPred.probabilities,
        latencyMs: Number((studentPred.latencyMs + frontierPred.latencyMs).toFixed(1)),
        estimatedTokens: estimatedTokens + 336,
        estimatedCostPer1kUsd: Number((studentCost + frontierCost).toFixed(3)),
        baselineCostPer1kUsd: frontierCost,
      };
      res.json(payload);
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Inference prediction failed.',
      });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ModelRoute Platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
