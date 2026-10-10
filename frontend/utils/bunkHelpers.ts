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
    
    // This branch already guarantees percentage >= target. Classify relative to
    // the requested target: a 10-point cushion above it is "safe", otherwise
    // "caution". (Previously hardcoded to 85/75, which mislabelled custom targets
    // -- e.g. target 60% at 70% was reported as "critical".)
    const status: 'safe' | 'caution' = percentage >= target + 10 ? 'safe' : 'caution';
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
