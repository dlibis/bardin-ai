import { CircularLayoutInputs } from './circular2d';
import { ConcentricLayoutInputs } from './concentric2d';
import { ForceDirectedLayoutInputs } from './forceDirected';
import { HierarchicalLayoutInputs } from './hierarchical';
import { LayoutFactoryProps, LayoutStrategy } from './types';
export type LayoutOverrides = Partial<Omit<ForceDirectedLayoutInputs, 'dimensions' | 'mode'> | CircularLayoutInputs | ConcentricLayoutInputs | HierarchicalLayoutInputs>;
export declare const FORCE_LAYOUTS: string[];
export declare function layoutProvider({ type, ...rest }: LayoutFactoryProps | LayoutOverrides): LayoutStrategy;
