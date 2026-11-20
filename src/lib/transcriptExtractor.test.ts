import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractStructuredMeetingFallback,
  normalizeAndVerifyExtraction,
} from './transcriptExtractor.ts';

test('extractStructuredMeetingFallback distinguishes explicit vs implicit commitments and extracts verbatim evidence', () => {
  const transcript = [
    'Priya: Decision: We will migrate webhook retries to SQS.',
    'Marcus: I will deploy the SQS consumer fix by Friday.',
    'Elena: I will take a look at why Redis TTL dropped on staging.',
    'Marcus: We are blocked on AWS quota increase before load testing.',
    'Priya: Let us follow up on staging metrics next Tuesday.',
  ].join('\n');

  const raw = extractStructuredMeetingFallback(transcript);
  assert.equal(raw.decisions.length, 1);
  assert.equal(raw.blockers.length, 1);
  assert.ok(raw.followUps.length >= 1);

  const explicit = raw.actionItems.filter((a) => a.commitmentType === 'explicit');
  const implicit = raw.actionItems.filter((a) => a.commitmentType === 'implicit');
  assert.equal(explicit.length, 1);
  assert.equal(implicit.length, 1);
  assert.equal(explicit[0].owner, 'Marcus');
  assert.equal(explicit[0].deadline, 'Friday');
  assert.equal(implicit[0].owner, 'Elena');

  const verified = normalizeAndVerifyExtraction({
    raw,
    meetingId: 'm-test',
    meetingTitle: 'Test Sync',
    meetingDate: '2026-11-11',
    transcript,
    confidenceThreshold: 0.78,
  });

  assert.ok(verified.actionItems.every((a) => a.evidenceVerified));
  const implicitVerified = verified.actionItems.find(
    (a) => a.commitmentType === 'implicit'
  );
  assert.equal(implicitVerified?.reviewState, 'needs_review');
});

test('normalizeAndVerifyExtraction penalizes hallucinated evidence and routes to human review', () => {
  const transcript = 'Devon: I will fix the checkout bug by tomorrow.';
  const normalized = normalizeAndVerifyExtraction({
    raw: {
      participants: ['Devon'],
      decisions: [],
      actionItems: [
        {
          action: 'Rewrite entire database layer',
          commitmentType: 'explicit',
          owner: 'Devon',
          deadline: 'tomorrow',
          confidence: 0.96,
          evidence: 'Devon: I will rewrite the entire database in Go tomorrow.',
        },
      ],
      blockers: [],
      followUps: [],
      resolvedCarryoverIds: [],
    },
    meetingId: 'm-hallucination',
    meetingTitle: 'Hallucination Check',
    meetingDate: '2026-11-12',
    transcript,
    confidenceThreshold: 0.78,
  });

  assert.equal(normalized.actionItems[0].evidenceVerified, false);
  assert.ok(normalized.actionItems[0].confidence <= 0.42);
  assert.equal(normalized.actionItems[0].reviewState, 'needs_review');
});
