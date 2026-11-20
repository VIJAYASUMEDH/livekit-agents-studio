import type {
  ActionItem,
  CommitmentType,
  EvidenceMatchType,
  EvidenceSpan,
  ReviewState,
} from '../types/actiongraph.ts';

export interface EvidenceVerificationResult {
  verified: boolean;
  matchType: EvidenceMatchType;
  span?: EvidenceSpan;
}

function normalizeTextWithMap(input: string): {
  normalized: string;
  indexMap: number[];
} {
  let normalized = '';
  const indexMap: number[] = [];
  let prevWasSpace = true;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const isWhitespace = /\s/.test(ch);
    const isSmartQuote =
      ch === '“' || ch === '”' || ch === '‘' || ch === '’';
    const mapped =
      ch === '“' || ch === '”'
        ? '"'
        : ch === '‘' || ch === '’'
          ? "'"
          : ch === '—' || ch === '–'
            ? '-'
            : ch.toLowerCase();

    if (isWhitespace) {
      if (!prevWasSpace) {
        normalized += ' ';
        indexMap.push(i);
        prevWasSpace = true;
      }
      continue;
    }

    if (isSmartQuote || mapped) {
      normalized += mapped;
      indexMap.push(i);
      prevWasSpace = false;
    }
  }

  return {
    normalized: normalized.trimEnd(),
    indexMap,
  };
}

export function verifyTranscriptEvidence(
  transcript: string,
  evidence: string
): EvidenceVerificationResult {
  const cleanEvidence = evidence.trim().replace(/^["']|["']$/g, '');
  if (!transcript || !cleanEvidence || cleanEvidence.length < 8) {
    return { verified: false, matchType: 'none' };
  }

  // 1. Exact substring match
  const exactIdx = transcript.indexOf(cleanEvidence);
  if (exactIdx !== -1) {
    return {
      verified: true,
      matchType: 'exact',
      span: { start: exactIdx, end: exactIdx + cleanEvidence.length },
    };
  }

  // 2. Normalized whitespace/case/smart-quote match with exact char span mapping
  const { normalized: normTranscript, indexMap } =
    normalizeTextWithMap(transcript);
  const { normalized: normEvidence } = normalizeTextWithMap(cleanEvidence);

  if (normEvidence.length >= 8) {
    const normIdx = normTranscript.indexOf(normEvidence);
    if (normIdx !== -1) {
      const start = indexMap[normIdx] ?? 0;
      const lastNormChar = Math.min(
        indexMap.length - 1,
        normIdx + normEvidence.length - 1
      );
      const end = (indexMap[lastNormChar] ?? start) + 1;
      return {
        verified: true,
        matchType: 'normalized',
        span: { start, end },
      };
    }

    // 3. Strip optional leading "Speaker:" prefix if model quoted only utterance
    const stripped = normEvidence.replace(/^[a-z0-9 ._'-]{2,28}:\s*/i, '');
    if (stripped.length >= 14 && stripped !== normEvidence) {
      const strippedIdx = normTranscript.indexOf(stripped);
      if (strippedIdx !== -1) {
        const start = indexMap[strippedIdx] ?? 0;
        const lastChar = Math.min(
          indexMap.length - 1,
          strippedIdx + stripped.length - 1
        );
        const end = (indexMap[lastChar] ?? start) + 1;
        return {
          verified: true,
          matchType: 'normalized',
          span: { start, end },
        };
      }
    }
  }

  return { verified: false, matchType: 'none' };
}

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function addDaysIso(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function resolveDeadlineIso(
  deadlineText: string,
  meetingDateIso: string
): string | null {
  const raw = deadlineText.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (
    lower === 'unspecified' ||
    lower === 'tbd' ||
    lower === 'none' ||
    lower === 'unknown' ||
    lower === 'soon' ||
    lower === 'when possible'
  ) {
    return null;
  }

  // Exact YYYY-MM-DD
  const isoMatch = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Month DD(, YYYY)
  const monthMatch = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/
  );
  if (monthMatch) {
    const baseYear = Number(meetingDateIso.slice(0, 4)) || 2026;
    const year = monthMatch[3] ? Number(monthMatch[3]) : baseYear;
    const month = MONTH_MAP[monthMatch[1]];
    const day = Number(monthMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const dt = new Date(Date.UTC(year, month, day));
      return dt.toISOString().slice(0, 10);
    }
  }

  if (/\b(today|eod|end of day|tonight)\b/.test(lower)) {
    return meetingDateIso;
  }

  if (/\btomorrow\b/.test(lower)) {
    return addDaysIso(meetingDateIso, 1);
  }

  if (/\b(eow|end of week|end of the week)\b/.test(lower)) {
    const [y, m, d] = meetingDateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    const daysToFri = (5 - dow + 7) % 7 || 7;
    return addDaysIso(meetingDateIso, daysToFri);
  }

  const weekdayMatch = lower.match(
    /\b(next\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)\b/
  );
  if (weekdayMatch) {
    const targetDow = WEEKDAY_MAP[weekdayMatch[2]];
    const [y, m, d] = meetingDateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const currentDow = dt.getUTCDay();
    let delta = (targetDow - currentDow + 7) % 7;
    if (delta === 0) delta = 7;
    if (weekdayMatch[1] && delta < 7) {
      delta += 7;
    }
    return addDaysIso(meetingDateIso, delta);
  }

  if (/\bnext week\b/.test(lower)) {
    return addDaysIso(meetingDateIso, 7);
  }

  return null;
}

export function evaluateHumanReview(
  params: {
    confidence: number;
    evidenceVerified: boolean;
    owner: string;
    deadline: string;
    deadlineIso: string | null;
    commitmentType: CommitmentType;
  },
  confidenceThreshold: number
): { reviewState: ReviewState; reviewReason?: string } {
  const reasons: string[] = [];

  if (!params.evidenceVerified) {
    reasons.push('Unverified transcript evidence (potential hallucination)');
  }
  if (params.confidence < confidenceThreshold) {
    reasons.push(
      `Confidence ${(params.confidence * 100).toFixed(0)}% below threshold ${(confidenceThreshold * 100).toFixed(0)}%`
    );
  }
  if (!params.owner || params.owner.toLowerCase() === 'unassigned') {
    reasons.push('Missing or ambiguous owner');
  }
  if (
    params.commitmentType === 'implicit' &&
    (!params.deadlineIso || params.deadline.toLowerCase() === 'unspecified')
  ) {
    reasons.push('Implicit commitment without concrete deadline');
  }

  if (reasons.length > 0) {
    return {
      reviewState: 'needs_review',
      reviewReason: reasons.join(' · '),
    };
  }

  return {
    reviewState: 'auto_approved',
  };
}

export function isActionOverdue(item: ActionItem, todayIso: string): boolean {
  if (
    item.status === 'done' ||
    item.status === 'rejected' ||
    item.reviewState === 'rejected'
  ) {
    return false;
  }
  if (!item.deadlineIso) return false;
  return item.deadlineIso < todayIso;
}
