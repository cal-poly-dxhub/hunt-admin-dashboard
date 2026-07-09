// Golden angle (~137.5°) ensures maximum hue separation between consecutive colors
const GOLDEN_ANGLE = 137.508;

export function getTeamColor(index: number): string {
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `hsl(${hue}, 75%, 45%)`;
}
