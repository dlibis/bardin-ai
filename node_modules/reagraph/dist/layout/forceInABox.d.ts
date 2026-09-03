/**
 * Used for calculating clusterings of nodes.
 *
 * Modified version of: https://github.com/john-guerra/forceInABox
 *
 * Changes:
 *  - Improved d3 import for tree shaking
 *  - Fixed node lookup for edges using array
 *  - Updated d3-force to use d3-force-3d
 *  - Removed template logic
 */
export declare function forceInABox(): {
    (alpha: any): /*elided*/ any;
    initialize(_: any): void;
    template(x: any): string | /*elided*/ any;
    groupBy(x: any): (d: any) => any;
    enableGrouping(x: any): boolean | /*elided*/ any;
    strength(x: any): any;
    getLinkStrength(e: any): any;
    id(_: any): (d: any) => any;
    size(_: any): number[] | /*elided*/ any;
    linkStrengthInterCluster(_: any): number | /*elided*/ any;
    linkStrengthIntraCluster(_: any): number | /*elided*/ any;
    nodes(_: any): any[] | /*elided*/ any;
    links(_: any): any[] | /*elided*/ any;
    forceNodeSize(_: any): (() => any) | /*elided*/ any;
    nodeSize: (_: any) => (() => any) | /*elided*/ any;
    forceCharge(_: any): (() => any) | /*elided*/ any;
    forceLinkDistance(_: any): (() => any) | /*elided*/ any;
    forceLinkStrength(_: any): (() => any) | /*elided*/ any;
    offset(_: any): number[] | /*elided*/ any;
    getFocis: () => {};
    setClusters(value: any): /*elided*/ any;
};
