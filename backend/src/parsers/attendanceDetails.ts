import * as cheerio from 'cheerio';
import type { AttendanceDetailItem } from '../../../shared/types';

/**
 * Parses the detailed attendance page (e.g., StudentAttendanceDetails.jsp)
 * Since we don't have the exact DOM structure, this is a flexible table scraper.
 */
export function parseAttendanceDetails(html: string): AttendanceDetailItem[] {
  const $ = cheerio.load(html);
  const logs: AttendanceDetailItem[] = [];

  $('table').each((_, table) => {
    const $table = $(table);
    const headerRow = $table.find('thead tr, tr').first();
    const headerText = headerRow.text().toLowerCase();

    // Look for a table that has Date and Status
    if (!headerText.includes('date') && !headerText.includes('status')) return;

    // Find column indices
    const headers: string[] = [];
    headerRow.find('th, td').each((_, th) => {
      headers.push($(th).text().toLowerCase().trim());
    });

    const dateIdx = headers.findIndex(h => h.includes('date'));
    const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('present/absent'));
    const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('class'));

    // We absolutely need date and status
    if (dateIdx < 0 || statusIdx < 0) return;

    $table.find('tbody tr, tr').each((rowIdx, row) => {
      if (rowIdx === 0) return; // skip header
      const cells: string[] = [];
      
      $(row).find('td').each((_, td) => {
        cells.push($(td).text().trim());
      });

      if (cells.length <= Math.max(dateIdx, statusIdx)) return;

      const rawDate = cells[dateIdx];
      const rawStatus = cells[statusIdx].toLowerCase();
      const rawType = typeIdx >= 0 ? cells[typeIdx] : 'Lecture';

      if (!rawDate || !rawStatus) return;

      // Only add if status looks like a real attendance status
      const isPresent = rawStatus.includes('present') || rawStatus === 'p' || rawStatus.includes('yes');
      const isAbsent = rawStatus.includes('absent') || rawStatus === 'a' || rawStatus.includes('no');

      if (isPresent || isAbsent) {
        logs.push({
          date: rawDate,
          status: isPresent ? 'Present' : 'Absent',
          type: rawType,
        });
      }
    });
  });

  return logs;
}
