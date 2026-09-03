import { FC } from 'react';
import { ColorRepresentation } from 'three';
import { SvgProps } from './Svg';
export interface SphereWithSvgProps extends SvgProps {
    /**
     * The image to display on the icon.
     */
    image: string;
    /**
     * The color of the svg fill.
     */
    svgFill?: ColorRepresentation;
}
export declare const SphereWithSvg: FC<SphereWithSvgProps>;
