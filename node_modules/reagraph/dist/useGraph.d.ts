import { LayoutOverrides, LayoutTypes } from './layout';
import { SizingType } from './sizing';
import { GraphEdge, GraphNode } from './types';
import { LabelVisibilityType } from './utils/visibility';
export interface GraphInputs {
    nodes: GraphNode[];
    edges: GraphEdge[];
    collapsedNodeIds?: string[];
    layoutType?: LayoutTypes;
    sizingType?: SizingType;
    labelType?: LabelVisibilityType;
    sizingAttribute?: string;
    selections?: string[];
    actives?: string[];
    clusterAttribute?: string;
    defaultNodeSize?: number;
    minNodeSize?: number;
    maxNodeSize?: number;
    constrainDragging?: boolean;
    layoutOverrides?: LayoutOverrides;
}
export declare const useGraph: ({ layoutType, sizingType, labelType, sizingAttribute, clusterAttribute, selections, nodes, edges, actives, collapsedNodeIds, defaultNodeSize, maxNodeSize, minNodeSize, layoutOverrides, constrainDragging }: GraphInputs) => {
    updateLayout: (curLayout?: any) => Promise<void>;
};
