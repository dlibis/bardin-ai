import React, { Component, ErrorInfo, ReactNode, useMemo } from 'react';
import { GraphCanvas, GraphNode, GraphEdge, darkTheme } from 'reagraph';
import { CandidateResultItem } from '../types.js';
import { AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphCanvasViewProps {
  searcherId: string;
  searcherName: string;
  candidates: CandidateResultItem[];
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('Reagraph WebGL Canvas encountered an error (falling back):', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const GraphCanvasView: React.FC<GraphCanvasViewProps> = ({
  searcherId,
  searcherName,
  candidates,
}) => {
  // Build graph nodes and edges from all discovered primary & alternative chains
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();

    // 1. Root / Searcher node
    nodeMap.set(searcherId, {
      id: searcherId,
      label: `${searcherName} (You)`,
      fill: '#10b981', // Emerald
      size: 16,
    });

    // 2. Process all candidates and their chain steps
    candidates.forEach((cand) => {
      // Candidate node
      nodeMap.set(cand.person.id, {
        id: cand.person.id,
        label: `${cand.person.name} (${cand.depth === 1 ? '1st' : '2nd'})`,
        fill: '#8b5cf6', // Purple / Violet
        size: 14,
      });

      // Steps in primary chain
      cand.primaryChain.steps.forEach((step) => {
        if (!nodeMap.has(step.fromId)) {
          nodeMap.set(step.fromId, {
            id: step.fromId,
            label: step.fromName,
            fill: '#38bdf8', // Light blue (intermediary)
            size: 10,
          });
        }
        if (!nodeMap.has(step.toId)) {
          nodeMap.set(step.toId, {
            id: step.toId,
            label: step.toName,
            fill: '#38bdf8',
            size: 10,
          });
        }

        const edgeId = `${step.fromId}->${step.toId}:${step.type}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            source: step.fromId,
            target: step.toId,
            label: step.type === 'REFERRED'
              ? (step.traversalDirection === 'FORWARD' ? 'referred' : 'referred by')
              : (step.company || 'worked with'),
            fill: '#10b981', // Primary edge green
            size: 2,
          });
        }
      });

      // Steps in alternative chains (subtle edges)
      cand.alternativeChains.forEach((alt) => {
        alt.steps.forEach((step) => {
          if (!nodeMap.has(step.fromId)) {
            nodeMap.set(step.fromId, {
              id: step.fromId,
              label: step.fromName,
              fill: '#64748b',
              size: 9,
            });
          }
          if (!nodeMap.has(step.toId)) {
            nodeMap.set(step.toId, {
              id: step.toId,
              label: step.toName,
              fill: '#64748b',
              size: 9,
            });
          }

          const altEdgeId = `alt:${step.fromId}->${step.toId}:${step.type}`;
          if (!edgeMap.has(altEdgeId)) {
            edgeMap.set(altEdgeId, {
              id: altEdgeId,
              source: step.fromId,
              target: step.toId,
              label: step.type === 'REFERRED'
                ? (step.traversalDirection === 'FORWARD' ? 'referred' : 'referred by')
                : (step.company || 'worked with'),
              fill: '#475569', // Muted slate edge
              size: 1,
            });
          }
        });
      });
    });

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }, [searcherId, searcherName, candidates]);

  const fallbackView = (
    <div className="h-[480px] flex flex-col items-center justify-center p-6 text-center bg-slate-900/60 rounded-xl border border-slate-800">
      <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
      <h4 className="text-sm font-semibold text-slate-200">WebGL Hardware Acceleration Unavailable</h4>
      <p className="text-xs text-slate-400 mt-1 max-w-md">
        Your browser or environment does not support WebGL canvas rendering. Use the textual chain breakdown below to review all verified paths.
      </p>
    </div>
  );

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-xl space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            Interactive Network Canvas
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              Reagraph WebGL
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            {nodes.length} people · {edges.length} paths within 2 hops
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-300 text-[11px]">Searcher</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span className="text-slate-300 text-[11px]">Intermediary</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-slate-300 text-[11px]">Candidate</span>
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <div className="h-[480px] w-full rounded-xl overflow-hidden bg-slate-950/80 border border-slate-800/80 relative">
        <WebGLErrorBoundary fallback={fallbackView}>
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            theme={darkTheme}
            layoutType="forceDirected2d"
            animated={false}
          />
        </WebGLErrorBoundary>
      </div>
    </div>
  );
};
