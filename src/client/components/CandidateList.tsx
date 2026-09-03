import React from 'react';
import { Search, Users, Sparkles } from 'lucide-react';
import { CandidateResultItem, SearchQueryItem } from '../types.js';
import { CandidateCard } from './CandidateCard.js';

interface CandidateListProps {
  loading: boolean;
  searched: boolean;
  query: SearchQueryItem | null;
  resultsCount: number;
  results: CandidateResultItem[];
  onApplyPreset: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  loading,
  searched,
  query,
  resultsCount,
  results,
  onApplyPreset,
}) => {
  // Skeleton Loading State
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 animate-pulse">
          <div className="h-5 w-48 bg-slate-800 rounded"></div>
          <div className="h-5 w-24 bg-slate-800 rounded"></div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 border border-slate-800 animate-pulse space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="h-5 w-40 bg-slate-800 rounded"></div>
                <div className="h-3 w-28 bg-slate-800/60 rounded"></div>
              </div>
              <div className="h-6 w-32 bg-slate-800 rounded-full"></div>
            </div>
            <div className="flex space-x-2">
              <div className="h-5 w-16 bg-slate-800 rounded"></div>
              <div className="h-5 w-20 bg-slate-800 rounded"></div>
              <div className="h-5 w-16 bg-slate-800 rounded"></div>
            </div>
            <div className="h-16 bg-slate-900/80 rounded-xl"></div>
          </div>
        ))}
      </div>
    );
  }

  // Not searched yet (Initial Welcome / Prompt)
  if (!searched) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <Users className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-100">Ready to Discover Warm Leads</h3>
          <p className="text-xs text-slate-400 mt-1.5">
            Choose a contact and skill, or run the preset to view warm paths.
          </p>
        </div>
        <button
          type="button"
          onClick={onApplyPreset}
          className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-xl transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Try Preset: Dana Ravid + Neo4j</span>
        </button>
      </div>
    );
  }

  // Valid Empty Search Result (Explicit requirement: name selected skill and person!)
  if (resultsCount === 0) {
    return (
      <div className="glass-panel rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
          <Search className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-200">No Candidates Found</h3>
          <p className="text-xs text-slate-400 mt-1">
            No candidates with '{query?.skill}' found within 2 hops of {query?.personName}.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          Try another contact or a skill like TypeScript, Postgres, or Go.
        </p>
      </div>
    );
  }

  // Active Results List
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-slate-100">Discovered Candidates</h2>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
            {resultsCount} {resultsCount === 1 ? 'candidate' : 'candidates'}
          </span>
        </div>
        <div className="text-xs text-slate-400">
          From <span className="text-slate-200 font-medium">{query?.personName}</span> • Skill: <span className="text-emerald-400 font-medium">{query?.skill}</span>
        </div>
      </div>

      <div className="space-y-4">
        {results.map((candidate, idx) => (
          <CandidateCard key={candidate.person.id} candidate={candidate} rankIndex={idx} />
        ))}
      </div>
    </div>
  );
};
