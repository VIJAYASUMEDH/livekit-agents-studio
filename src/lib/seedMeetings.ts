import { addDaysIso, verifyTranscriptEvidence } from './evidenceVerifier.ts';
import type { ActionItem, MeetingRecord } from '../types/actiongraph.ts';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.78;

export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function spanFor(transcript: string, quote: string) {
  return verifyTranscriptEvidence(transcript, quote).span;
}

export function createSeedMeetings(todayIso = getTodayIso()): MeetingRecord[] {
  const d1 = addDaysIso(todayIso, -9);
  const d2 = addDaysIso(todayIso, -4);
  const d3 = addDaysIso(todayIso, -2);

  const t1 = [
    'Priya: Let us lock down the Q4 auth token migration plan. Decision: We are migrating all service tokens from HS256 to RS256 JWKS rotation.',
    'Marcus: I will publish the updated JWKS rotation runbook by ' + addDaysIso(d1, 3) + ' so platform teams can test in staging.',
    'Elena: I will take a look at the legacy mobile SDK retry behavior when tokens expire mid-request.',
    'Priya: Also we are blocked on security sign-off from InfoSec before flipping the production feature flag.',
    'Marcus: Let us follow up on staging error rates in Friday infrastructure triage.',
  ].join('\n');

  const t2 = [
    'Elena: Quick update from auth migration — Marcus, did the JWKS runbook ship? Not yet, okay, let us carry that forward.',
    'Elena: On checkout latency, Decision: We will cap payment gateway retries at 2 attempts with exponential jitter.',
    'Devon: I will deploy the checkout timeout middleware fix to production by ' + addDaysIso(d2, 2) + '.',
    'Priya: Someone should check why the Redis session cache TTL dropped after Tuesday deploy.',
    'Marcus: I will try to look into the webhook dead-letter queue spike once staging calms down.',
    'Devon: Waiting on Stripe sandbox webhook credentials from vendor support to finish end-to-end replay tests.',
  ].join('\n');

  const t3 = [
    'Priya: Enterprise launch readiness check. Decision: EU customer onboarding stays gated behind SOC2 audit export verification.',
    'Devon: I finished deploying the checkout timeout middleware earlier today, latency p95 dropped to 180ms.',
    'Nina: I will finalize the SOC2 access-control evidence package by ' + addDaysIso(todayIso, 2) + '.',
    'Elena: I can poke at the enterprise SSO SAML assertion clock-skew warning before next week.',
    'Marcus: I will ship the automated tenant-offboarding cleanup job by ' + addDaysIso(todayIso, 4) + '.',
    'Priya: High-priority blocker: Legal DPAs for Acme Corp are still waiting on outside counsel redlines.',
    'Nina: Let us schedule a launch go/no-go check-in on ' + addDaysIso(todayIso, 3) + '.',
  ].join('\n');

  const carry1Action: ActionItem = {
    id: 'mtg-001-act-1',
    meetingId: 'mtg-001',
    meetingTitle: 'Q4 Auth Migration & JWKS Sync',
    meetingDate: d1,
    action: 'Publish updated JWKS rotation runbook for staging teams',
    commitmentType: 'explicit',
    owner: 'Marcus',
    deadline: addDaysIso(d1, 3),
    deadlineIso: addDaysIso(d1, 3),
    confidence: 0.94,
    evidence:
      'Marcus: I will publish the updated JWKS rotation runbook by ' +
      addDaysIso(d1, 3) +
      ' so platform teams can test in staging.',
    evidenceVerified: true,
    evidenceMatchType: 'exact',
    evidenceSpan: spanFor(
      t1,
      'Marcus: I will publish the updated JWKS rotation runbook by ' +
        addDaysIso(d1, 3) +
        ' so platform teams can test in staging.'
    ),
    status: 'in_progress',
    reviewState: 'auto_approved',
  };

  const carry2Action: ActionItem = {
    id: 'mtg-001-act-2',
    meetingId: 'mtg-001',
    meetingTitle: 'Q4 Auth Migration & JWKS Sync',
    meetingDate: d1,
    action: 'Inspect legacy mobile SDK retry behavior on mid-request token expiry',
    commitmentType: 'implicit',
    owner: 'Elena',
    deadline: 'Unspecified',
    deadlineIso: null,
    confidence: 0.71,
    evidence:
      'Elena: I will take a look at the legacy mobile SDK retry behavior when tokens expire mid-request.',
    evidenceVerified: true,
    evidenceMatchType: 'exact',
    evidenceSpan: spanFor(
      t1,
      'Elena: I will take a look at the legacy mobile SDK retry behavior when tokens expire mid-request.'
    ),
    status: 'open',
    reviewState: 'approved',
  };

  const mtg1: MeetingRecord = {
    id: 'mtg-001',
    title: 'Q4 Auth Migration & JWKS Sync',
    meetingDate: d1,
    createdAt: `${d1}T16:00:00Z`,
    sourceType: 'seed',
    participants: ['Priya', 'Marcus', 'Elena'],
    transcript: t1,
    extractionProvider: 'seed',
    decisions: [
      {
        id: 'mtg-001-dec-1',
        meetingId: 'mtg-001',
        decision: 'Migrate all service tokens from HS256 to RS256 JWKS rotation',
        owner: 'Priya',
        confidence: 0.95,
        evidence:
          'Priya: Let us lock down the Q4 auth token migration plan. Decision: We are migrating all service tokens from HS256 to RS256 JWKS rotation.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t1,
          'Decision: We are migrating all service tokens from HS256 to RS256 JWKS rotation.'
        ),
      },
    ],
    actionItems: [carry1Action, carry2Action],
    blockers: [
      {
        id: 'mtg-001-blk-1',
        meetingId: 'mtg-001',
        blocker: 'Security sign-off from InfoSec required before flipping production feature flag',
        owner: 'Priya',
        severity: 'high',
        evidence:
          'Priya: Also we are blocked on security sign-off from InfoSec before flipping the production feature flag.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t1,
          'Priya: Also we are blocked on security sign-off from InfoSec before flipping the production feature flag.'
        ),
        resolved: false,
      },
    ],
    followUps: [
      {
        id: 'mtg-001-fup-1',
        meetingId: 'mtg-001',
        topic: 'Review staging error rates in infrastructure triage',
        owner: 'Marcus',
        targetDate: 'Friday',
        evidence:
          'Marcus: Let us follow up on staging error rates in Friday infrastructure triage.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t1,
          'Marcus: Let us follow up on staging error rates in Friday infrastructure triage.'
        ),
      },
    ],
    carryoverCount: 0,
    resolvedCarryoverIds: [],
  };

  const mtg2: MeetingRecord = {
    id: 'mtg-002',
    title: 'Checkout Latency Postmortem & Billing Cutover',
    meetingDate: d2,
    createdAt: `${d2}T18:30:00Z`,
    sourceType: 'seed',
    participants: ['Elena', 'Devon', 'Priya', 'Marcus'],
    transcript: t2,
    extractionProvider: 'seed',
    decisions: [
      {
        id: 'mtg-002-dec-1',
        meetingId: 'mtg-002',
        decision: 'Cap payment gateway retries at 2 attempts with exponential jitter',
        owner: 'Elena',
        confidence: 0.93,
        evidence:
          'Elena: On checkout latency, Decision: We will cap payment gateway retries at 2 attempts with exponential jitter.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t2,
          'Decision: We will cap payment gateway retries at 2 attempts with exponential jitter.'
        ),
      },
    ],
    actionItems: [
      {
        ...carry1Action,
        id: 'mtg-002-carry-1',
        meetingId: 'mtg-002',
        meetingTitle: 'Checkout Latency Postmortem & Billing Cutover',
        meetingDate: d2,
        carriedFromMeetingId: 'mtg-001',
        carriedFromMeetingTitle: 'Q4 Auth Migration & JWKS Sync',
      },
      {
        id: 'mtg-002-act-1',
        meetingId: 'mtg-002',
        meetingTitle: 'Checkout Latency Postmortem & Billing Cutover',
        meetingDate: d2,
        action: 'Deploy checkout timeout middleware fix to production',
        commitmentType: 'explicit',
        owner: 'Devon',
        deadline: addDaysIso(d2, 2),
        deadlineIso: addDaysIso(d2, 2),
        confidence: 0.96,
        evidence:
          'Devon: I will deploy the checkout timeout middleware fix to production by ' +
          addDaysIso(d2, 2) +
          '.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t2,
          'Devon: I will deploy the checkout timeout middleware fix to production by ' +
            addDaysIso(d2, 2) +
            '.'
        ),
        status: 'done',
        reviewState: 'auto_approved',
      },
      {
        id: 'mtg-002-act-2',
        meetingId: 'mtg-002',
        meetingTitle: 'Checkout Latency Postmortem & Billing Cutover',
        meetingDate: d2,
        action: 'Investigate Redis session cache TTL drop after Tuesday deploy',
        commitmentType: 'implicit',
        owner: 'Unassigned',
        deadline: 'Unspecified',
        deadlineIso: null,
        confidence: 0.61,
        evidence:
          'Priya: Someone should check why the Redis session cache TTL dropped after Tuesday deploy.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t2,
          'Priya: Someone should check why the Redis session cache TTL dropped after Tuesday deploy.'
        ),
        status: 'open',
        reviewState: 'needs_review',
        reviewReason:
          'Confidence 61% below threshold 78% · Missing or ambiguous owner · Implicit commitment without concrete deadline',
      },
      {
        id: 'mtg-002-act-3',
        meetingId: 'mtg-002',
        meetingTitle: 'Checkout Latency Postmortem & Billing Cutover',
        meetingDate: d2,
        action: 'Inspect webhook dead-letter queue spike once staging stabilizes',
        commitmentType: 'implicit',
        owner: 'Marcus',
        deadline: 'Unspecified',
        deadlineIso: null,
        confidence: 0.68,
        evidence:
          'Marcus: I will try to look into the webhook dead-letter queue spike once staging calms down.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t2,
          'Marcus: I will try to look into the webhook dead-letter queue spike once staging calms down.'
        ),
        status: 'open',
        reviewState: 'needs_review',
        reviewReason:
          'Confidence 68% below threshold 78% · Implicit commitment without concrete deadline',
      },
    ],
    blockers: [
      {
        id: 'mtg-002-blk-1',
        meetingId: 'mtg-002',
        blocker: 'Waiting on Stripe sandbox webhook credentials from vendor support',
        owner: 'Devon',
        severity: 'medium',
        evidence:
          'Devon: Waiting on Stripe sandbox webhook credentials from vendor support to finish end-to-end replay tests.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t2,
          'Devon: Waiting on Stripe sandbox webhook credentials from vendor support to finish end-to-end replay tests.'
        ),
        resolved: false,
      },
    ],
    followUps: [],
    carryoverCount: 1,
    resolvedCarryoverIds: [],
  };

  const mtg3: MeetingRecord = {
    id: 'mtg-003',
    title: 'Enterprise Launch Readiness & SOC2 Controls',
    meetingDate: d3,
    createdAt: `${d3}T15:15:00Z`,
    sourceType: 'seed',
    participants: ['Priya', 'Devon', 'Nina', 'Elena', 'Marcus'],
    transcript: t3,
    extractionProvider: 'seed',
    decisions: [
      {
        id: 'mtg-003-dec-1',
        meetingId: 'mtg-003',
        decision: 'Gate EU customer onboarding behind SOC2 audit export verification',
        owner: 'Priya',
        confidence: 0.94,
        evidence:
          'Priya: Enterprise launch readiness check. Decision: EU customer onboarding stays gated behind SOC2 audit export verification.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t3,
          'Decision: EU customer onboarding stays gated behind SOC2 audit export verification.'
        ),
      },
    ],
    actionItems: [
      {
        id: 'mtg-003-act-1',
        meetingId: 'mtg-003',
        meetingTitle: 'Enterprise Launch Readiness & SOC2 Controls',
        meetingDate: d3,
        action: 'Finalize SOC2 access-control evidence package',
        commitmentType: 'explicit',
        owner: 'Nina',
        deadline: addDaysIso(todayIso, 2),
        deadlineIso: addDaysIso(todayIso, 2),
        confidence: 0.95,
        evidence:
          'Nina: I will finalize the SOC2 access-control evidence package by ' +
          addDaysIso(todayIso, 2) +
          '.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t3,
          'Nina: I will finalize the SOC2 access-control evidence package by ' +
            addDaysIso(todayIso, 2) +
            '.'
        ),
        status: 'in_progress',
        reviewState: 'auto_approved',
      },
      {
        id: 'mtg-003-act-2',
        meetingId: 'mtg-003',
        meetingTitle: 'Enterprise Launch Readiness & SOC2 Controls',
        meetingDate: d3,
        action: 'Investigate enterprise SSO SAML assertion clock-skew warning',
        commitmentType: 'implicit',
        owner: 'Elena',
        deadline: 'Next week',
        deadlineIso: addDaysIso(d3, 7),
        confidence: 0.74,
        evidence:
          'Elena: I can poke at the enterprise SSO SAML assertion clock-skew warning before next week.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t3,
          'Elena: I can poke at the enterprise SSO SAML assertion clock-skew warning before next week.'
        ),
        status: 'open',
        reviewState: 'needs_review',
        reviewReason: 'Confidence 74% below threshold 78%',
      },
      {
        id: 'mtg-003-act-3',
        meetingId: 'mtg-003',
        meetingTitle: 'Enterprise Launch Readiness & SOC2 Controls',
        meetingDate: d3,
        action: 'Ship automated tenant-offboarding cleanup job',
        commitmentType: 'explicit',
        owner: 'Marcus',
        deadline: addDaysIso(todayIso, 4),
        deadlineIso: addDaysIso(todayIso, 4),
        confidence: 0.93,
        evidence:
          'Marcus: I will ship the automated tenant-offboarding cleanup job by ' +
          addDaysIso(todayIso, 4) +
          '.',
        evidenceVerified: true,
        evidenceMatchType: 'exact',
        evidenceSpan: spanFor(
          t3,
          'Marcus: I will ship the automated tenant-offboarding cleanup job by ' +
            addDaysIso(todayIso, 4) +
            '.'
        ),
        status: 'open',
        reviewState: 'auto_approved',
      },
    ],
    blockers: [
      {
        id: 'mtg-003-blk-1',
        meetingId: 'mtg-003',
        blocker: 'Legal DPAs for Acme Corp awaiting outside counsel redlines',
        owner: 'Priya',
        severity: 'high',
        evidence:
          'Priya: High-priority blocker: Legal DPAs for Acme Corp are still waiting on outside counsel redlines.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t3,
          'Priya: High-priority blocker: Legal DPAs for Acme Corp are still waiting on outside counsel redlines.'
        ),
        resolved: false,
      },
    ],
    followUps: [
      {
        id: 'mtg-003-fup-1',
        meetingId: 'mtg-003',
        topic: 'Launch go/no-go check-in',
        owner: 'Nina',
        targetDate: addDaysIso(todayIso, 3),
        evidence:
          'Nina: Let us schedule a launch go/no-go check-in on ' +
          addDaysIso(todayIso, 3) +
          '.',
        evidenceVerified: true,
        evidenceSpan: spanFor(
          t3,
          'Nina: Let us schedule a launch go/no-go check-in on ' +
            addDaysIso(todayIso, 3) +
            '.'
        ),
      },
    ],
    carryoverCount: 0,
    resolvedCarryoverIds: ['mtg-002-act-1'],
  };

  return [mtg3, mtg2, mtg1];
}

export const SAMPLE_TRANSCRIPT_PRESETS: Array<{
  id: string;
  title: string;
  subtitle: string;
  transcript: string;
}> = [
  {
    id: 'incident-triage',
    title: 'SEV-2 Ingestion Pipeline Outage Retro',
    subtitle: 'Mixed explicit SLAs, implicit probes, and a vendor blocker',
    transcript: [
      'Amina: Let us keep the retro crisp. Decision: We are splitting Kafka consumer groups by tenant tier starting Monday.',
      'Carlos: I will ship the dead-letter replay CLI script by Friday so support can recover dropped events.',
      'Hannah: I will take a look at why Prometheus alert routing silently dropped the midnight PagerDuty webhook.',
      'Amina: Also someone should double-check the staging retention policy before we increase partition count.',
      'Carlos: We are blocked on AWS quota approval for three extra m6i.xlarge brokers before load testing.',
      'Hannah: Let us follow up on broker saturation graphs in Tuesday SRE office hours.',
    ].join('\n'),
  },
  {
    id: 'mobile-cutover',
    title: 'iOS v4.2 Release Cutover & Crash Scrub',
    subtitle: 'Direct delegation, implicit investigation, and resolved carryover',
    transcript: [
      'Liam: Good news first — I already finished migrating the legacy mobile SDK retry behavior we discussed last week.',
      'Sofia: Awesome. Decision: We are freezing feature merges at 5pm today for the v4.2 release branch.',
      'Liam: I will upload the signed TestFlight RC3 build by tomorrow.',
      'Tessa: Can you update the release notes for enterprise admins?',
      'Liam: Sure, I can send the admin changelog draft by Thursday.',
      'Sofia: I can poke at the cold-start splash screen regression on iPhone 13 mini when I wrap QA.',
      'Tessa: Waiting on App Store privacy manifest review from compliance before final submission.',
    ].join('\n'),
  },
  {
    id: 'customer-escalation',
    title: 'Northstar Health Renewal & Usage Metering',
    subtitle: 'Commercial commitments + messy off-topic chatter',
    transcript: [
      'Maya: Hope everyone had a solid weekend, coffee machine in B4 is finally fixed haha.',
      'Maya: Back to Northstar Health. Decision: We will grandfather their Q1 API burst rate for 90 days.',
      'Jordan: I will send the redlined MSA addendum to Northstar procurement by Wednesday.',
      'Priya: Let me check if their telemetry pipeline is still emitting duplicate seat-count heartbeats.',
      'Jordan: I will prepare the Q4 usage reconciliation workbook by 2026-11-24.',
      'Maya: Let us schedule a check-in with Northstar VP Engineering next Tuesday.',
    ].join('\n'),
  },
];
