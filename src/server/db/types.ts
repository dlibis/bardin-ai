export interface SeedCompany {
  name: string;
  industry?: string;
  headcount?: number;
  hq?: string;
}

export interface SeedEmployment {
  company: string;
  title: string;
  from: string;
  to: string | null;
}

export interface SeedPerson {
  id: string;
  name: string;
  location?: string | null;
  skills: string[];
  employment: SeedEmployment[];
  referred_by?: string | null;
}

export interface TalentGraphSeed {
  _readme?: string;
  companies?: SeedCompany[];
  people: SeedPerson[];
}

export interface PersonRecord {
  id: string;
  name: string;
  location: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillRecord {
  person_id: string;
  skill: string;
  normalized_skill: string;
  created_at: string;
}

export interface EmploymentRecord {
  id: number;
  person_id: string;
  company: string;
  normalized_company: string;
  title: string;
  from_date: string;
  to_date: string | null;
}

export interface ConnectionRecord {
  id: number;
  source_id: string;
  target_id: string;
  connection_type: 'WORKED_WITH' | 'REFERRED';
  source_employment_id: number | null;
  target_employment_id: number | null;
  overlap_from: string | null;
  overlap_to: string | null;
  overlap_months: number | null;
  as_of_month: string;
  referrer_id: string | null;
  referee_id: string | null;
  traversal_direction: 'FORWARD' | 'REVERSE' | 'SYMMETRIC';
}

export interface ImportStateRecord {
  singleton: boolean;
  input_hash: string;
  effective_snapshot_hash: string;
  as_of_month: string;
  committed_at: string;
}

export interface StalePurgeSummary {
  peopleDeleted: number;
  skillsDeleted: number;
  employmentDeleted: number;
  referralsCleared: number;
  total: number;
}

export interface ImportResult {
  ok: boolean;
  inputHash: string;
  effectiveSnapshotHash: string;
  asOfMonth: string;
  idempotentCheckPassed: boolean;
  peopleCount: number;
  skillsCount: number;
  employmentCount: number;
  logicalConnectionsCount: number;
  storedDirectedRowsCount: number;
  staleRecordsPurged: number;
  staleDetails: StalePurgeSummary;
  warnings: string[];
}
