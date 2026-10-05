import {
  Bitcoin,
  Briefcase,
  ChartCandlestick,
  CodeXml,
  Flag,
  Gamepad2,
  Goal,
  GraduationCap,
  Monitor,
  Newspaper,
  Palette,
  Plane,
  Rocket,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/**
 * The icons workspaces may name (`icon` in their JSON, a Lucide name). Only these are bundled;
 * add one here to use it. An unknown name shows a monitor.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  bitcoin: Bitcoin,
  briefcase: Briefcase,
  'chart-candlestick': ChartCandlestick,
  'code-xml': CodeXml,
  flag: Flag,
  'gamepad-2': Gamepad2,
  goal: Goal,
  'graduation-cap': GraduationCap,
  monitor: Monitor,
  newspaper: Newspaper,
  palette: Palette,
  plane: Plane,
  rocket: Rocket,
  trophy: Trophy,
};

interface WorkspaceIconProps {
  name: string | undefined;
  /** In pixels, or any CSS length (e.g. container units on a poster). */
  size?: number | string;
  className?: string | undefined;
}

/** A workspace's icon: a line icon in the current text colour. */
export function WorkspaceIcon({ name, size = 16, className }: WorkspaceIconProps) {
  const Icon = (name ? ICONS[name] : undefined) ?? Monitor;
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
