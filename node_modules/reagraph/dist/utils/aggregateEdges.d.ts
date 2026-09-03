import { default as Graph } from 'graphology';
import { InternalGraphEdge } from '../types';
import { LabelVisibilityType } from './visibility';
/**
 * Graphology-native approach using reduceEdges for optimal performance
 * @param graph Graphology graph instance
 * @returns Map with source-target pairs as keys and arrays of edges as values
 */
export declare const groupEdgesBySourceTarget: (graph: Graph) => Map<string, InternalGraphEdge[]>;
/**
 * Aggregates edges with the same source and target using Graphology's native functions
 * @param graph Graphology graph instance
 * @param labelType Label visibility type to determine if edge labels should be visible
 * @returns Array of aggregated edges
 */
export declare const aggregateEdges: (graph: Graph, labelType?: LabelVisibilityType) => InternalGraphEdge[];
