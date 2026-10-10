/**
 * Utility functions for form formatting and validation
 */

/**
 * Auto-capitalize enrollment (typically uppercase)
 */
export function formatEnrollment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Validate enrollment format
 * Typical format: 24BCS100 (2 year digits + 3 letters + 3 digits)
 */
export function isValidEnrollment(enrollment: string): boolean {
  // Allow flexible format but require at least 6 chars
  return enrollment.length >= 6 && /^[A-Z0-9]+$/.test(enrollment);
}
