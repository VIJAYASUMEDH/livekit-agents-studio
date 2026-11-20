import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateExtractionBenchmark, GOLD_EVAL_CASES } from './evalBenchmark.ts';
import { extractStructuredMeetingFallback } from './transcriptExtractor.ts';

test('evaluateExtractionBenchmark reports explicit F1, implicit F1, and low hallucination rate', async () => {
  const report = await evaluateExtractionBenchmark({
    cases: GOLD_EVAL_CASES,
    confidenceThreshold: 0.78,
    mode: 'deterministic-pipeline',
    extractorFn: (c) => extractStructuredMeetingFallback(c.transcript),
  });

  assert.equal(report.totalMeetings, 5);
  assert.ok(report.explicit.f1 >= 80, `Expected explicit F1 >= 80, got ${report.explicit.f1}`);
  assert.ok(report.implicit.f1 >= 70, `Expected implicit F1 >= 70, got ${report.implicit.f1}`);
  assert.equal(report.evidenceGroundingRate, 100);
  assert.ok(report.hallucinationRate <= 20);
});
