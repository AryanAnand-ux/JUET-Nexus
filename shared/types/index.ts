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
  classesHeld: number;          // 0 when Campus Portal doesn't provide raw counts
  classesAttended: number;      // 0 when Campus Portal doesn't provide raw counts
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
  date: string; // Display string from Campus Portal
  link: string;
}

export type Notice = NoticeRecord;

// Registered Courses and Marks
export interface RegisteredCourse {
  code: string;
  title: string;
  type: 'Theory' | 'Practical' | 'Project' | 'Unknown';
  credits: number;
}

export interface MarkComponent {
  name: string;
  obtained: number;
  max: number;
}

export interface DetailedCourseMarks {
  subject: string;
  code: string;
  components: MarkComponent[];
  total: number;
}

// Complete Dashboard Response
export interface DashboardResponse {
  student: StudentInfo;
  attendance: AttendanceRecord[];
  performance: PerformanceData;
  notices: NoticeRecord[];
  courses: RegisteredCourse[];        // Added
  detailedMarks: DetailedCourseMarks[]; // Added
}

/**
 * CampusLynx login flow type
 */
export type LoginFlow = 'campuslynx';

// Captcha Init Response
export interface CaptchaResponse {
  captchaImage: string; // base64 data URI
  sessionToken: string;
  captchaValue?: string | null;
  loginFlow?: LoginFlow;
}

// --- CampusLynx two-step login -------------------------------------------

/** Step 1: identify the user. Served by `POST /api/auth/verify-user`. */
export interface LoginIdentifyPayload {
  enrollment: string;
  captcha: string;
  sessionToken: string;
  /** Portal user type: `S` student (default) or `P` parent. */
  usertype?: 'S' | 'P';
}

/**
 * Step 1 result. `loginToken` is an opaque, short-lived handle the server keeps
 * mapped to the portal pre-token -- the pre-token itself is never sent to the
 * browser, so it cannot be tampered with.
 */
export interface LoginIdentifyResponse {
  success: boolean;
  loginToken: string;
  /** Login mode the portal wants next: `"PWD"` (password) or `"otp"`. */
  loginMode: string;
}

/** Step 2: exchange the handle plus password for a session. */
export interface LoginPasswordPayload {
  loginToken: string;
  password: string;
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

// Exam Schedule
export interface ExamEvent {
  exameventid: string;
  exameventdesc: string;
}

export interface ExamSemester {
  registrationid: string;
  registrationdesc: string;
}

export interface ExamScheduleItem {
  subject: string;
  datetime: string;       // e.g. "2026-11-10T09:30:00"
  datetimeupto: string;
  roomcode: string;
  seatno: string;
}

export interface ExamScheduleResponse {
  semester: string;
  event: string;
  items: ExamScheduleItem[];
  availableEvents?: ExamEvent[];
}

// Grade Card
export interface GradeSemester {
  stynumber: string;
  semesterdesc: string;
}

export interface GradeSubject {
  subjectdesc: string;
  subjectcode: string;
  grade: string;
  gradepoint: number;
  credits: number;
  status: string;
}

export interface GradeCardResponse {
  semester: string;
  sgpa: number;
  cgpa: number;
  subjects: GradeSubject[];
}

// Feedback
export type FeedbackCategory = "bug" | "feature" | "improvement" | "general";

export interface FeedbackPayload {
  category: FeedbackCategory;
  subject: string;
  message: string;
  email?: string;
  enrollment?: string;
  name?: string;
  rating?: number;
  website?: string; // honeypot field for anti-spam
  metadata?: {
    device?: string;
    url?: string;
    userAgent?: string;
    screen?: string;
  };
}

export interface FeedbackRecord {
  id: string;
  category: FeedbackCategory;
  subject?: string | null;
  message: string;
  rating?: number | null;
  name?: string | null;
  email?: string | null;
  enrollment?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface FeedbackResponse {
  success: boolean;
  message: string;
  mailed?: boolean;
  storedInDb?: boolean;
  fallbackMailto?: string;
}

