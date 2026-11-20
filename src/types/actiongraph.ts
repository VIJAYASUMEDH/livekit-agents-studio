export type WorkspaceTab =
  | 'dashboard'
  | 'ingest'
  | 'review'
  | 'meetings'
  | 'evaluation';

export type CommitmentType = 'explicit' | 'implicit';

export type ActionStatus = 'open' | 'in_progress' | 'done' | 'rejected';

export type ReviewState =
  | 'auto_approved'
  | 'needs_review'
  | 'approved'
  | 'rejected';

export type EvidenceMatchType = 'exact' | 'normalized' | 'none';

export interface EvidenceSpan {
  start: number;
  end: number;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  meetingTitle?: string;
  meetingDate?: string;
  carriedFromMeetingId?: string;
  carriedFromMeetingTitle?: string;
  action: string;
  commitmentType: CommitmentType;
  owner: string;
  deadline: string;
  deadlineIso: string | null;
  confidence: number;
  evidence: string;
  evidenceVerified: boolean;
  evidenceMatchType: EvidenceMatchType;
  evidenceSpan?: EvidenceSpan;
  status: ActionStatus;
  reviewState: ReviewState;
  reviewReason?: string;
}

export interface DecisionItem {
  id: string;
  meetingId: string;
  decision: string;
  owner: string;
  confidence: number;
  evidence: string;
  evidenceVerified: boolean;
  evidenceSpan?: EvidenceSpan;
}

export interface BlockerItem {
  id: string;
  meetingId: string;
  blocker: string;
  owner: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  evidenceVerified: boolean;
  evidenceSpan?: EvidenceSpan;
  resolved: boolean;
}

export interface FollowUpItem {
  id: string;
  meetingId: string;
  topic: string;
  owner: string;
  targetDate: string;
  evidence: string;
  evidenceVerified: boolean;
  evidenceSpan?: EvidenceSpan;
}

export interface MeetingRecord {
  id: string;
  title: string;
  meetingDate: string;
  createdAt: string;
  sourceType: 'transcript' | 'audio' | 'seed';
  participants: string[];
  transcript: string;
  extractionProvider: 'gemini-4-hydrogen' | 'structured-fallback' | 'seed';
  decisions: DecisionItem[];
  actionItems: ActionItem[];
  blockers: BlockerItem[];
  followUps: FollowUpItem[];
  carryoverCount: number;
  resolvedCarryoverIds: string[];
}

export interface DashboardSummary {
  totalMeetings: number;
  totalActions: number;
  openActions: number;
  overdueActions: number;
  carryoverActions: number;
  needsReviewCount: number;
  explicitCount: number;
  implicitCount: number;
  verifiedEvidenceRate: number;
  decisionsCount: number;
  openBlockersCount: number;
  todayIso: string;
}

export interface ActionGraphStateResponse {
  meetings: MeetingRecord[];
  confidenceThreshold: number;
  summary: DashboardSummary;
}

export interface RawExtractedAction {
  action: string;
  commitmentType: CommitmentType;
  owner: string;
  deadline: string;
  confidence: number;
  evidence: string;
}

export interface RawExtractedDecision {
  decision: string;
  owner: string;
  confidence: number;
  evidence: string;
}

export interface RawExtractedBlocker {
  blocker: string;
  owner: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface RawExtractedFollowUp {
  topic: string;
  owner: string;
  targetDate: string;
  evidence: string;
}

export interface RawMeetingExtraction {
  participants: string[];
  decisions: RawExtractedDecision[];
  actionItems: RawExtractedAction[];
  blockers: RawExtractedBlocker[];
  followUps: RawExtractedFollowUp[];
  resolvedCarryoverIds: string[];
}

export interface GoldEvalActionItem {
  action: string;
  commitmentType: CommitmentType;
  owner: string;
  deadline: string;
}

export interface EvalMeetingCase {
  id: string;
  title: string;
  meetingDate: string;
  transcript: string;
  goldActions: GoldEvalActionItem[];
}

export interface ClassificationMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EvalMeetingCaseResult {
  caseId: string;
  title: string;
  explicit: ClassificationMetrics;
  implicit: ClassificationMetrics;
  predictedCount: number;
  goldCount: number;
  hallucinatedCount: number;
  unverifiedEvidenceCount: number;
  latencyMs: number;
  matchedPairs: Array<{
    goldAction: string;
    predictedAction: string;
    commitmentType: CommitmentType;
    evidenceVerified: boolean;
  }>;
  missedGold: GoldEvalActionItem[];
  falsePositives: Array<{
    action: string;
    commitmentType: CommitmentType;
    owner: string;
    evidenceVerified: boolean;
    evidence: string;
  }>;
}

export interface EvalMetricsResult {
  runAt: string;
  mode: 'deterministic-pipeline' | 'gemini-live';
  confidenceThreshold: number;
  totalMeetings: number;
  explicit: ClassificationMetrics;
  implicit: ClassificationMetrics;
  overall: ClassificationMetrics;
  hallucinationRate: number;
  evidenceGroundingRate: number;
  avgLatencyMs: number;
  cases: EvalMeetingCaseResult[];
}
