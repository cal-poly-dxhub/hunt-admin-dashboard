const TEAM_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#84cc16", // lime
  "#e11d48", // rose
  "#0ea5e9", // sky
  "#a855f7", // purple
  "#10b981", // emerald
] as const;

export function getTeamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}
