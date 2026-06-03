/**
 * Integration test: import the ACTUAL parser and run it on real HTML dumps
 */
import * as fs from 'fs';
import { parseDashboard } from '../src/parsers/dashboard';

const attendanceHtml = fs.readFileSync('dump_attendance_x_ddd_exam.html', 'utf8');
const cgpaHtml = fs.readFileSync('dump_cgpa.html', 'utf8');

let mainHtml = '';
try { mainHtml = fs.readFileSync('dump_main_content.html', 'utf8'); } catch {}

const combinedHtml = [
  '<!-- PAGE: main -->', mainHtml,
  '<!-- PAGE: attendance -->', attendanceHtml,
  '<!-- PAGE: cgpa -->', cgpaHtml,
].join('\n');

console.log(`Combined HTML: ${combinedHtml.length} bytes\n`);

const result = parseDashboard(combinedHtml);

console.log('=== STUDENT ===');
console.log(JSON.stringify(result.student, null, 2));

console.log('\n=== ATTENDANCE ===');
console.log(`${result.attendance.length} subjects:`);
result.attendance.forEach(a => {
  console.log(`  ${a.subject}: ${a.percentage}% (L:${a.lecturePercent}% T:${a.tutorialPercent}% P:${a.practicalPercent}%)`);
});

console.log('\n=== PERFORMANCE ===');
console.log(`SGPA: ${result.performance.currentSgpa}, CGPA: ${result.performance.cgpa}`);
console.log(`Semesters: ${result.performance.semesters.length}`);
result.performance.semesters.forEach(s => {
  console.log(`  Sem ${s.semester}: SGPA=${s.sgpa}, CGPA=${s.cgpa}, Credits=${s.credits}`);
});

console.log('\n=== NOTICES ===');
console.log(`${result.notices.length} notices`);

// Validation
let errors = 0;
if (!result.student.name || result.student.name === 'Student') { console.error('FAIL: name missing'); errors++; }
if (!result.student.enrollment) { console.error('FAIL: enrollment missing'); errors++; }
if (!result.student.branch) { console.error('FAIL: branch missing'); errors++; }
if (result.attendance.length === 0) { console.error('FAIL: no attendance'); errors++; }
if (result.performance.currentSgpa === 0) { console.error('FAIL: no SGPA'); errors++; }
if (result.performance.cgpa === 0) { console.error('FAIL: no CGPA'); errors++; }
if (result.performance.semesters.length === 0) { console.error('FAIL: no semesters'); errors++; }

console.log(`\n${errors === 0 ? '✓ ALL TESTS PASSED' : `✗ ${errors} TESTS FAILED`}`);
process.exit(errors > 0 ? 1 : 0);
