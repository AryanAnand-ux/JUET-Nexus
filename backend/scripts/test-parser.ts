/**
 * Test parser against real WebKiosk HTML dumps
 */
import * as cheerio from 'cheerio';
import * as fs from 'fs';

function safeFloat(s: string | undefined): number {
  const n = parseFloat(s ?? '');
  return isNaN(n) ? 0 : n;
}

function safeInt(s: string | undefined): number {
  const n = parseInt(s ?? '', 10);
  return isNaN(n) ? 0 : n;
}

// Read the real HTML
const attendanceHtml = fs.readFileSync('dump_attendance_x_ddd_exam.html', 'utf8');
const cgpaHtml = fs.readFileSync('dump_cgpa.html', 'utf8');
const mainHtml = fs.readFileSync('dump_main_content.html', 'utf8');

console.log('=== STUDENT INFO PARSE ===');
const combinedHtml = ['<!-- PAGE: main -->', mainHtml, '<!-- PAGE: attendance -->', attendanceHtml, '<!-- PAGE: cgpa -->', cgpaHtml].join('\n');

// Test student info
const welcomeMatch = combinedHtml.match(/Welcome\s*,\s*([A-Z][A-Z\s]+)/i);
console.log('Name from Welcome:', welcomeMatch ? welcomeMatch[1].trim() : 'NOT FOUND');

const nameEnrollMatch = combinedHtml.match(/Name:\s*(?:<\/\w+>)?\s*([^[<]+)\[(\w+)\]/);
console.log('Name from attendance:', nameEnrollMatch ? nameEnrollMatch[1].trim() : 'NOT FOUND');
console.log('Enrollment:', nameEnrollMatch ? nameEnrollMatch[2] : 'NOT FOUND');

const branchMatch = combinedHtml.match(/Branch\s*:\s*<\/[Bb]>\s*([^<]+)/);
console.log('Branch from CGPA:', branchMatch ? branchMatch[1].trim() : 'NOT FOUND');

console.log('\n=== ATTENDANCE PARSE ===');
const $ = cheerio.load(attendanceHtml);

// Check the table structure
const sortTable = $('table.sort-table, table#table-1').first();
console.log('Sort table found:', sortTable.length > 0);

// Get header row
const headerRow = sortTable.find('thead tr').first();
const headers: string[] = [];
headerRow.find('th, td').each((_, th) => {
  headers.push($(th).text().toLowerCase().trim().replace(/\s+/g, ' '));
});
console.log('Headers:', headers);

const subjectIdx = headers.findIndex(h => h.includes('subject'));
const combinedIdx = headers.findIndex(h => h.includes('lecture+tutorial'));
const lectureIdx = headers.findIndex(h => h === 'lecture(%)' || (h.includes('lecture') && !h.includes('tutorial') && !h.includes('+')));
const tutorialIdx = headers.findIndex(h => h.includes('tutorial') && !h.includes('+'));
const practicalIdx = headers.findIndex(h => h.includes('practical'));

console.log('Column indices - subject:', subjectIdx, 'combined:', combinedIdx, 'lecture:', lectureIdx, 'tutorial:', tutorialIdx, 'practical:', practicalIdx);

// Parse rows
const results: any[] = [];
sortTable.find('tbody tr').each((rowIdx, row) => {
  const cells: string[] = [];
  $(row).find('td').each((_, td) => {
    cells.push($(td).text().trim().replace(/\u00a0/g, '').trim()); // replace &nbsp;
  });
  
  const subject = subjectIdx >= 0 ? cells[subjectIdx] : cells[1];
  if (!subject) return;
  
  const combined = safeFloat(combinedIdx >= 0 ? cells[combinedIdx] : undefined);
  const lecture = safeFloat(lectureIdx >= 0 ? cells[lectureIdx] : undefined);
  const tutorial = safeFloat(tutorialIdx >= 0 ? cells[tutorialIdx] : undefined);
  const practical = safeFloat(practicalIdx >= 0 ? cells[practicalIdx] : undefined);
  const percentage = combined > 0 ? combined : (lecture > 0 ? lecture : practical);

  results.push({ subject, combined, lecture, tutorial, practical, percentage, rawCells: cells });
});

console.log('\nParsed attendance records:');
results.forEach(r => {
  console.log(`  "${r.subject}" → combined=${r.combined}% lecture=${r.lecture}% tutorial=${r.tutorial}% practical=${r.practical}% (using ${r.percentage}%)`);
});
console.log(`Total: ${results.length} subjects`);

console.log('\n=== CGPA PARSE ===');
const $cgpa = cheerio.load(cgpaHtml);
const cgpaTable = $cgpa('table.sort-table, table#table-1').first();
console.log('CGPA sort table found:', cgpaTable.length > 0);

const cgpaHeaders: string[] = [];
cgpaTable.find('thead tr').first().find('th, td').each((_, th) => {
  cgpaHeaders.push($cgpa(th).text().toLowerCase().trim());
});
console.log('CGPA headers:', cgpaHeaders);

const semesters: any[] = [];
cgpaTable.find('tbody tr').each((_, row) => {
  const cells: string[] = [];
  $cgpa(row).find('td').each((_, td) => { cells.push($cgpa(td).text().trim()); });
  if (cells.length >= 8) {
    semesters.push({ sem: cells[0], sgpa: cells[6], cgpa: cells[7] });
  }
});
console.log('Semesters:', semesters);
