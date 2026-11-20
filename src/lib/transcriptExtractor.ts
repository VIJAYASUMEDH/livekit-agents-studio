import {
  evaluateHumanReview,
  resolveDeadlineIso,
  verifyTranscriptEvidence,
} from './evidenceVerifier.ts';
import type {
  ActionItem,
  BlockerItem,
  CommitmentType,
  DecisionItem,
  FollowUpItem,
  RawExtractedAction,
  RawExtractedBlocker,
  RawExtractedDecision,
  RawExtractedFollowUp,
  RawMeetingExtraction,
} from '../types/actiongraph.ts';

interface SpeakerTurn {
  speaker: string;
  text: string;
  rawLine: string;
}

const NON_SPEAKER_PREFIXES = new Set([
  'decision',
  'note',
  'action',
  'summary',
  'blocker',
  'follow-up',
  'followup',
  'http',
  'https',
]);

function parseTranscriptTurns(transcript: string): {
  turns: SpeakerTurn[];
  participants: string[];
} {
  const lines = transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\d+$/.test(l) && !/^WEBVTT/i.test(l) && !/^\d{2}:\d{2}.*-->/.test(l));

  const turns: SpeakerTurn[] = [];
  const participants = new Set<string>();
  let lastSpeaker = 'Unassigned';

  for (const line of lines) {
    const cleaned = line.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '');
    const speakerMatch = cleaned.match(
      /^([A-Z][A-Za-z0-9 .'-]{1,26}):\s+(.+)$/
    );
    if (
      speakerMatch &&
      !NON_SPEAKER_PREFIXES.has(speakerMatch[1].trim().toLowerCase())
    ) {
      const speaker = speakerMatch[1].trim();
      const text = speakerMatch[2].trim();
      lastSpeaker = speaker;
      participants.add(speaker);
      turns.push({ speaker, text, rawLine: line });
    } else {
      turns.push({ speaker: lastSpeaker, text: cleaned, rawLine: line });
    }
  }

  return {
    turns,
    participants: Array.from(participants),
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
}

function extractDeadlinePhrase(sentence: string): string {
  const patterns: RegExp[] = [
    /\bby\s+((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|eod|eow|end of (?:day|the day|week|the week)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?|\d{4}-\d{2}-\d{2})/i,
    /\bbefore\s+((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|eod|the\s+(?:demo|release|launch|sync))/i,
    /\b(this\s+(?:friday|thursday|wednesday|tuesday|monday|afternoon|week)|tomorrow|today|eod|eow|next\s+(?:monday|tuesday|wednesday|thursday|friday|week))\b/i,
    /\bon\s+((?:monday|tuesday|wednesday|thursday|friday)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2})/i,
  ];

  for (const rx of patterns) {
    const m = sentence.match(rx);
    if (m) {
      return (m[1] || m[0]).trim();
    }
  }
  return 'Unspecified';
}

function resolveActionOwner(
  sentence: string,
  speaker: string,
  participants: string[]
): string {
  const lower = sentence.toLowerCase();

  // Explicit third-party assignment e.g. "Maya will...", "Assign to Liam", "Priya, can you..."
  for (const name of participants) {
    if (name === speaker) continue;
    const first = name.split(' ')[0];
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assignedPattern = new RegExp(
      `(?:\\b${escaped}\\s+(?:will|can|is going to|'ll|to)|\\b(?:assign(?:ed)?\\s+to|owned\\s+by|have)\\s+${escaped}\\b|^${escaped},\\s+(?:can|could|please)\\b)`,
      'i'
    );
    if (assignedPattern.test(sentence)) {
      return name;
    }
  }

  if (/\b(?:someone|somebody|anyone)\s+should\b/i.test(lower)) {
    return 'Unassigned';
  }

  if (
    /\b(?:i'll|i will|i can|let me|i am going to|i'm going to|i need to|on it|count me in)\b/i.test(
      lower
    )
  ) {
    return speaker !== 'Unassigned' ? speaker : 'Unassigned';
  }

  if (/\bwe\s+(?:should|need to|ought to)\b/i.test(lower)) {
    return 'Unassigned';
  }

  return speaker !== 'Unassigned' ? speaker : 'Unassigned';
}

function cleanActionSummary(sentence: string, owner: string): string {
  let summary = sentence
    .replace(/^[A-Z][A-Za-z0-9 .'-]{1,24}:\s+/, '')
    .replace(
      /^(?:yeah|yes|sure|okay|alright|sounds good|got it|actually|honestly|uh|um)[,\s]+/i,
      ''
    )
    .replace(
      /^(?:i'll|i will|i can|i'm going to|i am going to|let me|we should probably|we should|someone should|maybe we should|let's make sure we)\s+/i,
      ''
    )
    .replace(
      /^(?:[A-Z][a-z]+,\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?/i,
      ''
    )
    .replace(/[.?!]+$/, '')
    .trim();

  if (summary.length > 0) {
    summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  }
  if (summary.length < 8) {
    return owner !== 'Unassigned'
      ? `${owner}: ${sentence.replace(/[.?!]+$/, '')}`
      : sentence.replace(/[.?!]+$/, '');
  }
  return summary;
}

const HYPO_OR_NOISE_PATTERN =
  /\b(?:hypothetically|would be nice|in an ideal world|just kidding|lol|haha|if we ever|last quarter we did|already (?:shipped|merged|completed|finished|fixed|done))\b/i;

const EXPLICIT_COMMITMENT_PATTERN =
  /\b(?:i'll|i will|i'm going to|i am going to|we will|i can (?:have|get|send|ship|write|update|deploy|rotate|publish|schedule|share|prepare|draft|fix|patch|audit|run|migrate))\b/i;

const EXPLICIT_ASSIGNMENT_PATTERN =
  /\b(?:assign(?:ed)? to|owned by|action item:|i'll finish|i'll ship|i'll send|i'll deploy|i'll update|i'll write|i'll patch|i'll migrate|i'll publish|i'll rotate|will finalize|will deliver|will circulate)\b/i;

const IMPLICIT_COMMITMENT_PATTERN =
  /\b(?:take a look|look into|dig into|poke at|check on|check into|circle back|keep an eye on|see if|try to|might need to|probably should|someone should|we should|maybe we|let me check|let me see|let me poke|i'll try|i can try|ping them when)\b/i;

const DECISION_PATTERN =
  /\b(?:decision:|we decided|agreed to|we agreed|let's go with|we're going with|we will standardize on|approved|settled on|lock in|official call is)\b/i;

const BLOCKER_PATTERN =
  /\b(?:blocked on|blocked by|waiting on|waiting for|stuck on|cannot proceed until|can't deploy until|can't ship until|hold up is|blocker:)\b/i;

const FOLLOWUP_PATTERN =
  /\b(?:follow up|follow-up|revisit (?:in|on|next)|schedule a (?:sync|review|check-in)|reconvene|circle back in)\b/i;

export function extractStructuredMeetingFallback(
  transcript: string,
  carryoverItems: Array<{ id: string; action: string; owner: string }> = []
): RawMeetingExtraction {
  const { turns, participants } = parseTranscriptTurns(transcript);
  const actions: RawExtractedAction[] = [];
  const decisions: RawExtractedDecision[] = [];
  const blockers: RawExtractedBlocker[] = [];
  const followUps: RawExtractedFollowUp[] = [];
  const resolvedCarryoverIds: string[] = [];

  const seenActionKeys = new Set<string>();
  const seenDecisionKeys = new Set<string>();

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const sentences = splitSentences(turn.text);
    const candidates = sentences.length > 0 ? sentences : [turn.text];

    for (const sentence of candidates) {
      const trimmed = sentence.trim();
      if (trimmed.length < 12) continue;

      // Check if this sentence resolves any open carryover task
      if (
        /\b(?:already|done|completed|finished|merged|shipped|resolved)\b/i.test(
          trimmed
        )
      ) {
        const lowerSentence = trimmed.toLowerCase();
        for (const carry of carryoverItems) {
          const keywords = carry.action
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length >= 4);
          const overlap = keywords.filter((kw) => lowerSentence.includes(kw));
          if (overlap.length >= 2 && !resolvedCarryoverIds.includes(carry.id)) {
            resolvedCarryoverIds.push(carry.id);
          }
        }
      }

      if (HYPO_OR_NOISE_PATTERN.test(trimmed)) {
        continue;
      }

      // Decisions
      if (DECISION_PATTERN.test(trimmed)) {
        const cleanedDec = trimmed
          .replace(/^decision:\s*/i, '')
          .replace(/[.]+$/, '')
          .trim();
        const key = cleanedDec.toLowerCase().slice(0, 48);
        if (!seenDecisionKeys.has(key)) {
          seenDecisionKeys.add(key);
          decisions.push({
            decision:
              cleanedDec.charAt(0).toUpperCase() + cleanedDec.slice(1),
            owner: turn.speaker,
            confidence: 0.9,
            evidence: turn.rawLine,
          });
        }
      }

      // Blockers
      if (BLOCKER_PATTERN.test(trimmed)) {
        const highSeverity =
          /\b(?:prod|production|outage|security|legal|p0|p1|launch|migration|can't ship|cannot proceed)\b/i.test(
            trimmed
          );
        blockers.push({
          blocker: trimmed.replace(/^blocker:\s*/i, '').replace(/[.]+$/, ''),
          owner: turn.speaker,
          severity: highSeverity ? 'high' : 'medium',
          evidence: turn.rawLine,
        });
      }

      // Follow-ups
      if (FOLLOWUP_PATTERN.test(trimmed) && !EXPLICIT_ASSIGNMENT_PATTERN.test(trimmed)) {
        followUps.push({
          topic: trimmed.replace(/[.]+$/, ''),
          owner: turn.speaker,
          targetDate: extractDeadlinePhrase(trimmed),
          evidence: turn.rawLine,
        });
      }

      // Action items: Explicit vs Implicit
      const isImplicit = IMPLICIT_COMMITMENT_PATTERN.test(trimmed);
      const isExplicit =
        !isImplicit &&
        (EXPLICIT_ASSIGNMENT_PATTERN.test(trimmed) ||
          EXPLICIT_COMMITMENT_PATTERN.test(trimmed));

      // Also detect direct question request followed by affirmative next turn
      const isRequestQuestion =
        /\?\s*$/.test(trimmed) &&
        /\b(?:can you|could you|will you)\b/i.test(trimmed);
      let delegatedSpeaker = '';
      if (isRequestQuestion && i + 1 < turns.length) {
        const nextTurn = turns[i + 1];
        if (
          /^(?:yes|yeah|sure|yep|on it|i'll do|i can|got it)\b/i.test(
            nextTurn.text
          )
        ) {
          delegatedSpeaker = nextTurn.speaker;
        }
      }

      if (isExplicit || isImplicit || delegatedSpeaker) {
        const commitmentType: CommitmentType = isImplicit
          ? 'implicit'
          : 'explicit';
        const owner = delegatedSpeaker
          ? delegatedSpeaker
          : resolveActionOwner(trimmed, turn.speaker, participants);
        const deadline = extractDeadlinePhrase(trimmed);
        const actionSummary = cleanActionSummary(trimmed, owner);
        const key = `${owner.toLowerCase()}::${actionSummary.toLowerCase().slice(0, 36)}`;

        if (seenActionKeys.has(key)) continue;
        seenActionKeys.add(key);

        let confidence = commitmentType === 'explicit' ? 0.91 : 0.69;
        if (deadline !== 'Unspecified' && commitmentType === 'explicit') {
          confidence = 0.94;
        } else if (deadline === 'Unspecified' && commitmentType === 'explicit') {
          confidence = 0.82;
        }
        if (owner === 'Unassigned') {
          confidence = Math.min(confidence, 0.64);
        }
        if (commitmentType === 'implicit' && deadline === 'Unspecified') {
          confidence = 0.66;
        }

        actions.push({
          action: actionSummary,
          commitmentType,
          owner,
          deadline,
          confidence: Number(confidence.toFixed(2)),
          evidence: turn.rawLine,
        });
      }
    }
  }

  return {
    participants,
    decisions,
    actionItems: actions,
    blockers,
    followUps,
    resolvedCarryoverIds,
  };
}

export function normalizeAndVerifyExtraction(params: {
  raw: RawMeetingExtraction;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  transcript: string;
  confidenceThreshold: number;
  carryoverSources?: ActionItem[];
}): {
  participants: string[];
  decisions: DecisionItem[];
  actionItems: ActionItem[];
  blockers: BlockerItem[];
  followUps: FollowUpItem[];
  resolvedCarryoverIds: string[];
} {
  const {
    raw,
    meetingId,
    meetingTitle,
    meetingDate,
    transcript,
    confidenceThreshold,
    carryoverSources = [],
  } = params;

  const decisions: DecisionItem[] = (raw.decisions || []).map((d, idx) => {
    const check = verifyTranscriptEvidence(transcript, d.evidence || '');
    return {
      id: `${meetingId}-dec-${idx + 1}`,
      meetingId,
      decision: (d.decision || '').trim(),
      owner: (d.owner || 'Team').trim(),
      confidence: Number(
        Math.min(
          0.99,
          Math.max(0.2, check.verified ? d.confidence || 0.85 : 0.4)
        ).toFixed(2)
      ),
      evidence: (d.evidence || '').trim(),
      evidenceVerified: check.verified,
      evidenceSpan: check.span,
    };
  });

  const actionItems: ActionItem[] = (raw.actionItems || []).map((a, idx) => {
    const check = verifyTranscriptEvidence(transcript, a.evidence || '');
    const commitmentType: CommitmentType =
      a.commitmentType === 'implicit' ? 'implicit' : 'explicit';
    const owner = (a.owner || 'Unassigned').trim() || 'Unassigned';
    const deadline = (a.deadline || 'Unspecified').trim() || 'Unspecified';
    const deadlineIso = resolveDeadlineIso(deadline, meetingDate);
    const rawConf =
      typeof a.confidence === 'number' && Number.isFinite(a.confidence)
        ? a.confidence
        : commitmentType === 'explicit'
          ? 0.88
          : 0.68;
    const confidence = Number(
      Math.min(0.99, Math.max(0.15, check.verified ? rawConf : Math.min(rawConf, 0.42))).toFixed(2)
    );

    const review = evaluateHumanReview(
      {
        confidence,
        evidenceVerified: check.verified,
        owner,
        deadline,
        deadlineIso,
        commitmentType,
      },
      confidenceThreshold
    );

    return {
      id: `${meetingId}-act-${idx + 1}`,
      meetingId,
      meetingTitle,
      meetingDate,
      action: (a.action || '').trim(),
      commitmentType,
      owner,
      deadline,
      deadlineIso,
      confidence,
      evidence: (a.evidence || '').trim(),
      evidenceVerified: check.verified,
      evidenceMatchType: check.matchType,
      evidenceSpan: check.span,
      status: 'open',
      reviewState: review.reviewState,
      reviewReason: review.reviewReason,
    };
  });

  // Append selected carryover items that were NOT resolved in this meeting
  const resolvedSet = new Set(raw.resolvedCarryoverIds || []);
  let carryIdx = actionItems.length;
  for (const prev of carryoverSources) {
    if (resolvedSet.has(prev.id)) continue;
    carryIdx += 1;
    actionItems.push({
      ...prev,
      id: `${meetingId}-carry-${carryIdx}`,
      meetingId,
      meetingTitle,
      meetingDate,
      carriedFromMeetingId: prev.carriedFromMeetingId || prev.meetingId,
      carriedFromMeetingTitle: prev.carriedFromMeetingTitle || prev.meetingTitle,
    });
  }

  const blockers: BlockerItem[] = (raw.blockers || []).map((b, idx) => {
    const check = verifyTranscriptEvidence(transcript, b.evidence || '');
    const severity =
      b.severity === 'high' || b.severity === 'low' ? b.severity : 'medium';
    return {
      id: `${meetingId}-blk-${idx + 1}`,
      meetingId,
      blocker: (b.blocker || '').trim(),
      owner: (b.owner || 'Unassigned').trim(),
      severity,
      evidence: (b.evidence || '').trim(),
      evidenceVerified: check.verified,
      evidenceSpan: check.span,
      resolved: false,
    };
  });

  const followUps: FollowUpItem[] = (raw.followUps || []).map((f, idx) => {
    const check = verifyTranscriptEvidence(transcript, f.evidence || '');
    return {
      id: `${meetingId}-fup-${idx + 1}`,
      meetingId,
      topic: (f.topic || '').trim(),
      owner: (f.owner || 'Team').trim(),
      targetDate: (f.targetDate || 'Next sync').trim(),
      evidence: (f.evidence || '').trim(),
      evidenceVerified: check.verified,
      evidenceSpan: check.span,
    };
  });

  return {
    participants: raw.participants || [],
    decisions,
    actionItems,
    blockers,
    followUps,
    resolvedCarryoverIds: Array.from(resolvedSet),
  };
}
