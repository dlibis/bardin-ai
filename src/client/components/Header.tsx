import React, { useState } from 'react';
import { Network, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { triggerImport } from '../api.js';

interface HeaderProps {
  onRefreshData: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onRefreshData }) => {
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleSyncSeed = async () => {
    try {
      setImporting(true);
      setImportStatus(null);
      const res = await triggerImport(true);
      if (res.success) {
        setImportStatus(`Seed synced: ${res.stats.peopleCount} people, ${res.stats.storedDirectedEvidenceRowsCount} connections`);
        onRefreshData();
        setTimeout(() => setImportStatus(null), 4000);
      }
    } catch (err: any) {
      setImportStatus(`Sync failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30">
            <Network className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">Talent Network Search</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                2 Degrees
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Warm intros & verified referral paths</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {importStatus && (
            <div className="text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 flex items-center space-x-1.5 animate-fadeIn">
              {importStatus.includes('failed') ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{importStatus}</span>
            </div>
          )}

          <button
            onClick={handleSyncSeed}
            disabled={importing}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
            title="Re-import bundled talent-graph-seed.json snapshot"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden md:inline">{importing ? 'Syncing...' : 'Re-sync Seed'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
