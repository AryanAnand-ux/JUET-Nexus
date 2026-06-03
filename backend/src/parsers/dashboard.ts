/**
 * HTML Parsers for WebKiosk Dashboard Data
 * Tuned to the EXACT HTML produced by JUET WebKiosk (CampusLynx).
 *
 * Data sources (fetched in dashboard.ts):
 *   main page:   PersonalFiles/ShowAlertMessageSTUD.jsp  → student name + notices
 *   attendance:  Academic/StudentAttendanceList.jsp?exam=CODE → attendance %s
 *   marks:       Exam/StudentEventMarksView.jsp?exam=CODE → exam marks
 *   cgpa:        Exam/StudCGPAReport.jsp → SGPA/CGPA per semester
 */

import * as cheerio from 'cheerio';
import type {
  StudentInfo,
  AttendanceRecord,
  PerformanceData,
  SemesterRecord,
  NoticeRecord,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe parseFloat — returns 0 on NaN */
function safeFloat(s: string | undefined): number {
  const n = parseFloat(s ?? '');
  return isNaN(n) ? 0 : n;
}

/** Safe parseInt — returns 0 on NaN */
function safeInt(s: string | undefined): number {
  const n = parseInt(s ?? '', 10);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Student Info
// ---------------------------------------------------------------------------

export function parseStudentInfo(html: string): StudentInfo {
  let name = 'Student';
  let enrollment = '';
  let branch = '';

  // 1. "Welcome , ARYAN ANAND" from main page → Title Case
  const welcomeMatch = html.match(/Welcome\s*,\s*([A-Z][A-Z\s]{2,})/i);
  if (welcomeMatch) {
    name = welcomeMatch[1].trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // 2. "<STRONG> Name:&nbsp;</STRONG></font>Aryan Anand[241B610]"
  //    Handles arbitrary HTML tags and &nbsp; entities before the name text.
  const nameEnrollMatch = html.match(/Name:(?:(?:&nbsp;|<[^>]+>)\s*)*([^[<\r\n]{3,})\[(\w{6,10})\]/i);
  if (nameEnrollMatch) {
    if (name === 'Student') {
      name = nameEnrollMatch[1].trim().replace(/\s+/g, ' ');
    }
    enrollment = nameEnrollMatch[2].trim();
  }

  // 3. "Enrollment No :  &nbsp;241B610" from CGPA page
  if (!enrollment) {
    const enrollMatch = html.match(/Enrollment\s+No\s*:\s*(?:<[^>]+>\s*|&nbsp;\s*)*(\w{6,10})/i);
    if (enrollMatch) enrollment = enrollMatch[1].trim();
  }

  // 4. Fallback: "Student Name : </B>Aryan Anand"
  if (name === 'Student') {
    const nameMatch = html.match(/Student\s+Name\s*:\s*(?:<[^>]+>\s*)*([^<\r\n]{3,})/i);
    if (nameMatch) name = nameMatch[1].trim().replace(/\s+/g, ' ');
  }

  // 5. "Branch : </B>Computer Science And Engineering (ai & Ml)"
  //    Must skip past &nbsp; entities too, not just tags
  const branchMatch = html.match(/(?<!\/)Branch\s*:\s*(?:<[^>]+>|&nbsp;)*\s*([A-Za-z][^<\r\n]{4,})/i);
  if (branchMatch) {
    branch = branchMatch[1].trim().replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // 6. Fallback: "Course/Branch: B.T.(CSAIML)"
  if (!branch) {
    const courseBranchMatch = html.match(/Course\/Branch:\s*(?:<[^>]+>)?\s*([^<\r\n]{3,})/i);
    if (courseBranchMatch) branch = courseBranchMatch[1].trim().replace(/\s+/g, ' ');
  }

  return { name, enrollment, branch };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function parseAttendance(html: string): AttendanceRecord[] {
  const $ = cheerio.load(html);
  const attendance: AttendanceRecord[] = [];
  const seen = new Set<string>();

  // WebKiosk attendance table:
  //   SNo | Subject | Lecture+Tutorial(%) | Lecture(%) | Tutorial(%) | Practical(%)
  // The values in each cell are percentages like "85.71" or links like <a>85.71</a>
  // The table has id="table-1" and class="sort-table"

  $('table.sort-table, table#table-1').each((_, table) => {
    const $table = $(table);
    const headerRow = $table.find('thead tr, tr').first();
    const headerText = headerRow.text().toLowerCase();

    // Verify this is an attendance table
    if (!headerText.includes('subject') && !headerText.includes('sno')) return;

    // Find column indices
    const headers: string[] = [];
    headerRow.find('th, td').each((_, th) => {
      headers.push($(th).text().toLowerCase().trim());
    });

    const subjectIdx = headers.findIndex(h => h.includes('subject'));
    const combinedIdx = headers.findIndex(h => h.includes('lecture+tutorial'));
    const lectureIdx = headers.findIndex(h => h === 'lecture(%)' || (h.includes('lecture') && !h.includes('tutorial') && !h.includes('+')));
    const tutorialIdx = headers.findIndex(h => h.includes('tutorial') && !h.includes('+'));
    const practicalIdx = headers.findIndex(h => h.includes('practical'));

    // If none of the percentage columns exist, this is probably the Marks table, skip it
    if (combinedIdx < 0 && lectureIdx < 0 && practicalIdx < 0) return;

    $table.find('tbody tr, tr').each((rowIdx, row) => {
      if (rowIdx === 0) return; // skip header
      const cells: string[] = [];
      let detailLink: string | undefined;

      $(row).find('td').each((colIdx, td) => {
        const $td = $(td);
        cells.push($td.text().trim());
        
        if (colIdx === combinedIdx || colIdx === lectureIdx || colIdx === practicalIdx) {
          const href = $td.find('a').attr('href');
          if (href && !detailLink) {
            detailLink = href;
          }
        }
      });

      if (cells.length < 3) return;

      const rawSubject = subjectIdx >= 0 ? cells[subjectIdx] : cells[1];
      if (!rawSubject) return;

      // Normalize subject to avoid duplicates from slight WebKiosk spacing/casing variations
      const subject = rawSubject.trim().replace(/\s+/g, ' ');
      const normKey = subject.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (normKey === 'total' || seen.has(normKey)) return;

      const combined = safeFloat(combinedIdx >= 0 ? cells[combinedIdx] : undefined);
      const lecture = safeFloat(lectureIdx >= 0 ? cells[lectureIdx] : undefined);
      const tutorial = safeFloat(tutorialIdx >= 0 ? cells[tutorialIdx] : undefined);
      const practical = safeFloat(practicalIdx >= 0 ? cells[practicalIdx] : undefined);

      // Use combined % as the main percentage, fallback to lecture, then practical (for labs)
      const percentage = combined > 0 ? combined : (lecture > 0 ? lecture : practical);

      if (percentage >= 0) {
        seen.add(normKey);
        attendance.push({
          subject,
          percentage: Math.round(percentage * 10) / 10,
          lecturePercent: Math.round(lecture * 10) / 10,
          tutorialPercent: Math.round(tutorial * 10) / 10,
          practicalPercent: Math.round(practical * 10) / 10,
          classesHeld: 0,       // WebKiosk doesn't give raw counts on this page
          classesAttended: 0,
          safeBunksLeft: 0,
          detailLink,
        });
      }
    });
  });

  // Fallback: try generic table matching if no sort-table found
  if (attendance.length === 0) {
    $('table').each((_, table) => {
      const $table = $(table);
      const headerText = $table.find('tr').first().text().toLowerCase();

      if (
        (headerText.includes('subject') || headerText.includes('course')) &&
        (headerText.includes('percent') || headerText.includes('%') || headerText.includes('attendance'))
      ) {
        const headers: string[] = [];
        $table.find('tr').first().find('th, td').each((_, th) => {
          headers.push($(th).text().toLowerCase().trim());
        });

        $table.find('tr').each((rowIdx, row) => {
          if (rowIdx === 0) return;
          const cells: string[] = [];
          $(row).find('td').each((_, td) => { cells.push($(td).text().trim()); });
          if (cells.length < 2) return;

          const rawSubject = cells[1] || cells[0];
          if (!rawSubject) return;

          const subject = rawSubject.trim().replace(/\s+/g, ' ');
          const normKey = subject.toLowerCase().replace(/[^a-z0-9]/g, '');

          if (normKey === 'total' || seen.has(normKey)) return;

          seen.add(normKey);
          attendance.push({
            subject,
            percentage: safeFloat(cells[2]),
            lecturePercent: safeFloat(cells[3]),
            tutorialPercent: safeFloat(cells[4]),
            practicalPercent: safeFloat(cells[5]),
            classesHeld: 0,
            classesAttended: 0,
            safeBunksLeft: 0,
          });
        });
      }
    });
  }

  return attendance;
}

// ---------------------------------------------------------------------------
// Performance (SGPA / CGPA per semester)
// ---------------------------------------------------------------------------

export function parsePerformance(html: string): PerformanceData {
  const $ = cheerio.load(html);
  const semesters: SemesterRecord[] = [];

  // CGPA page table:
  //   Semester | Grade Points | Course Credit | Earned Credit |
  //   Points SecuredSGPA | Points SecuredCGPA | SGPA | CGPA
  $('table.sort-table, table#table-1').each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('thead tr, tr').first().text().toLowerCase();

    if (!headerText.includes('semester') || !headerText.includes('sgpa')) return;

    $table.find('tbody tr, tr').each((rowIdx, row) => {
      if (rowIdx === 0) return;
      const cells: string[] = [];
      $(row).find('td').each((_, td) => {
        cells.push($(td).text().trim());
      });

      if (cells.length < 8) return;

      const semester = safeInt(cells[0]);
      if (semester <= 0) return;

      semesters.push({
        semester,
        sgpa: safeFloat(cells[6]),
        cgpa: safeFloat(cells[7]),
        credits: safeFloat(cells[2]),
        earnedCredits: safeFloat(cells[3]),
      });
    });
  });

  // Current SGPA/CGPA = values from the latest semester
  const latest = semesters[semesters.length - 1];
  const currentSgpa = latest?.sgpa ?? 0;
  const cgpa = latest?.cgpa ?? 0;

  // Exam marks (eventwise) — parse the marks table if present
  const recentMarks: Array<{ subject: string; marks: number }> = [];
  $('table').each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('tr').first().text().toLowerCase();
    if (
      !headerText.includes('subject') ||
      !(headerText.includes('mark') || headerText.includes('total') || headerText.includes('t1') || headerText.includes('t2'))
    ) {
      return;
    }

    $table.find('tr').each((rowIdx, row) => {
      if (rowIdx === 0) return;
      const cells: string[] = [];
      $(row).find('td').each((_, td) => { cells.push($(td).text().trim()); });
      if (cells.length < 2) return;

      const subject = cells[0] || cells[1];
      // Find the last numeric cell as "total marks"
      let marks = 0;
      for (let i = cells.length - 1; i >= 1; i--) {
        const val = safeFloat(cells[i]);
        if (val > 0) { marks = val; break; }
      }
      if (subject && marks > 0) {
        recentMarks.push({ subject, marks });
      }
    });
  });

  return {
    currentSgpa,
    cgpa,
    semesters,
    recentMarks: recentMarks.length > 0 ? recentMarks.slice(0, 10) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export function parseNotices(html: string): NoticeRecord[] {
  const $ = cheerio.load(html);
  const notices: NoticeRecord[] = [];
  const seen = new Set<string>();

  // WebKiosk notices are just <a> tags with PDF links in the main content area
  // e.g. <a target=_new href="scan0942.pdf">NOTICE – STAY IN PARENTS GUEST HOUSE</a>
  $('a[href$=".pdf"], a[target="_new"], a[target="_blank"]').each((_, a) => {
    const title = $(a).text().trim();
    const link = $(a).attr('href') || '';

    // Skip empty or very short titles, and navigation links
    if (
      !title ||
      title.length < 5 ||
      seen.has(title) ||
      link.includes('javascript:') ||
      title.toLowerCase().includes('login') ||
      title.toLowerCase().includes('signout')
    ) {
      return;
    }

    seen.add(title);
    notices.push({
      title,
      date: '', // WebKiosk doesn't show dates for notices
      link: link.startsWith('http') ? link : '',
    });
  });

  return notices;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export function parseDashboard(html: string): {
  student: StudentInfo;
  attendance: AttendanceRecord[];
  performance: PerformanceData;
  notices: NoticeRecord[];
} {
  return {
    student: parseStudentInfo(html),
    attendance: parseAttendance(html),
    performance: parsePerformance(html),
    notices: parseNotices(html),
  };
}
