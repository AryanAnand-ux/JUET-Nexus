/**
 * Unit Tests for Dashboard Parsers
 * Cheerio-based HTML parsing for WebKiosk data extraction
 */

import {
  parseStudentInfo,
  parseAttendance,
  parsePerformance,
  parseNotices,
  parseRegisteredCourses,
  parseDetailedMarks,
  parseDashboard,
} from '../src/parsers/dashboard';

// Mock HTML fixtures
const mockDashboardHTML = `
  <html>
    <body>
      <div class="profile-section">
        Welcome , ARYAN ANAND
        <STRONG> Name:&nbsp;</STRONG></font>Aryan Anand[24BCS100]
        <STRONG> Branch:&nbsp;</STRONG></font>Computer Science & Engineering
      </div>
      
      <table id="table-1" class="sort-table">
        <thead>
          <tr>
            <th>SNo</th>
            <th>Subject</th>
            <th>Lecture+Tutorial(%)</th>
            <th>Lecture(%)</th>
            <th>Tutorial(%)</th>
            <th>Practical(%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Data Structures</td>
            <td><a href="link1">82.5</a></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>2</td>
            <td>Discrete Mathematics</td>
            <td><a href="link2">85.7</a></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>3</td>
            <td>Web Development</td>
            <td><a href="link3">73.3</a></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      
      <table id="table-2" class="sort-table">
        <thead>
          <tr>
            <th>Semester</th>
            <th>Grade Points</th>
            <th>Course Credit</th>
            <th>Earned Credit</th>
            <th>Points SecuredSGPA</th>
            <th>Points SecuredCGPA</th>
            <th>SGPA</th>
            <th>CGPA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>x</td>
            <td>x</td>
            <td>x</td>
            <td>x</td>
            <td>x</td>
            <td>8.4</td>
            <td>8.2</td>
          </tr>
        </tbody>
      </table>
      
      <div class="notices-section">
        <a target="_new" href="scholarships.pdf">Scholarship Application</a>
        <a target="_new" href="placements.pdf">Campus Placement Drive</a>
      </div>
    </body>
  </html>
`;

describe('Dashboard Parsers', () => {
  describe('parseStudentInfo', () => {
    it('should extract student name', () => {
      const result = parseStudentInfo(mockDashboardHTML);
      expect(result.name).toBe('Aryan Anand');
    });

    it('should extract enrollment number', () => {
      const result = parseStudentInfo(mockDashboardHTML);
      expect(result.enrollment).toBe('24BCS100');
    });

    it('should extract branch', () => {
      const result = parseStudentInfo(mockDashboardHTML);
      expect(result.branch).toContain('Computer Science');
    });

    it('should handle missing student info', () => {
      const emptyHTML = '<html></html>';
      const result = parseStudentInfo(emptyHTML);
      expect(result.name).toBe('Student');
      expect(result.enrollment).toBe('');
      expect(result.branch).toBe('');
    });
  });

  describe('parseAttendance', () => {
    it('should extract attendance records', () => {
      const result = parseAttendance(mockDashboardHTML);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should parse first subject correctly', () => {
      const result = parseAttendance(mockDashboardHTML);
      const ds = result.find((a) => a.subject === 'Data Structures');
      expect(ds).toBeDefined();
      expect(ds?.percentage).toBe(82.5);
      // Detail fields are hardcoded to 0 in dashboard parser (requires detail scraper)
      expect(ds?.classesHeld).toBe(0);
      expect(ds?.classesAttended).toBe(0);
    });

    it('should initialize safe bunks to 0', () => {
      const result = parseAttendance(mockDashboardHTML);
      const ds = result.find((a) => a.subject === 'Data Structures');
      // safeBunksLeft is calculated on the frontend or via detail scraper
      expect(ds?.safeBunksLeft).toBe(0);
    });

    it('should parse all subjects', () => {
      const result = parseAttendance(mockDashboardHTML);
      const subjects = result.map((a) => a.subject);
      expect(subjects).toContain('Data Structures');
      expect(subjects).toContain('Discrete Mathematics');
      expect(subjects).toContain('Web Development');
    });

    it('should return empty array for no attendance data', () => {
      const emptyHTML = '<html></html>';
      const result = parseAttendance(emptyHTML);
      expect(result).toEqual([]);
    });
  });

  describe('parsePerformance', () => {
    it('should extract current SGPA', () => {
      const result = parsePerformance(mockDashboardHTML);
      expect(result.currentSgpa).toBe(8.4);
    });

    it('should extract CGPA', () => {
      const result = parsePerformance(mockDashboardHTML);
      expect(result.cgpa).toBe(8.2);
    });

    it('should handle missing performance data', () => {
      const emptyHTML = '<html></html>';
      const result = parsePerformance(emptyHTML);
      expect(result.currentSgpa).toBe(0);
      expect(result.cgpa).toBe(0);
    });
  });

  describe('parseNotices', () => {
    it('should extract notices', () => {
      const result = parseNotices(mockDashboardHTML);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should parse notice title', () => {
      const result = parseNotices(mockDashboardHTML);
      const scholarship = result.find((n) => n.title.includes('Scholarship'));
      expect(scholarship).toBeDefined();
      // Date is empty in new parser
      expect(scholarship?.date).toBe('');
    });

    it('should extract notice links', () => {
      const result = parseNotices(mockDashboardHTML);
      const scholarship = result.find((n) => n.title.includes('Scholarship'));
      // Only absolute URLs are passed back in new parser if present
      expect(scholarship?.link).toBe('');
    });

    it('should return empty array for no notices', () => {
      const emptyHTML = '<html></html>';
      const result = parseNotices(emptyHTML);
      expect(result).toEqual([]);
    });
  });

  describe('parseDashboard', () => {
    it('should parse complete dashboard', () => {
      const result = parseDashboard(mockDashboardHTML);
      
      expect(result.student).toBeDefined();
      expect(result.attendance).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.notices).toBeDefined();
      expect(result.courses).toBeDefined();
      expect(result.detailedMarks).toBeDefined();
    });

    it('should return proper structure', () => {
      const result = parseDashboard(mockDashboardHTML);
      
      expect(result.student.name).toBe('Aryan Anand');
      expect(result.attendance.length).toBeGreaterThan(0);
      expect(result.performance.currentSgpa).toBe(8.4);
      expect(result.notices.length).toBeGreaterThan(0);
    });

    it('should handle empty HTML gracefully', () => {
      const emptyHTML = '<html></html>';
      const result = parseDashboard(emptyHTML);

      expect(result.student.name).toBe('Student');
      expect(result.attendance).toEqual([]);
      expect(result.performance.currentSgpa).toBe(0);
      expect(result.notices).toEqual([]);
      expect(result.courses).toEqual([]);
      expect(result.detailedMarks).toEqual([]);
    });
  });

  describe('parseRegisteredCourses', () => {
    const mockCoursesHTML = `
      <table class="sort-table">
        <thead>
          <tr>
            <th>S.No.</th>
            <th>Subject Code</th>
            <th>Subject Name</th>
            <th>Subject Type</th>
            <th>Credits</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>18B11CI311</td>
            <td>Data Structures</td>
            <td>Theory</td>
            <td>4</td>
          </tr>
          <tr>
            <td>2</td>
            <td>18B11CI312</td>
            <td>Data Structures Lab</td>
            <td>Practical</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
    `;

    it('should parse registered courses correctly', () => {
      const result = parseRegisteredCourses(mockCoursesHTML);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        code: '18B11CI311',
        title: 'Data Structures',
        type: 'Theory',
        credits: 4,
      });
      expect(result[1]).toEqual({
        code: '18B11CI312',
        title: 'Data Structures Lab',
        type: 'Practical',
        credits: 1,
      });
    });

    it('should deduplicate courses by code', () => {
      const duplicateHTML = `
        <table class="sort-table">
          <thead>
            <tr>
              <th>S.No.</th>
              <th>Subject Code</th>
              <th>Subject Name</th>
              <th>Subject Type</th>
              <th>Credits</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>18B11CI311</td>
              <td>Data Structures</td>
              <td>Theory</td>
              <td>4</td>
            </tr>
            <tr>
              <td>2</td>
              <td>18B11CI311</td>
              <td>Data Structures Duplicate</td>
              <td>Theory</td>
              <td>4</td>
            </tr>
          </tbody>
        </table>
      `;
      const result = parseRegisteredCourses(duplicateHTML);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Data Structures');
    });

    it('should return empty array for empty HTML', () => {
      expect(parseRegisteredCourses('<html></html>')).toEqual([]);
    });
  });

  describe('parseDetailedMarks', () => {
    const mockMarksHTML = `
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>T1 (15)</th>
            <th>T2 (15)</th>
            <th>End Sem (35)</th>
            <th>Total (100)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Data Structures [18B11CI311]</td>
            <td>12.5</td>
            <td>11.0</td>
            <td>28.5</td>
            <td>52.0</td>
          </tr>
        </tbody>
      </table>
    `;

    it('should parse detailed marks correctly', () => {
      const result = parseDetailedMarks(mockMarksHTML);
      expect(result).toHaveLength(1);
      const dsMarks = result[0];
      expect(dsMarks.subject).toBe('Data Structures');
      expect(dsMarks.code).toBe('18B11CI311');
      expect(dsMarks.total).toBe(52.0);
      expect(dsMarks.components).toHaveLength(3);
      expect(dsMarks.components[0]).toEqual({
        name: 'T1',
        obtained: 12.5,
        max: 15,
      });
    });

    it('should return empty array for empty HTML', () => {
      expect(parseDetailedMarks('<html></html>')).toEqual([]);
    });
  });
});
