import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Polyline,
  Stop,
} from 'react-native-svg';

/** Map a data series into [x,y] pixel coordinates inside a padded box. */
function project(
  pts: number[],
  w: number,
  h: number,
  pad: number,
): [number, number][] {
  let min = Math.min(...pts);
  let max = Math.max(...pts);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const n = pts.length;
  return pts.map((p, i) => {
    const x = pad + (i * (w - 2 * pad)) / (n - 1);
    const y = h - pad - ((p - min) / (max - min)) * (h - 2 * pad);
    return [x, y];
  });
}

interface LineChartProps {
  points: number[];
  color: string;
  width?: number;
  height?: number;
  /** Unique id for the area gradient (must differ per chart on screen). */
  gradientId: string;
}

/**
 * Area+line trend chart matching the `.chart` SVG in the design. Scales to the
 * data range and fills the area below the line with a fading gradient.
 */
export function LineChart({
  points,
  color,
  width = 320,
  height = 150,
  gradientId,
}: LineChartProps) {
  const pad = 14;
  const xy = project(points, width, height, pad);
  const n = xy.length;
  const line =
    'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
  const area =
    line +
    ` L${xy[n - 1][0].toFixed(1)},${height - pad} L${xy[0][0].toFixed(1)},${height - pad} Z`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gradientId})`} />
      <Path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface SparklineProps {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}

/** Compact inline trend line (`.minitrend svg` in the design). */
export function Sparkline({
  points,
  color,
  width = 76,
  height = 34,
}: SparklineProps) {
  const xy = project(points, width, height, 4);
  const poly = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={poly}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
