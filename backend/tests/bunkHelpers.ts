export function computeScenarioPercentage(
  actualAttended: number,
  actualHeld: number,
  simulatedBunks: number,
  simulatedAttends: number
): number {
  const total = actualHeld + simulatedBunks + simulatedAttends;
  if (total <= 0) return 0;
  return ((actualAttended + simulatedAttends) / total) * 100;
}

export interface BunkStatus {
  status: 'safe' | 'caution' | 'critical';
  count: number;
}

export function calculateBunkStatus(
  attended: number,
  held: number,
  target: number = 75
): BunkStatus {
  const percentage = held > 0 ? (attended / held) * 100 : 0;
  
  if (percentage >= target) {
    let safeSkips = 0;
    while (((attended) / (held + safeSkips + 1)) * 100 >= target) {
      safeSkips++;
    }
    let status: 'safe' | 'caution' | 'critical' = 'safe';
    if (percentage >= 85) {
      status = 'safe';
    } else if (percentage >= 75) {
      status = 'caution';
    } else {
      status = 'critical';
    }
    return { status, count: safeSkips };
  } else {
    let mustAttend = 0;
    while (((attended + mustAttend) / (held + mustAttend)) * 100 < target) {
      mustAttend++;
    }
    return { status: 'critical', count: mustAttend };
  }
}
