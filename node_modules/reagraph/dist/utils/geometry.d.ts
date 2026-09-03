import { Color, Curve, Vector3, BufferGeometry } from 'three';
/**
 * Create a null geometry with consistent attributes
 * @returns A BufferGeometry with a null appearance
 */
export declare const createNullGeometry: () => BufferGeometry;
/**
 * Add a color attribute to a geometry
 * @param geometry - The geometry to add the color attribute to
 * @param color - The color to add to the geometry
 */
export declare const addColorAttribute: (geometry: BufferGeometry, color: Color) => void;
/**
 * Create actual dashed geometry with gaps by making multiple small tube segments
 * @param curve - The curve to create a dashed geometry from
 * @param radius - The radius of the tube
 * @param color - The color of the tube
 * @param dashArray - The dash array [dashSize, gapSize]
 * @returns A BufferGeometry with a dashed appearance
 */
export declare const createDashedGeometry: (curve: Curve<Vector3>, radius: number, color: Color, dashArray?: [number, number]) => BufferGeometry;
