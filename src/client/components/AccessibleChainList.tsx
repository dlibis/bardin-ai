import React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { CandidateResultItem } from '../types.js';

interface AccessibleChainListProps {
  candidates: CandidateResultItem[];
  searcherName: string;
  skill: string;
}

export const AccessibleChainList: React.FC<AccessibleChainListProps> = ({
  candidates,
  searcherName,
  skill,
}) => {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <details className="group glass-panel rounded-2xl p-4 transition-all duration-200 border border-slate-800/80">
      <summary className="flex items-center justify-between cursor-pointer list-none select-none text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
        <span className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-semibold text-slate-300">Raw Path Text & Screen Reader Details</span>
          <span className="text-[11px] text-slate-500 font-mono">({candidates.length} paths)</span>
        </span>
        <span className="text-slate-500 group-open:rotate-180 transition-transform duration-200">
          <ChevronDown className="w-4 h-4" />
        </span>
      </summary>

      <section aria-labelledby="accessible-chain-heading" className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
        <div>
          <h3 id="accessible-chain-heading" className="text-sm font-semibold text-slate-200">
            Accessible Connection Path Breakdown
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Text introduction paths for {skill} candidates reachable from {searcherName}.
          </p>
        </div>

        <ol className="space-y-4 list-decimal list-inside" role="list">
          {candidates.map((cand) => (
            <li key={cand.person.id} className="pb-3 border-b border-slate-800/60 last:border-0">
              <span className="font-medium text-slate-200 text-xs">
                {cand.person.name} ({cand.person.location}) — {cand.depth === 1 ? '1st Degree' : '2nd Degree'}
              </span>

              {/* Primary Chain */}
              <div className="mt-1.5 ml-4 space-y-1">
                <div className="text-[11px] text-emerald-400 font-medium">Primary Path:</div>
                <div className="text-xs text-slate-300 bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800/60 font-sans">
                  {cand.primaryChain.display}
                </div>

                <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                  {cand.primaryChain.steps.map((step, stepIdx) => (
                    <div key={stepIdx} className="ml-2">
                      • <strong>Step {stepIdx + 1}:</strong> {step.fromName} → {step.toName}
                      {step.type === 'WORKED_WITH' && step.company && (
                        <span> (Coworkers at {step.company}, {step.overlapFrom} to {step.overlapTo || 'ongoing'})</span>
                      )}
                      {step.type === 'REFERRED' && (
                        <span> ({step.traversalDirection === 'FORWARD' ? 'referred' : 'referred by'})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Alternative Chains */}
              {cand.totalAlternativeChains > 0 && (
                <div className="mt-2.5 ml-4 space-y-1">
                  <div className="text-[11px] text-indigo-400 font-medium">
                    Alternative Paths ({cand.totalAlternativeChains}):
                  </div>
                  {cand.alternativeChains.map((alt, altIdx) => (
                    <div key={altIdx} className="text-xs text-slate-300 bg-slate-900/30 px-2.5 py-1.5 rounded-lg border border-slate-800/40">
                      {alt.display}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </details>
  );
};
