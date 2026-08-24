import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import type { ClipartShape } from '@/constants/clipart-library';

type ClipartIconProps = {
  shapes: ClipartShape[];
  size: number;
  color?: string;
};

/** Thermal-print-friendly black-and-white sticker glyph. */
export function ClipartIcon({ shapes, size, color = '#111111' }: ClipartIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((shape, index) => {
        const stroke = 'f' in shape && shape.f === 0;
        const fill = stroke ? 'none' : color;
        const strokeProps = stroke
          ? {
              stroke: color,
              strokeWidth: shape.sw ?? 1.6,
              strokeLinecap: 'round' as const,
              strokeLinejoin: 'round' as const,
            }
          : {};
        switch (shape.t) {
          case 'c':
            return (
              <Circle
                key={index}
                cx={shape.x}
                cy={shape.y}
                r={shape.r}
                fill={fill}
                {...strokeProps}
              />
            );
          case 'e':
            return (
              <Ellipse
                key={index}
                cx={shape.x}
                cy={shape.y}
                rx={shape.rx}
                ry={shape.ry}
                fill={fill}
                {...strokeProps}
              />
            );
          case 'r':
            return (
              <Rect
                key={index}
                x={shape.x}
                y={shape.y}
                width={shape.w}
                height={shape.h}
                rx={shape.rx ?? 0}
                fill={fill}
                {...strokeProps}
              />
            );
          case 'p':
            return <Path key={index} d={shape.d} fill={fill} {...strokeProps} />;
          case 'l':
            return (
              <Line
                key={index}
                x1={shape.a}
                y1={shape.b}
                x2={shape.c}
                y2={shape.d}
                stroke={color}
                strokeWidth={shape.sw ?? 1.6}
                strokeLinecap="round"
              />
            );
          case 'pg':
            return <Polygon key={index} points={shape.pts} fill={fill} {...strokeProps} />;
          case 'pl':
            return (
              <Polyline
                key={index}
                points={shape.pts}
                fill="none"
                stroke={color}
                strokeWidth={shape.sw ?? 1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          default:
            return null;
        }
      })}
    </Svg>
  );
}
