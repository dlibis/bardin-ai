export interface LatestRole {
  company: string;
  title: string;
  from: string;
  to: string | null;
  isCurrent: boolean;
}

export interface PersonItem {
  id: string;
  name: string;
  location: string;
  skills: string[];
  latestRole: LatestRole | null;
}

export interface ReasonItem {
  type: 'WORKED_WITH' | 'REFERRED';
  traversalDirection?: 'FORWARD' | 'REVERSE';
  company?: string;
  overlapFrom?: string;
  overlapTo?: string | null;
  overlapMonths?: number;
  referrerId?: string;
  refereeId?: string;
  text: string;
}

export interface ChainStepItem {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: 'WORKED_WITH' | 'REFERRED';
  traversalDirection?: 'FORWARD' | 'REVERSE';
  company?: string;
  overlapFrom?: string;
  overlapTo?: string | null;
  overlapMonths?: number;
  text: string;
  reasons: ReasonItem[];
}

export interface ChainItem {
  display: string;
  steps: ChainStepItem[];
}

export interface CandidateResultItem {
  person: {
    id: string;
    name: string;
    location: string;
    skills: string[];
  };
  depth: number;
  primaryChain: ChainItem;
  alternativeChains: ChainItem[];
  totalAlternativeChains: number;
  alternativesTruncated: boolean;
}

export interface SearchQueryItem {
  personId: string;
  personName: string;
  skill: string;
}

export interface SearchResponseItem {
  query: SearchQueryItem;
  resultsCount: number;
  results: CandidateResultItem[];
}

export interface ImportStats {
  peopleCount: number;
  employmentCount: number;
  skillsCount: number;
  logicalConnectionReasonsCount: number;
  storedDirectedEvidenceRowsCount: number;
  asOfMonth: string;
  inputHash: string;
  effectiveSnapshotHash: string;
  idempotentCheckPassed: boolean;
  reconciliation: {
    peoplePurged: number;
    skillsPurged: number;
    employmentPurged: number;
    referralsCleared: number;
    totalPurged: number;
  };
}

export interface ImportResponseItem {
  success: boolean;
  warnings: any[];
  stats: ImportStats;
}
