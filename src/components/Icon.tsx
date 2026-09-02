import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Line/solid icon set transcribed from the inline SVGs in the design
 * prototype. Stroke icons use `fill="none"`; a handful (sparkle, gemini,
 * apple, auto-bolt) are solid fills matching the source.
 */
export type IconName =
  | 'today'
  | 'nutrition'
  | 'coach'
  | 'trends'
  | 'back'
  | 'chevronRight'
  | 'plus'
  | 'edit'
  | 'close'
  | 'check'
  | 'camera'
  | 'send'
  | 'sparkle'
  | 'bolt'
  | 'settings'
  | 'strength'
  | 'steps'
  | 'core'
  | 'zone2'
  | 'calories'
  | 'run'
  | 'bike'
  | 'claude'
  | 'openai'
  | 'gemini'
  | 'ondevice'
  | 'googleHealth'
  | 'appleHealth'
  | 'heart'
  | 'moon'
  | 'pulse'
  | 'heartLine'
  | 'boltLine'
  | 'bars'
  | 'droplet'
  | 'flame';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Solid-fill icons render with `fill`; everything else is a stroked outline.
const SOLID: ReadonlySet<IconName> = new Set([
  'sparkle',
  'bolt',
  'gemini',
  'appleHealth',
  'claude',
  'heart',
]);

export function Icon({
  name,
  size = 24,
  color = '#000',
  strokeWidth = 1.8,
}: IconProps) {
  const solid = SOLID.has(name);
  const stroke = solid ? undefined : color;
  const fill = solid ? color : 'none';
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      {renderIcon(name, common, color)}
    </Svg>
  );
}

function renderIcon(
  name: IconName,
  s: {
    stroke?: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: 'none';
  },
  color: string,
) {
  switch (name) {
    case 'today':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 12l0-5M12 12l3.5 2" {...s} />
        </>
      );
    case 'heart':
      return (
        <Path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={color}
        />
      );
    case 'nutrition':
    case 'zone2':
      return (
        <>
          <Path
            d="M12 21c-3.5 0-6-3-6-7 0-3.5 2-6 4-6 1 0 1.5.5 2 .5s1-.5 2-.5c2 0 4 2.5 4 6 0 4-2.5 7-6 7z"
            {...s}
          />
          <Path d="M12 8c0-2 1-3.5 3-4" {...s} />
        </>
      );
    case 'coach':
      return (
        <>
          <Path
            d="M12 3l1.6 3.4L17 8l-3.4 1.6L12 13l-1.6-3.4L7 8l3.4-1.6z"
            {...s}
          />
          <Path
            d="M18 14l.8 1.7L20.5 16l-1.7.8L18 18.5 17.2 16.8 15.5 16l1.7-.3z"
            {...s}
          />
        </>
      );
    case 'trends':
      return (
        <>
          <Path d="M4 16l5-5 3 3 6-7" {...s} />
          <Path d="M18 7h1.5v1.5" {...s} />
        </>
      );
    case 'back':
      return <Path d="M15 5l-7 7 7 7" {...s} />;
    case 'chevronRight':
      return <Path d="M9 5l7 7-7 7" {...s} />;
    case 'plus':
      return <Path d="M12 6v12M6 12h12" {...s} />;
    case 'edit':
      return <Path d="M14 5l5 5M4 20l1-4L16 5l3 3L8 19l-4 1z" {...s} />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" {...s} />;
    case 'check':
      return <Path d="M5 13l4 4L19 7" {...s} />;
    case 'camera':
      return (
        <>
          <Path d="M4 8h3l1.5-2h7L17 8h3v11H4z" {...s} />
          <Circle cx={12} cy={13} r={3.2} {...s} />
        </>
      );
    case 'send':
      return <Path d="M4 12l16-8-6 8 6 8z" {...s} />;
    case 'sparkle':
      return (
        <Path
          d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9z"
          fill={color}
        />
      );
    case 'bolt':
      return <Path d="M13 2L4 14h6l-1 8 9-12h-6z" fill={color} />;
    case 'settings':
      return (
        <>
          <Circle cx={12} cy={12} r={3} {...s} />
          <Path
            d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"
            {...s}
          />
        </>
      );
    case 'strength':
      return <Path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" {...s} />;
    case 'steps':
      return (
        <>
          <Circle cx={13} cy={4.6} r={1.7} {...s} />
          <Path
            d="M13 8l-2.5 4 2.2 1.8 1 4.2M10.5 12L7 14M13 8l3 1 1.6 3.6"
            {...s}
          />
        </>
      );
    case 'core':
      return (
        <>
          <Circle cx={12} cy={12} r={8} {...s} />
          <Circle cx={12} cy={12} r={3} {...s} />
        </>
      );
    case 'calories':
      return (
        <Path
          d="M12 3c1.2 3 4.2 4.2 4.2 8.2A4.2 4.2 0 018 11.4c0-1.5.6-2.6 1.2-3.2.3 1.1 1.1 1.6 1.6 1.6C11.4 8.4 10.2 6.2 12 3z"
          {...s}
        />
      );
    case 'run':
      return (
        <>
          <Path d="M13 4a2 2 0 100-.01M7 21l3-6 4 2 1-5" {...s} />
          <Path d="M6 12l3-3 4 1 3-3" {...s} />
        </>
      );
    case 'bike':
      return (
        <>
          <Circle cx={6} cy={17} r={3} {...s} />
          <Circle cx={18} cy={17} r={3} {...s} />
          <Path d="M6 17l4-8h5l2 8" {...s} />
        </>
      );
    case 'claude':
      return (
        <Path
          d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9z"
          fill={color}
        />
      );
    case 'openai':
      return (
        <>
          <Circle cx={12} cy={12} r={8} {...s} />
          <Path d="M12 8v8M8 12h8" {...s} />
        </>
      );
    case 'gemini':
      return (
        <Path
          d="M12 3c1 5 3 7 8 9-5 2-7 4-8 9-1-5-3-7-8-9 5-2 7-4 8-9z"
          fill={color}
        />
      );
    case 'ondevice':
      return (
        <>
          <Rect x={6} y={6} width={12} height={12} rx={2} {...s} />
          <Path
            d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"
            {...s}
          />
        </>
      );
    case 'moon':
      return <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" {...s} />;
    case 'pulse':
      return <Path d="M22 12h-4l-3 8-4-16-3 8H2" {...s} />;
    case 'heartLine':
      return (
        <Path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 0 0 0-7.8z"
          {...s}
        />
      );
    case 'boltLine':
      return <Path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" {...s} />;
    case 'bars':
      return <Path d="M4 20h16M7 20V10M12 20V4M17 20v-7" {...s} />;
    case 'droplet':
      return <Path d="M12 2.7 6.3 9a7 7 0 1 0 11.4 0z" {...s} />;
    case 'flame':
      return (
        <Path
          d="M12 22c4.4 0 7-2.8 7-6.5 0-4.5-3.5-6.2-3.5-9.5C15.5 3.5 13.5 2 12 2c.8 3.2-1.5 4.6-2.9 6.4A8.6 8.6 0 0 0 5 15.5C5 19.2 7.6 22 12 22z"
          {...s}
        />
      );
    case 'googleHealth':
      return <Path d="M3 12h4l2 5 4-12 2 7h6" {...s} />;
    case 'appleHealth':
      return (
        <Path
          d="M12 20s-7-4.7-7-9.3A3.7 3.7 0 0112 8a3.7 3.7 0 017 2.7C19 15.3 12 20 12 20z"
          fill={color}
        />
      );
    default:
      return null;
  }
}
