import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateHumanReview,
  isActionOverdue,
  resolveDeadlineIso,
  verifyTranscriptEvidence,
} from './evidenceVerifier.ts';
import type { ActionItem } from '../types/actiongraph.ts';

test('verifyTranscriptEvidence matches exact and normalized quotes accurately', () => {
  const transcript =
    'Marcus: I will publish the JWKS   rotation runbook by Friday.\nElena: Sounds good.';

  const exact = verifyTranscriptEvidence(
    transcript,
    'Elena: Sounds good.'
  );
  assert.equal(exact.verified, true);
  assert.equal(exact.matchType, 'exact');
  assert.ok(exact.span && exact.span.start >= 0);

  const normalized = verifyTranscriptEvidence(
    transcript,
    'I will publish the JWKS rotation runbook by Friday.'
  );
  assert.equal(normalized.verified, true);
  assert.equal(normalized.matchType, 'normalized');

  const hallucinated = verifyTranscriptEvidence(
    transcript,
    'Marcus promised to rewrite the billing backend in Rust by Monday.'
  );
  assert.equal(hallucinated.verified, false);
  assert.equal(hallucinated.matchType, 'none');
});

test('resolveDeadlineIso resolves relative and explicit dates cleanly', () => {
  const base = '2026-11-11'; // Wednesday
  assert.equal(resolveDeadlineIso('tomorrow', base), '2026-11-12');
  assert.equal(resolveDeadlineIso('Friday', base), '2026-11-13');
  assert.equal(resolveDeadlineIso('2026-11-20', base), '2026-11-20');
  assert.equal(resolveDeadlineIso('Unspecified', base), null);
});

test('evaluateHumanReview flags unverified evidence, low confidence, and missing owners', () => {
  const unverified = evaluateHumanReview(
    {
      confidence: 0.92,
      evidenceVerified: false,
      owner: 'Marcus',
      deadline: 'Friday',
      deadlineIso: '2026-11-13',
      commitmentType: 'explicit',
    },
    0.78
  );
  assert.equal(unverified.reviewState, 'needs_review');
  assert.match(unverified.reviewReason || '', /Unverified transcript evidence/);

  const goodExplicit = evaluateHumanReview(
    {
      confidence: 0.91,
      evidenceVerified: true,
      owner: 'Marcus',
      deadline: 'Friday',
      deadlineIso: '2026-11-13',
      commitmentType: 'explicit',
    },
    0.78
  );
  assert.equal(goodExplicit.reviewState, 'auto_approved');
});

test('isActionOverdue detects open past-due tasks and ignores completed/rejected ones', () => {
  const baseItem: ActionItem = {
    id: 'a-1',
    meetingId: 'm-1',
    action: 'Test overdue check',
    commitmentType: 'explicit',
    owner: 'Marcus',
    deadline: '2026-11-10',
    deadlineIso: '2026-11-10',
    confidence: 0.9,
    evidence: 'Marcus: Test overdue check by 2026-11-10.',
    evidenceVerified: true,
    evidenceMatchType: 'exact',
    status: 'open',
    reviewState: 'auto_approved',
  };

  assert.equal(isActionOverdue(baseItem, '2026-11-15'), true);
  assert.equal(
    isActionOverdue({ ...baseItem, status: 'done' }, '2026-11-15'),
    false
  );
  assert.equal(
    isActionOverdue({ ...baseItem, reviewState: 'rejected' }, '2026-11-15'),
    false
  );
});
