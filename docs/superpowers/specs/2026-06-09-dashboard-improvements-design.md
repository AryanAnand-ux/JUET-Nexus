# Specs: Dashboard Improvements and New Features Design

This document outlines the design and specification for adding detailed, test-wise exam marks breakdown and the registered course list to the **JUET Nexus** portal.

---

## 1. Goal Description
The objective is to expand the dashboard features of JUET Nexus to match the original WebKiosk ERP, while delivering a modern, high-fidelity user experience. 
Specifically, we will implement:
1. **Registered Courses List**: A dedicated page displaying all courses in the current academic semester.
2. **Detailed Course-wise Marks (Event-wise breakdown)**: Displaying the marks obtained in individual evaluations (Test-1, Test-2, Test-3, End Semester, Internals, Practicals) instead of just a single overall score.

---

## 2. Proposed Changes

### 2.1 Shared Data Contracts
Update [index.ts](file:///d:/Projects/JUET/shared/types/index.ts) to define the new data contracts.

```typescript
// Registered Course representation
export interface RegisteredCourse {
  code: string;
  title: string;
  type: 'Theory' | 'Practical' | 'Project' | 'Unknown';
  credits: number;
}

// Mark component breakdown (e.g. Test-1, End Sem)
export interface MarkComponent {
  name: string;
  obtained: number;
  max: number;
}

// Detailed marks for a single course
export interface DetailedCourseMarks {
  subject: string;
  code: string;
  components: MarkComponent[];
  total: number;
}

// Extend DashboardResponse
export interface DashboardResponse {
  student: StudentInfo;
  attendance: AttendanceRecord[];
  performance: PerformanceData;
  notices: NoticeRecord[];
  courses: RegisteredCourse[];        // Added
  detailedMarks: DetailedCourseMarks[]; // Added
}
```

---

### 2.2 Backend Scraping & Scraping Pipelines

#### A. Registered Courses Scraper
*   **Target Page**: `/StudentFiles/Academic/StudentRegistredSubjectList.jsp`
*   **Trigger**: Fetched in parallel inside [dashboard.ts](file:///d:/Projects/JUET/backend/src/routes/dashboard.ts) during **Phase 1** along with profile, CGPA, and initial attendance.
*   **Parsing Logic**:
    *   Find the table containing the class `sort-table` or rows with subject registration headers.
    *   Iterate over the rows (`tr`), extracting `Subject Code`, `Subject Name`, `Subject Type` (Theory/Practical), and `Credits`.
    *   Map them into `RegisteredCourse[]`.

#### B. Detailed Event-wise Marks Scraper
*   **Target Page**: `/StudentFiles/Exam/StudentEventMarksView.jsp` (fetched in parallel, then refetched in Phase 2 with target `examCode`).
*   **Parsing Logic**:
    *   Identify headers in the marks table containing components like `T-1`, `T-2`, `T-3`, `End Semester`, `Practical`, `Total`, etc.
    *   Identify the maximum marks for each component by parsing parenthesis in headers, e.g., `Test-1 (15)` -> Max: 15.
    *   For each course row, extract the obtained marks corresponding to each column header.
    *   Map them into a `DetailedCourseMarks` item.

---

### 2.3 Frontend Layout & Premium Design

#### A. Collapsible Sidebar Navigation
*   Add a new item to `navItems` in [DashboardLayout.tsx](file:///d:/Projects/JUET/frontend/components/DashboardLayout.tsx):
    *   **Label**: `Registered Courses`
    *   **Icon**: BookOpen / Layers icon.
    *   **Route**: `/dashboard/courses`

#### B. Registered Courses Page (`/dashboard/courses`)
*   **Path**: `frontend/app/dashboard/courses/page.tsx`
*   **Visual Style**:
    *   Dark slate theme with translucent frosted-glass panels (`bg-slate-900/60 backdrop-blur-md`).
    *   Curated typography (Google Font Outfit/Nunito Sans).
    *   Course cards rendering: Code, Title, Credits (represented as styled badges), and Course Type.
    *   Smooth entry micro-animations (`animate-fade-in-up`).

#### C. Interactive Grade breakdown on Performance Page
*   **File**: `frontend/components/PerformanceHub.tsx`
*   **Visual Style**:
    *   Under the "Recent Marks & Evaluations" section, display each course as an interactive premium card.
    *   Include a tooltip or visual cue: `Click to view event-wise marks`.
    *   Clicking a course opens a **Modal Dialog** containing:
        *   Detailed list of marks components.
        *   Horizontal progress bars with glowing burgundy/indigo/green gradient fills mapping the percentage of marks obtained.
        *   A total summary badge displaying the overall grade or status.

---

## 3. Verification Plan

### 3.1 Automated Testing
*   Add unit tests in [parsers.test.ts](file:///d:/Projects/JUET/backend/tests/parsers.test.ts) to verify:
    *   `parseRegisteredCourses` correctly parses subjects, type, and credits from mock JSPs.
    *   `parseDetailedMarks` correctly handles component-wise column headers and parentheses parsing.
*   Verify all tests pass: `npm test` in `/backend`.

### 3.2 Manual Verification
*   Log in to JUET Nexus using local mockup auth cookies.
*   Verify the **Sync WebKiosk** successfully populates both the new Courses page and the detailed Marks breakdown.
*   Verify the Modal popup is accessible, beautiful, responsive, and closes correctly.
