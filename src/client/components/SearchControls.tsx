import React from 'react';
import { Search, Sparkles, User, Wrench, RotateCcw, ChevronDown } from 'lucide-react';
import { PersonItem } from '../types.js';

interface SearchControlsProps {
  people: PersonItem[];
  skills: string[];
  selectedPersonId: string;
  selectedSkill: string;
  loading: boolean;
  onSelectPerson: (id: string) => void;
  onSelectSkill: (skill: string) => void;
  onSearch: () => void;
  onReset: () => void;
  onApplyPreset: () => void;
}

export const SearchControls: React.FC<SearchControlsProps> = ({
  people,
  skills,
  selectedPersonId,
  selectedSkill,
  loading,
  onSelectPerson,
  onSelectSkill,
  onSearch,
  onReset,
  onApplyPreset,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPersonId && selectedSkill) {
      onSearch();
    }
  };

  const selectedPerson = people.find((p) => p.id === selectedPersonId);

  return (
    <div className="glass-panel rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-400" />
            Network Talent Search
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Find warm introduction paths up to 2 hops away.
          </p>
        </div>

        {/* 1-Click Test Preset Button */}
        <button
          type="button"
          onClick={onApplyPreset}
          className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 hover:border-emerald-400/50 rounded-xl transition-all shadow-sm hover:shadow-emerald-500/10 group cursor-pointer"
          id="preset-dana-neo4j"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>Preset: Dana Ravid + Neo4j</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Person Selector */}
        <div className="md:col-span-5 flex flex-col">
          <label htmlFor="person-select" className="text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5 h-4">
            <User className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Starting Connection</span>
          </label>
          <div className="relative">
            <select
              id="person-select"
              value={selectedPersonId}
              onChange={(e) => onSelectPerson(e.target.value)}
              className="w-full h-11 bg-slate-900/90 border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-slate-100 rounded-xl pl-3.5 pr-9 text-sm appearance-none cursor-pointer transition-colors shadow-sm"
              required
            >
              <option value="" disabled>Select starting person...</option>
              {people.map((p) => {
                const roleDesc = p.latestRole
                  ? ` — ${p.latestRole.title} @ ${p.latestRole.company}${p.latestRole.isCurrent ? ' (Current)' : ''}`
                  : '';
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.location}){roleDesc}
                  </option>
                );
              })}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1.5 min-h-[20px] flex items-center">
            {selectedPerson && selectedPerson.latestRole ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-wrap">
                <span className="text-slate-300 font-medium">{selectedPerson.latestRole.company}</span>
                <span className="text-slate-600">•</span>
                <span>{selectedPerson.latestRole.title}</span>
                {selectedPerson.latestRole.isCurrent ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                    Current
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] border border-slate-700/50">
                    Past
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-slate-500">Starting point for warm referral paths</span>
            )}
          </div>
        </div>

        {/* Skill Selector */}
        <div className="md:col-span-4 flex flex-col">
          <label htmlFor="skill-select" className="text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5 h-4">
            <Wrench className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Target Skill</span>
          </label>
          <div className="relative">
            <select
              id="skill-select"
              value={selectedSkill}
              onChange={(e) => onSelectSkill(e.target.value)}
              className="w-full h-11 bg-slate-900/90 border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-slate-100 rounded-xl pl-3.5 pr-9 text-sm appearance-none cursor-pointer transition-colors shadow-sm"
              required
            >
              <option value="" disabled>Select skill...</option>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-1.5 min-h-[20px] flex items-center text-[11px] text-slate-500">
            <span>Select a skill (e.g. Neo4j, Postgres)</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="md:col-span-3 flex flex-col">
          <div className="text-xs font-medium text-transparent mb-1.5 select-none hidden md:flex items-center gap-1.5 h-4" aria-hidden="true">
            <span>&nbsp;</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="submit"
              disabled={loading || !selectedPersonId || !selectedSkill}
              className="flex-1 h-11 inline-flex items-center justify-center space-x-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-emerald-700/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              id="search-btn"
            >
              <Search className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Searching...' : 'Find Contacts'}</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              disabled={loading}
              className="h-11 w-11 flex items-center justify-center text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              title="Reset form"
              aria-label="Reset form"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-1.5 min-h-[20px] hidden md:block" aria-hidden="true" />
        </div>
      </form>
    </div>
  );
};
