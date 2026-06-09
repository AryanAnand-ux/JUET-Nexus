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
  if (target <= 0) {
    return { status: 'safe', count: Infinity };
  }
  
  const percentage = held > 0 ? (attended / held) * 100 : 0;
  
  if (percentage >= target) {
    // Math.floor gives maximum classes that could have been held
    const maxHeld = Math.floor((100 * attended) / target);
    const safeSkips = Math.max(0, maxHeld - held);
    
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
    if (target >= 100) {
      return { status: 'critical', count: Infinity };
    }
    // Math.ceil determines minimum consecutive classes required
    const mustAttend = Math.max(0, Math.ceil((target * held - 100 * attended) / (100 - target)));
    return { status: 'critical', count: mustAttend };
  }
}
