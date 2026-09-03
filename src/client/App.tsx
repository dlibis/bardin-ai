import React, { useState, useEffect, useCallback } from "react";
import { PersonItem, SearchResponseItem } from "./types.js";
import { fetchPeople, fetchSkills, searchNetwork } from "./api.js";
import { Header } from "./components/Header.js";
import { ErrorBanner } from "./components/ErrorBanner.js";
import { SearchControls } from "./components/SearchControls.js";
import { CandidateList } from "./components/CandidateList.js";
import { GraphCanvasView } from "./components/GraphCanvasView.js";

import { LayoutGrid, Network, Eye } from "lucide-react";

export const App: React.FC = () => {
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);
  const [searchResponse, setSearchResponse] =
    useState<SearchResponseItem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "cards" | "graph">(
    "split",
  );

  // Load initial dropdown options
  const loadInitialData = useCallback(async () => {
    try {
      setLoadingInitial(true);
      setErrorMessage(null);
      const [peopleData, skillsData] = await Promise.all([
        fetchPeople(),
        fetchSkills(),
      ]);
      setPeople(peopleData);
      setSkills(skillsData);
    } catch (err: any) {
      setErrorMessage(`Failed to load network options: ${err.message}`);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Execute Search
  const executeSearch = async (
    personIdToSearch?: string,
    skillToSearch?: string,
  ) => {
    const personId = personIdToSearch || selectedPersonId;
    const skill = skillToSearch || selectedSkill;

    if (!personId || !skill) return;

    try {
      setLoadingSearch(true);
      setErrorMessage(null);
      const res = await searchNetwork(personId, skill);
      setSearchResponse(res);
      setSearched(true);
    } catch (err: any) {
      setErrorMessage(
        err.message || "An error occurred while searching the network.",
      );
    } finally {
      setLoadingSearch(false);
    }
  };

  // 1-Click Test Preset for Dana Ravid + Neo4j
  const handleApplyPreset = () => {
    const targetPersonId = "p1";
    const targetSkill = "Neo4j";
    setSelectedPersonId(targetPersonId);
    setSelectedSkill(targetSkill);
    executeSearch(targetPersonId, targetSkill);
  };

  // Reset form and results
  const handleReset = () => {
    setSelectedPersonId("");
    setSelectedSkill("");
    setSearched(false);
    setSearchResponse(null);
    setErrorMessage(null);
  };

  const selectedPerson = people.find(
    (p) => p.id === (searchResponse?.query?.personId || selectedPersonId),
  );
  const searcherName =
    searchResponse?.query?.personName || selectedPerson?.name || "Searcher";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header onRefreshData={loadInitialData} />

      <ErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search Input Controls */}
        <SearchControls
          people={people}
          skills={skills}
          selectedPersonId={selectedPersonId}
          selectedSkill={selectedSkill}
          loading={loadingSearch || loadingInitial}
          onSelectPerson={setSelectedPersonId}
          onSelectSkill={setSelectedSkill}
          onSearch={() => executeSearch()}
          onReset={handleReset}
          onApplyPreset={handleApplyPreset}
        />

        {/* View Mode Switcher (Visible when results exist) */}
        {searched && searchResponse && searchResponse.resultsCount > 0 && (
          <div className="flex items-center justify-end space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 w-fit ml-auto">
            <button
              onClick={() => setViewMode("split")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "split"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "cards"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Cards View</span>
            </button>
            <button
              onClick={() => setViewMode("graph")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "graph"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Graph & Chains</span>
            </button>
          </div>
        )}

        {/* Results Area */}
        {viewMode === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Candidate Cards */}

            <div className="lg:col-span-6 space-y-6">
              <CandidateList
                loading={loadingSearch}
                searched={searched}
                query={searchResponse?.query || null}
                resultsCount={searchResponse?.resultsCount || 0}
                results={searchResponse?.results || []}
                onApplyPreset={handleApplyPreset}
              />
            </div>

            {/* Right Column: Interactive WebGL Canvas & Accessible Text List */}
            <div className="lg:col-span-6 space-y-6">
              {searched &&
                searchResponse &&
                searchResponse.resultsCount > 0 && (
                  <>
                    <GraphCanvasView
                      searcherId={searchResponse.query.personId}
                      searcherName={searcherName}
                      candidates={searchResponse.results}
                    />
                  </>
                )}
            </div>
          </div>
        )}

        {viewMode === "cards" && (
          <div className="max-w-4xl mx-auto">
            <CandidateList
              loading={loadingSearch}
              searched={searched}
              query={searchResponse?.query || null}
              resultsCount={searchResponse?.resultsCount || 0}
              results={searchResponse?.results || []}
              onApplyPreset={handleApplyPreset}
            />
          </div>
        )}

        {viewMode === "graph" &&
          searched &&
          searchResponse &&
          searchResponse.resultsCount > 0 && (
            <div className="space-y-6">
              <GraphCanvasView
                searcherId={searchResponse.query.personId}
                searcherName={searcherName}
                candidates={searchResponse.results}
              />
            </div>
          )}
      </main>

      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        Talent Network Search
      </footer>
    </div>
  );
};
