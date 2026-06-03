/**
 * Shared TypeScript Types and Interfaces
 * Used across frontend and backend
 */

// Student Data
export interface StudentInfo {
  name: string;
  enrollment: string;
  branch: string;
}

export type Student = StudentInfo;

// Attendance Data
export interface AttendanceRecord {
  subject: string;
  percentage: number;           // Lecture+Tutorial combined %
  lecturePercent: number;       // Lecture only %
  tutorialPercent: number;      // Tutorial only %
  practicalPercent: number;     // Practical %
  classesHeld: number;          // 0 when WebKiosk doesn't provide raw counts
  classesAttended: number;      // 0 when WebKiosk doesn't provide raw counts
  safeBunksLeft: number;        // 0 when raw counts unavailable
  detailLink?: string;          // Link to detailed day-by-day attendance log
}

export type AttendanceItem = AttendanceRecord;

export interface AttendanceDetailItem {
  date: string;
  status: "Present" | "Absent";
  type: string;                 // e.g., "Lecture", "Tutorial", "Practical"
}

export interface AttendanceDetailsResponse {
  subject: string;
  classesHeld: number;
  classesAttended: number;
  percentage: number;
  logs: AttendanceDetailItem[];
}

// Performance Data
export interface SemesterRecord {
  semester: number;
  sgpa: number;
  cgpa: number;
  credits: number;
  earnedCredits: number;
}

export interface PerformanceData {
  currentSgpa: number;
  cgpa: number;
  semesters: SemesterRecord[];
  recentMarks?: Array<{
    subject: string;
    marks: number;
  }>;
}

export type Performance = PerformanceData;

// Notice Data
export interface NoticeRecord {
  title: string;
  date: string; // Display string from WebKiosk
  link: string;
}

export type Notice = NoticeRecord;

// Complete Dashboard Response
export interface DashboardResponse {
  student: StudentInfo;
  attendance: AttendanceRecord[];
  performance: PerformanceData;
  notices: NoticeRecord[];
}

// Auth Request Payload
export interface AuthPayload {
  enrollment: string;
  dob: string; // Format: DD-MM-YYYY
  password: string;
  captcha: string;
  role: 'Student' | 'Employee' | 'Guest';
  sessionToken: string;
}

// Captcha Init Response
export interface CaptchaResponse {
  captchaImage: string; // base64 data URI
  sessionToken: string;
}

// API Error Response
export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

// Auth State — base shape; hooks may extend this
export interface AuthStateBase {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  enrollment?: string;
}

/** @deprecated Use AuthStateBase */
export type AuthState = AuthStateBase;

// Dashboard State — base shape; hooks may extend this
export interface DashboardStateBase {
  data: DashboardResponse | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated?: Date;
}

/** @deprecated Use DashboardStateBase */
export type DashboardState = DashboardStateBase;
