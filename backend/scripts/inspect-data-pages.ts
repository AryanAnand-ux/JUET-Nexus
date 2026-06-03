/**
 * Fetch attendance and marks pages from an active session.
 * Usage: ts-node scripts/inspect-data-pages.ts <enrollment> <dob> <password>
 */

import 'dotenv/config';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';

const BASE = process.env.WEBKIOSK_BASE_URL || 'https://webkiosk.juet.ac.in';

async function main() {
  const [enrollment, dob, password] = process.argv.slice(2);
  if (!enrollment || !dob || !password) {
    console.error('Usage: ts-node scripts/inspect-data-pages.ts <enrollment> <dob> <password>');
    process.exit(1);
  }

  // Login (2 requests total: GET login + POST auth)
  console.log('[1] Login...');
  const loginResp = await axios.get(`${BASE}/`, { timeout: 10000 });
  const cookies = loginResp.headers['set-cookie'] || [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
  const dom = new JSDOM(loginResp.data);
  const captcha = dom.window.document.querySelector('.noselect')?.textContent?.trim() || '';
  
  const form = new URLSearchParams({
    InstCode: 'JUET', UserType: 'S',
    MemberCode: enrollment.toUpperCase(), DATE1: dob,
    Password: password, txtcap: captcha, BTNSubmit: 'Submit',
  });

  const authResp = await axios.post(`${BASE}/CommonFiles/UserAction.jsp`, form.toString(), {
    timeout: 10000, maxRedirects: 5, validateStatus: () => true,
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const authCookies = authResp.headers['set-cookie'] || [];
  const authCookieStr = authCookies.map((c: string) => c.split(';')[0]).join('; ');
  const jsid = (authCookieStr.match(/JSESSIONID=([^;]+)/) || cookieHeader.match(/JSESSIONID=([^;]+)/))?.[1] || '';
  const cookie = `JSESSIONID=${jsid}`;
  console.log(`   OK (session: ${jsid.substring(0, 12)}...)`);

  // Verify login
  const verify = await axios.get(`${BASE}/StudentFiles/StudentPage.jsp`, {
    timeout: 10000, headers: { Cookie: cookie },
  });
  if (verify.data.includes('Session timeout')) {
    console.error('   ❌ Login failed');
    process.exit(1);
  }
  console.log('   ✓ Login verified');

  // Fetch data pages in parallel (3 requests)
  console.log('[2] Fetching data pages...');
  const pages: Record<string, string> = {};
  const urls: Record<string, string> = {
    attendance: '/StudentFiles/Academic/StudentAttendanceList.jsp',
    marks: '/StudentFiles/Exam/StudentEventMarksView.jsp',
    cgpa: '/StudentFiles/Exam/StudCGPAReport.jsp',
  };

  const results = await Promise.allSettled(
    Object.entries(urls).map(async ([name, path]) => {
      const resp = await axios.get(`${BASE}${path}`, {
        timeout: 10000, validateStatus: () => true,
        headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
      });
      return { name, html: typeof resp.data === 'string' ? resp.data : '' };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      pages[r.value.name] = r.value.html;
      const fname = `dump_${r.value.name}.html`;
      fs.writeFileSync(fname, r.value.html);
      console.log(`   ${r.value.name}: ${r.value.html.length} bytes → ${fname}`);
    } else {
      console.log(`   FAILED: ${r.reason}`);
    }
  }

  // Analyse each page
  for (const [name, html] of Object.entries(pages)) {
    console.log(`\n=== ${name.toUpperCase()} PAGE ===`);
    const d = new JSDOM(html);
    const doc = d.window.document;
    
    // Title
    const title = doc.querySelector('title')?.textContent?.trim();
    console.log(`Title: ${title}`);

    // Tables
    const tables = doc.querySelectorAll('table');
    console.log(`Tables: ${tables.length}`);
    tables.forEach((table, i) => {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;
      
      // Header row
      const headerCells: string[] = [];
      rows[0].querySelectorAll('th, td').forEach((cell) => {
        headerCells.push(cell.textContent?.trim().substring(0, 40) || '');
      });
      
      // First data row
      const dataCells: string[] = [];
      if (rows.length > 1) {
        rows[1].querySelectorAll('td').forEach((cell) => {
          dataCells.push(cell.textContent?.trim().substring(0, 40) || '');
        });
      }

      console.log(`  Table[${i}]: ${rows.length} rows`);
      console.log(`    Headers: [${headerCells.join(' | ')}]`);
      if (dataCells.length > 0) {
        console.log(`    Row 1:   [${dataCells.join(' | ')}]`);
      }
    });

    // Forms and selects
    doc.querySelectorAll('select').forEach((sel) => {
      const name = sel.getAttribute('name') || sel.getAttribute('id') || '';
      const opts: string[] = [];
      sel.querySelectorAll('option').forEach((o) => opts.push(o.textContent?.trim() || ''));
      console.log(`  Select "${name}": [${opts.join(', ')}]`);
    });
  }

  console.log('\nDone! Total requests: 6 (2 login + 1 verify + 3 data)');
}

main().catch((e) => console.error('Error:', e.message));
