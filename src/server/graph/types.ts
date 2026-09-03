export type ConnectionReasonType = 'WORKED_WITH' | 'REFERRED';

export interface ConnectionReason {
  type: ConnectionReasonType;
  company?: string;
  overlapFrom?: string;
  overlapTo?: string | null;
  overlapMonths?: number;
  traversalDirection?: 'FORWARD' | 'REVERSE' | 'SYMMETRIC';
  text: string;
  evidenceKey: string;
}

export interface LogicalStep {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: ConnectionReasonType;
  traversalDirection?: 'FORWARD' | 'REVERSE' | 'SYMMETRIC';
  company?: string;
  overlapFrom?: string;
  overlapTo?: string | null;
  overlapMonths?: number;
  text: string;
  reasons: ConnectionReason[];
}

export interface CandidateChain {
  display: string;
  steps: LogicalStep[];
}

export interface CandidatePerson {
  id: string;
  name: string;
  location: string | null;
  skills: string[];
}

export interface SearchCandidate {
  person: CandidatePerson;
  depth: number;
  primaryChain: CandidateChain;
  alternativeChains: CandidateChain[];
  totalAlternativeChains: number;
  alternativesTruncated: boolean;
}

export interface SearchResult {
  query: {
    personId: string;
    personName: string;
    skill: string;
  };
  resultsCount: number;
  results: SearchCandidate[];
}

export interface RawPathRow {
  target_id: string;
  depth: number;
  person_path: string[];
  edge_details: Array<{
    sourceId: string;
    targetId: string;
    reasons: ConnectionReason[];
  }>;
}
