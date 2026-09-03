import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Briefcase,
  UserCheck,
  ArrowRight,
  GitFork,
} from "lucide-react";
import { CandidateResultItem, ChainItem, ChainStepItem } from "../types.js";

interface CandidateCardProps {
  candidate: CandidateResultItem;
  rankIndex: number;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  rankIndex,
}) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const {
    person,
    depth,
    primaryChain,
    alternativeChains,
    totalAlternativeChains,
  } = candidate;

  return (
    <div className="glass-card rounded-2xl p-5 transition-all duration-200 shadow-md">
      {/* Top row: Rank, Name, Location, Depth Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center shrink-0 border border-slate-700">
            #{rankIndex + 1}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              {person.name}
            </h3>
            <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>{person.location}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide border ${
              depth === 1
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
            }`}
          >
            {depth === 1 ? "1st Degree" : "2nd Degree"}
          </span>
        </div>
      </div>

      {/* Skills list */}
      <div className="py-3 flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-slate-400 mr-1">Skills:</span>
        {person.skills.map((s) => (
          <span
            key={s}
            className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-200 border border-slate-700/60 text-xs font-mono"
          >
            {s}
          </span>
        ))}
      </div>

      {/* Primary Connection Chain */}
      <div className="mt-2 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80">
        <ChainDisplay chain={primaryChain} isPrimary={true} />
      </div>

      {/* Alternative Paths Section (Progressive Disclosure) */}
      {totalAlternativeChains > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors"
            id={`toggle-alternatives-${person.id}`}
          >
            <span className="flex items-center space-x-1.5">
              <GitFork className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {totalAlternativeChains} alternative path
                {totalAlternativeChains > 1 ? "s" : ""}
              </span>
            </span>
            {showAlternatives ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showAlternatives && (
            <div className="mt-2 space-y-2 pt-1">
              {alternativeChains.map((altChain, i) => (
                <div
                  key={i}
                  className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60"
                >
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Alternative #{i + 1}
                  </div>
                  <ChainDisplay chain={altChain} isPrimary={false} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ChainDisplayProps {
  chain: ChainItem;
  isPrimary: boolean;
}

const ChainDisplay: React.FC<ChainDisplayProps> = ({ chain, isPrimary }) => {
  return (
    <div className="space-y-2" aria-label={chain.display}>
      {/* Visual step breakdown */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        {chain.steps.map((step, idx) => (
          <React.Fragment key={idx}>
            {/* Step node */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <div className="text-xs bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700/80 text-slate-200 font-medium">
                {step.fromName}
              </div>

              {/* Edge relation pill */}
              <div
                className={`flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-md border ${
                  step.type === "REFERRED"
                    ? step.traversalDirection === "FORWARD"
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : "bg-purple-500/10 text-purple-300 border-purple-500/30"
                    : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                }`}
                title={step.reasons.map((r) => r.text).join(" & ")}
              >
                {step.type === "REFERRED" ? (
                  <span>
                    {step.traversalDirection === "FORWARD"
                      ? "referred →"
                      : "referred by →"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-blue-400 shrink-0" />
                    <span>{step.company}</span>
                    {step.overlapFrom && step.overlapTo && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({step.overlapFrom.slice(0, 4)}–
                        {step.overlapTo.slice(0, 4)})
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Target on the last step */}
              {idx === chain.steps.length - 1 && (
                <div className="text-xs bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 font-semibold">
                  {step.toName}
                </div>
              )}
            </div>

            {idx < chain.steps.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 hidden sm:block shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
