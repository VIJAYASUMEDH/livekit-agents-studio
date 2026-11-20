import { normalizeAndVerifyExtraction } from './transcriptExtractor.ts';
import type {
  ActionItem,
  ClassificationMetrics,
  CommitmentType,
  EvalMeetingCase,
  EvalMeetingCaseResult,
  EvalMetricsResult,
  GoldEvalActionItem,
  RawMeetingExtraction,
} from '../types/actiongraph.ts';

export const GOLD_EVAL_CASES: EvalMeetingCase[] = [
  {
    id: 'eval-01',
    title: 'API Gateway Rate-Limit Incident Review',
    meetingDate: '2026-11-10',
    transcript: [
      'Rachel: Let us review the gateway throttling spike. Coffee in the west kitchen is out again, just kidding.',
      'Rachel: Decision: We are raising burst quota to 1,200 req/s for verified enterprise keys.',
      'Tomas: I will ship the Redis token-bucket patch by Friday.',
      'Nina: I will take a look at why Grafana latency percentiles lagged by four minutes.',
      'Tomas: Someone should check the staging burst tests after the deploy.',
    ].join('\n'),
    goldActions: [
      {
        action: 'Ship the Redis token-bucket patch',
        commitmentType: 'explicit',
        owner: 'Tomas',
        deadline: 'Friday',
      },
      {
        action: 'Inspect why Grafana latency percentiles lagged by four minutes',
        commitmentType: 'implicit',
        owner: 'Nina',
        deadline: 'Unspecified',
      },
      {
        action: 'Check the staging burst tests after the deploy',
        commitmentType: 'implicit',
        owner: 'Unassigned',
        deadline: 'Unspecified',
      },
    ],
  },
  {
    id: 'eval-02',
    title: 'Billing Webhook Idempotency Sprint Sync',
    meetingDate: '2026-11-11',
    transcript: [
      'Devon: Decision: All invoice.paid handlers must enforce a 24-hour idempotency key.',
      'Maya: I will update the Stripe webhook migration script by tomorrow.',
      'Devon: Can you rotate the staging signing secret?',
      'Maya: Sure, I will rotate the staging signing secret by Thursday.',
      'Omar: Let me dig into those duplicate refund rows we saw in the EU replica.',
    ].join('\n'),
    goldActions: [
      {
        action: 'Update the Stripe webhook migration script',
        commitmentType: 'explicit',
        owner: 'Maya',
        deadline: 'tomorrow',
      },
      {
        action: 'Rotate the staging signing secret',
        commitmentType: 'explicit',
        owner: 'Maya',
        deadline: 'Thursday',
      },
      {
        action: 'Investigate duplicate refund rows in the EU replica',
        commitmentType: 'implicit',
        owner: 'Omar',
        deadline: 'Unspecified',
      },
    ],
  },
  {
    id: 'eval-03',
    title: 'Mobile Offline Sync Architecture Debate',
    meetingDate: '2026-11-12',
    transcript: [
      'Sofia: Hypothetically in an ideal world we would rewrite the whole client in Rust lol.',
      'Liam: Back to reality — I will publish the SQLite conflict-resolution ADR by 2026-11-18.',
      'Sofia: I can poke at the background sync battery drain report before next week.',
      'Liam: Blocked on design sign-off for the offline banner copy.',
    ].join('\n'),
    goldActions: [
      {
        action: 'Publish the SQLite conflict-resolution ADR',
        commitmentType: 'explicit',
        owner: 'Liam',
        deadline: '2026-11-18',
      },
      {
        action: 'Investigate the background sync battery drain report',
        commitmentType: 'implicit',
        owner: 'Sofia',
        deadline: 'next week',
      },
    ],
  },
  {
    id: 'eval-04',
    title: 'SOC2 Type II Audit Evidence Cutoff',
    meetingDate: '2026-11-12',
    transcript: [
      'Elena: Decision: We will freeze production IAM role changes until audit sampling closes.',
      'Marcus: I will export the Q4 access-review CSV and send it to auditors by Wednesday.',
      'Elena: I will try to circle back with HR on offboarding timestamps.',
      'Marcus: I will deploy the automated key-expiry alert rule by Monday.',
    ].join('\n'),
    goldActions: [
      {
        action: 'Export the Q4 access-review CSV and send it to auditors',
        commitmentType: 'explicit',
        owner: 'Marcus',
        deadline: 'Wednesday',
      },
      {
        action: 'Circle back with HR on offboarding timestamps',
        commitmentType: 'implicit',
        owner: 'Elena',
        deadline: 'Unspecified',
      },
      {
        action: 'Deploy the automated key-expiry alert rule',
        commitmentType: 'explicit',
        owner: 'Marcus',
        deadline: 'Monday',
      },
    ],
  },
  {
    id: 'eval-05',
    title: 'Customer Onboarding Funnel Review',
    meetingDate: '2026-11-13',
    transcript: [
      'Priya: Last quarter we did a webinar that performed nicely, anyway moving on.',
      'Hannah: I will send the updated onboarding checklist PDF to Acme Corp by tomorrow.',
      'Jordan: I will circle back on the SSO setup docs once support tags the tickets.',
      'Priya: Waiting on legal approval for the updated trial SLA.',
      'Hannah: We should probably audit the welcome email bounce rate sometime soon.',
    ].join('\n'),
    goldActions: [
      {
        action: 'Send the updated onboarding checklist PDF to Acme Corp',
        commitmentType: 'explicit',
        owner: 'Hannah',
        deadline: 'tomorrow',
      },
      {
        action: 'Circle back on SSO setup docs once support tags the tickets',
        commitmentType: 'implicit',
        owner: 'Jordan',
        deadline: 'Unspecified',
      },
      {
        action: 'Audit the welcome email bounce rate',
        commitmentType: 'implicit',
        owner: 'Unassigned',
        deadline: 'Unspecified',
      },
    ],
  },
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'into',
  'from',
  'once',
  'when',
  'will',
  'why',
  'who',
  'what',
  'their',
  'about',
]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const w of sa) {
    if (sb.has(w)) intersection += 1;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeMetrics(tp: number, fp: number, fn: number): ClassificationMetrics {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return {
    tp,
    fp,
    fn,
    precision: Number((precision * 100).toFixed(1)),
    recall: Number((recall * 100).toFixed(1)),
    f1: Number((f1 * 100).toFixed(1)),
  };
}

function matchPredictedToGold(
  predicted: ActionItem[],
  gold: GoldEvalActionItem[],
  type: CommitmentType
): {
  tp: number;
  fp: number;
  fn: number;
  matchedPairs: Array<{
    goldAction: string;
    predictedAction: string;
    commitmentType: CommitmentType;
    evidenceVerified: boolean;
  }>;
  missedGold: GoldEvalActionItem[];
  falsePositives: ActionItem[];
} {
  const predSubset = predicted.filter((p) => p.commitmentType === type);
  const goldSubset = gold.filter((g) => g.commitmentType === type);

  const usedPred = new Set<number>();
  const matchedPairs: Array<{
    goldAction: string;
    predictedAction: string;
    commitmentType: CommitmentType;
    evidenceVerified: boolean;
  }> = [];
  const missedGold: GoldEvalActionItem[] = [];

  for (const g of goldSubset) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < predSubset.length; i++) {
      if (usedPred.has(i)) continue;
      const p = predSubset[i];
      const textSim = jaccardSimilarity(g.action, p.action);
      const ownerMatch =
        g.owner.toLowerCase() === p.owner.toLowerCase() ||
        g.owner === 'Unassigned' ||
        p.owner === 'Unassigned';
      const score = textSim + (ownerMatch ? 0.15 : 0);
      if (textSim >= 0.28 && score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      usedPred.add(bestIdx);
      matchedPairs.push({
        goldAction: g.action,
        predictedAction: predSubset[bestIdx].action,
        commitmentType: type,
        evidenceVerified: predSubset[bestIdx].evidenceVerified,
      });
    } else {
      missedGold.push(g);
    }
  }

  const falsePositives = predSubset.filter((_, idx) => !usedPred.has(idx));

  return {
    tp: matchedPairs.length,
    fp: falsePositives.length,
    fn: missedGold.length,
    matchedPairs,
    missedGold,
    falsePositives,
  };
}

export async function evaluateExtractionBenchmark(params: {
  cases?: EvalMeetingCase[];
  confidenceThreshold: number;
  mode: 'deterministic-pipeline' | 'gemini-live';
  extractorFn: (evalCase: EvalMeetingCase) => Promise<RawMeetingExtraction> | RawMeetingExtraction;
}): Promise<EvalMetricsResult> {
  const cases = params.cases || GOLD_EVAL_CASES;

  let expTp = 0;
  let expFp = 0;
  let expFn = 0;
  let impTp = 0;
  let impFp = 0;
  let impFn = 0;

  let totalPredictions = 0;
  let totalVerifiedEvidence = 0;
  let totalHallucinated = 0;
  let totalLatencyMs = 0;

  const caseResults: EvalMeetingCaseResult[] = [];

  for (const c of cases) {
    const start = performance.now();
    const raw = await params.extractorFn(c);
    const elapsedMs = Number(Math.max(1.2, performance.now() - start).toFixed(1));
    totalLatencyMs += elapsedMs;

    const normalized = normalizeAndVerifyExtraction({
      raw,
      meetingId: c.id,
      meetingTitle: c.title,
      meetingDate: c.meetingDate,
      transcript: c.transcript,
      confidenceThreshold: params.confidenceThreshold,
    });

    const explicitMatch = matchPredictedToGold(
      normalized.actionItems,
      c.goldActions,
      'explicit'
    );
    const implicitMatch = matchPredictedToGold(
      normalized.actionItems,
      c.goldActions,
      'implicit'
    );

    expTp += explicitMatch.tp;
    expFp += explicitMatch.fp;
    expFn += explicitMatch.fn;
    impTp += implicitMatch.tp;
    impFp += implicitMatch.fp;
    impFn += implicitMatch.fn;

    totalPredictions += normalized.actionItems.length;
    const unverifiedCount = normalized.actionItems.filter(
      (a) => !a.evidenceVerified
    ).length;
    totalVerifiedEvidence += normalized.actionItems.length - unverifiedCount;

    // A prediction is counted as a hallucination if evidence is unverified OR it is an unsupported FP
    const allFp = [...explicitMatch.falsePositives, ...implicitMatch.falsePositives];
    const hallucinatedItems = normalized.actionItems.filter(
      (item) => !item.evidenceVerified || allFp.some((fp) => fp.id === item.id)
    );
    totalHallucinated += hallucinatedItems.length;

    caseResults.push({
      caseId: c.id,
      title: c.title,
      explicit: computeMetrics(explicitMatch.tp, explicitMatch.fp, explicitMatch.fn),
      implicit: computeMetrics(implicitMatch.tp, implicitMatch.fp, implicitMatch.fn),
      predictedCount: normalized.actionItems.length,
      goldCount: c.goldActions.length,
      hallucinatedCount: hallucinatedItems.length,
      unverifiedEvidenceCount: unverifiedCount,
      latencyMs: elapsedMs,
      matchedPairs: [...explicitMatch.matchedPairs, ...implicitMatch.matchedPairs],
      missedGold: [...explicitMatch.missedGold, ...implicitMatch.missedGold],
      falsePositives: allFp.map((fp) => ({
        action: fp.action,
        commitmentType: fp.commitmentType,
        owner: fp.owner,
        evidenceVerified: fp.evidenceVerified,
        evidence: fp.evidence,
      })),
    });
  }

  const explicitMetrics = computeMetrics(expTp, expFp, expFn);
  const implicitMetrics = computeMetrics(impTp, impFp, impFn);
  const overallMetrics = computeMetrics(
    expTp + impTp,
    expFp + impFp,
    expFn + impFn
  );

  const hallucinationRate =
    totalPredictions === 0
      ? 0
      : Number(((totalHallucinated / totalPredictions) * 100).toFixed(1));
  const evidenceGroundingRate =
    totalPredictions === 0
      ? 100
      : Number(((totalVerifiedEvidence / totalPredictions) * 100).toFixed(1));

  return {
    runAt: new Date().toISOString(),
    mode: params.mode,
    confidenceThreshold: params.confidenceThreshold,
    totalMeetings: cases.length,
    explicit: explicitMetrics,
    implicit: implicitMetrics,
    overall: overallMetrics,
    hallucinationRate,
    evidenceGroundingRate,
    avgLatencyMs: Number((totalLatencyMs / Math.max(1, cases.length)).toFixed(1)),
    cases: caseResults,
  };
}
