/**
 * Utility functions for form formatting and validation
 */

/**
 * Auto-format DOB input to DD-MM-YYYY format
 * Removes non-digits and inserts hyphens
 */
export function formatDOB(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");

  // Format as DD-MM-YYYY
  if (digits.length <= 2) {
    return digits;
  } else if (digits.length <= 4) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  } else {
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 8)}`;
  }
}

/**
 * Validate DOB format
 */
export function isValidDOB(dob: string): boolean {
  const pattern = /^\d{2}-\d{2}-\d{4}$/;
  if (!pattern.test(dob)) return false;

  const [day, month, year] = dob.split("-").map(Number);

  // Validate ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;

  // Additional date validation
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (isLeapYear) daysInMonth[1] = 29;

  return day <= daysInMonth[month - 1];
}

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

/**
 * Validate password (basic)
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 1; // At least 1 character
}

/**
 * Format date to ISO string for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
