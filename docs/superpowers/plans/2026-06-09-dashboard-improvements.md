# Dashboard Improvements & New Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add detailed, test-wise exam marks breakdown and the registered course list to JUET Nexus, utilizing premium glassmorphism dark-slate styles.

**Architecture:** Extend the existing WebKiosk parallel fetching pipeline in the backend to scrape registered courses and detailed component marks. Parse the tables using Cheerio, cache them together under the main dashboard response, and render them on the frontend with Outfit typography, glowing badges, and interactive modals.

**Tech Stack:** Next.js 15, Fastify, TypeScript, Cheerio, Axios, Tailwind CSS.

---

## User Review Required

> [!NOTE]
> All new data is bundled in the primary `/api/dashboard` payload and cached for 15 minutes, preserving the single-sync model to minimize WebKiosk rate limits.

---

## Open Questions
* None. (UI mocks and organization aligned and approved).

---

## Proposed Changes

### Shared Types (`/shared/types`)
Define Registered Courses and Detailed Marks models.

#### [MODIFY] [index.ts](file:///d:/Projects/JUET/shared/types/index.ts)
Extend shared definitions and `DashboardResponse`.

---

### Backend (`/backend`)
Scrape `/StudentFiles/Academic/StudentRegistredSubjectList.jsp` and parse detailed marks from `/StudentFiles/Exam/StudentEventMarksView.jsp`.

#### [MODIFY] [dashboard.ts](file:///d:/Projects/JUET/backend/src/parsers/dashboard.ts)
* Add `parseRegisteredCourses` parser.
* Enhance `parsePerformance` to parse component marks and match headings.

#### [MODIFY] [dashboard.ts](file:///d:/Projects/JUET/backend/src/routes/dashboard.ts)
* Add `PAGES.courses` endpoint configuration.
* Fetch `courses` in parallel in Phase 1.
* Pass data to parser and update cache integration.

#### [MODIFY] [parsers.test.ts](file:///d:/Projects/JUET/backend/tests/parsers.test.ts)
* Add unit tests for `parseRegisteredCourses` and detailed marks extraction.

---

### Frontend (`/frontend`)
Display registered courses and grades modal.

#### [MODIFY] [DashboardLayout.tsx](file:///d:/Projects/JUET/frontend/components/DashboardLayout.tsx)
* Add "Registered Courses" link to navigation items.

#### [NEW] [page.tsx](file:///d:/Projects/JUET/frontend/app/dashboard/courses/page.tsx)
* Create the premium Registered Courses view.

#### [MODIFY] [PerformanceHub.tsx](file:///d:/Projects/JUET/frontend/components/PerformanceHub.tsx)
* Make course cards clickable.
* Add modal to render component-wise progress grids.

---

## Tasks

### Task 1: Update Shared Type Definitions

**Files:**
* Modify: [index.ts](file:///d:/Projects/JUET/shared/types/index.ts)

- [ ] **Step 1: Modify types in `shared/types/index.ts`**
  Add `RegisteredCourse`, `MarkComponent`, `DetailedCourseMarks` and update `DashboardResponse`.
  ```typescript
  // Add at bottom of file:///d:/Projects/JUET/shared/types/index.ts
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
  ```
  And update `DashboardResponse` at line 75:
  ```typescript
  export interface DashboardResponse {
    student: StudentInfo;
    attendance: AttendanceRecord[];
    performance: PerformanceData;
    notices: NoticeRecord[];
    courses: RegisteredCourse[];        // Added
    detailedMarks: DetailedCourseMarks[]; // Added
  }
  ```

- [ ] **Step 2: Commit type changes**
  ```bash
  git add shared/types/index.ts
  git commit -m "feat(shared): add types for registered courses and detailed marks"
  ```

---

### Task 2: Implement Scrapers & Parsers in Backend

**Files:**
* Modify: [dashboard.ts](file:///d:/Projects/JUET/backend/src/parsers/dashboard.ts)

- [ ] **Step 1: Add Registered Course Parser**
  Write the parsing function `parseRegisteredCourses` in [dashboard.ts](file:///d:/Projects/JUET/backend/src/parsers/dashboard.ts):
  ```typescript
  export function parseRegisteredCourses(html: string): RegisteredCourse[] {
    const $ = cheerio.load(html);
    const courses: RegisteredCourse[] = [];
    const seen = new Set<string>();

    $('table.sort-table, table#table-1, table').each((_, table) => {
      const $table = $(table);
      const firstRowText = $table.find('tr').first().text().toLowerCase();
      if (!firstRowText.includes('subject code') && !firstRowText.includes('course code')) return;

      $table.find('tr').each((rowIdx, row) => {
        if (rowIdx === 0) return;
        const cells: string[] = [];
        $(row).find('td').each((_, td) => { cells.push($(td).text().trim()); });
        if (cells.length < 4) return;

        const code = cells[1];
        const title = cells[2];
        const rawType = cells[3];
        const credits = safeInt(cells[4]);

        if (!code || seen.has(code)) return;
        seen.add(code);

        let type: 'Theory' | 'Practical' | 'Project' | 'Unknown' = 'Unknown';
        if (rawType.toLowerCase().includes('theory') || rawType.toLowerCase().includes('lecture')) {
          type = 'Theory';
        } else if (rawType.toLowerCase().includes('practical') || rawType.toLowerCase().includes('lab')) {
          type = 'Practical';
        } else if (rawType.toLowerCase().includes('project')) {
          type = 'Project';
        }

        courses.push({ code, title, type, credits });
      });
    });
    return courses;
  }
  ```

- [ ] **Step 2: Enhance `parsePerformance` for Detailed Marks**
  Update `parsePerformance` to parse the event breakdown:
  ```typescript
  export function parseDetailedMarks(html: string): DetailedCourseMarks[] {
    const $ = cheerio.load(html);
    const detailedMarks: DetailedCourseMarks[] = [];
    const seen = new Set<string>();

    $('table').each((_, table) => {
      const $table = $(table);
      const headerRow = $table.find('tr').first();
      const headers: Array<{ name: string; max: number }> = [];

      headerRow.find('th, td').each((_, th) => {
        const text = $(th).text().trim();
        const maxMatch = text.match(/\((\d+(?:\.\d+)?)\)/);
        const max = maxMatch ? parseFloat(maxMatch[1]) : 100; // fallback to 100 if no max
        headers.push({ name: text.replace(/\s*\([^)]*\)/, ''), max });
      });

      // Verify this is a marks table
      const headerText = headerRow.text().toLowerCase();
      if (!headerText.includes('subject') || !headerText.includes('total')) return;

      const subjectIdx = headers.findIndex(h => h.name.toLowerCase().includes('subject'));
      
      $table.find('tr').each((rowIdx, row) => {
        if (rowIdx === 0) return;
        const cells: string[] = [];
        $(row).find('td').each((_, td) => { cells.push($(td).text().trim()); });
        if (cells.length < 2) return;

        const rawSubjectName = cells[subjectIdx] || '';
        if (!rawSubjectName || rawSubjectName.toLowerCase().includes('total')) return;

        // Separate Subject Name and Course Code (e.g. "Data Structures [18B11CI311]")
        const codeMatch = rawSubjectName.match(/\[(.*?)\]/);
        const code = codeMatch ? codeMatch[1].trim() : '';
        const subject = rawSubjectName.replace(/\[.*?\]/, '').trim();

        if (seen.has(subject)) return;
        seen.add(subject);

        const components: MarkComponent[] = [];
        let total = 0;

        cells.forEach((val, colIdx) => {
          if (colIdx === subjectIdx) return;
          const header = headers[colIdx];
          if (!header) return;

          const name = header.name;
          const obtained = safeFloat(val);
          const max = header.max;

          if (name.toLowerCase().includes('total')) {
            total = obtained;
          } else if (obtained > 0 || name.toLowerCase().includes('t1') || name.toLowerCase().includes('t2') || name.toLowerCase().includes('end')) {
            components.push({ name, obtained, max });
          }
        });

        detailedMarks.push({ subject, code, components, total });
      });
    });

    return detailedMarks;
  }
  ```
  Ensure these functions are exported and integrate them in `parseDashboard`.

- [ ] **Step 3: Commit backend parser updates**
  ```bash
  git add backend/src/parsers/dashboard.ts
  git commit -m "feat(backend): implement registered courses and detailed marks parsing"
  ```

---

### Task 3: Update Dashboard Route to Fetch New Pages

**Files:**
* Modify: [dashboard.ts](file:///d:/Projects/JUET/backend/src/routes/dashboard.ts)

- [ ] **Step 1: Integrate new pages in `backend/src/routes/dashboard.ts`**
  Extend `PAGES` object:
  ```typescript
  const PAGES = {
    main:       '/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp',
    attendance: '/StudentFiles/Academic/StudentAttendanceList.jsp',
    marks:      '/StudentFiles/Exam/StudentEventMarksView.jsp',
    cgpa:       '/StudentFiles/Exam/StudCGPAReport.jsp',
    courses:    '/StudentFiles/Academic/StudentRegistredSubjectList.jsp', // Added
  };
  ```
  And fetch it during Phase 1:
  ```typescript
        const phase1 = await Promise.allSettled([
          fetchWebKioskPage(PAGES.main, jsessionid),
          fetchWebKioskPage(PAGES.attendance, jsessionid),
          fetchWebKioskPage(PAGES.marks, jsessionid),
          fetchWebKioskPage(PAGES.cgpa, jsessionid),
          fetchWebKioskPage(PAGES.courses, jsessionid), // Added
        ]);
  ```
  Extract results and update combined HTML:
  ```typescript
        const coursesHtml = phase1[4].status === 'fulfilled' ? phase1[4].value : '';
        const combinedHtml = [
          '<!-- PAGE: main -->', mainHtml,
          '<!-- PAGE: attendance -->', attendanceHtml,
          '<!-- PAGE: marks -->', marksHtml,
          '<!-- PAGE: cgpa -->', cgpaHtml,
          '<!-- PAGE: courses -->', coursesHtml, // Added
        ].join('\n');
  ```
  Update `parseDashboard` invocation to return these sections and verify tests pass.

- [ ] **Step 2: Commit route updates**
  ```bash
  git add backend/src/routes/dashboard.ts
  git commit -m "feat(backend): fetch registered courses page in parallel"
  ```

---

### Task 4: Add Backend Tests and Verify

**Files:**
* Modify: [parsers.test.ts](file:///d:/Projects/JUET/backend/tests/parsers.test.ts)

- [ ] **Step 1: Add tests in `backend/tests/parsers.test.ts`**
  Write test fixtures for courses page and detailed marks breakdown table. Verify that the functions output correctly.
- [ ] **Step 2: Run backend tests**
  Command: `npm test` inside `backend`.
  Expected: All 61+ tests PASS.
- [ ] **Step 3: Commit tests**
  ```bash
  git add backend/tests/parsers.test.ts
  git commit -m "test(backend): add unit tests for courses and detailed marks parsing"
  ```

---

### Task 5: Add Sidebar Navigation Link

**Files:**
* Modify: [DashboardLayout.tsx](file:///d:/Projects/JUET/frontend/components/DashboardLayout.tsx)

- [ ] **Step 1: Add link to Sidebar `navItems`**
  Modify `navItems` array inside [DashboardLayout.tsx](file:///d:/Projects/JUET/frontend/components/DashboardLayout.tsx):
  ```typescript
    {
      href: "/dashboard/courses",
      label: "Registered Courses",
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
  ```
  Ensure pathname checks and header titles render `Registered Courses` correctly.

- [ ] **Step 2: Commit Sidebar changes**
  ```bash
  git add frontend/components/DashboardLayout.tsx
  git commit -m "feat(frontend): add registered courses navigation to sidebar"
  ```

---

### Task 6: Implement Registered Courses Page

**Files:**
* Create: [page.tsx](file:///d:/Projects/JUET/frontend/app/dashboard/courses/page.tsx)

- [ ] **Step 1: Create Courses Page**
  Write [page.tsx](file:///d:/Projects/JUET/frontend/app/dashboard/courses/page.tsx) using the premium dark-slate design with glowing backdrop effects.
  Integrate the `useDashboard` hook, display loading skeletons, and render course cards dynamically.
- [ ] **Step 2: Commit Courses Page**
  ```bash
  git add frontend/app/dashboard/courses/page.tsx
  git commit -m "feat(frontend): implement premium registered courses page"
  ```

---

### Task 7: Implement Detailed Marks Modal in Performance Hub

**Files:**
* Modify: [PerformanceHub.tsx](file:///d:/Projects/JUET/frontend/components/PerformanceHub.tsx)
* Modify: [page.tsx](file:///d:/Projects/JUET/frontend/app/dashboard/performance/page.tsx)

- [ ] **Step 1: Update `PerformanceHub.tsx`**
  * Map `detailedMarks` and course cards.
  * When a card is clicked, set the active subject and open a React-controlled modal window.
  * Render component breakdowns (T1, T2, etc.) using Outfit font rendering, gradient progress bars, and glowing borders.
- [ ] **Step 2: Compile and Build check**
  Command: `npm run build --workspace frontend` inside root.
  Expected: Successful compilation without TypeScript errors.
- [ ] **Step 3: Commit frontend grades changes**
  ```bash
  git add frontend/components/PerformanceHub.tsx frontend/app/dashboard/performance/page.tsx
  git commit -m "feat(frontend): integrate interactive grades component modal"
  ```

---

## Verification Plan

### Automated Tests
* Run `npm test` inside `/backend` to execute all server parsers and router tests.
* Ensure frontend production build compiles cleanly: `npm run build` from workspace root.

### Manual Verification
* Access `/dashboard` page and click "Sync WebKiosk" to verify new data is fetched and cached.
* Navigate to **Registered Courses** sidebar tab and check the card list layout matches our premium theme.
* Navigate to **Academic Performance**, click a course under "Recent Marks", and verify the modal loads with the gradient progress bars.
