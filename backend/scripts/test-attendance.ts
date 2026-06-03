/**
 * Test attendance URL with different params.
 * Single login, multiple fetch attempts.
 */
import axios from 'axios';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';

const BASE = 'https://webkiosk.juet.ac.in';

async function main() {
  const [enrollment, dob, password] = process.argv.slice(2);
  if (!enrollment || !dob || !password) {
    console.error('Usage: ts-node scripts/test-attendance.ts <enrollment> <dob> <password>');
    process.exit(1);
  }

  // Login
  console.log('[Login]');
  const loginResp = await axios.get(`${BASE}/`, { timeout: 10000 });
  const cookies = (loginResp.headers['set-cookie'] || []).map((c: string) => c.split(';')[0]).join('; ');
  const dom = new JSDOM(loginResp.data);
  const captcha = dom.window.document.querySelector('.noselect')?.textContent?.trim() || '';
  console.log(`  Captcha: ${captcha}`);

  const form = new URLSearchParams({
    InstCode: 'JUET', UserType: 'S',
    MemberCode: enrollment.toUpperCase(), DATE1: dob,
    Password: password, txtcap: captcha, BTNSubmit: 'Submit',
  });

  await axios.post(`${BASE}/CommonFiles/UserAction.jsp`, form.toString(), {
    timeout: 10000, maxRedirects: 5, validateStatus: () => true,
    headers: { Cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const jsid = cookies.match(/JSESSIONID=([^;]+)/)?.[1] || '';
  const cookie = `JSESSIONID=${jsid}`;

  // Verify login
  const verify = await axios.get(`${BASE}/StudentFiles/StudentPage.jsp`, {
    timeout: 10000, headers: { Cookie: cookie },
  });
  if (verify.data.includes('Session timeout') || verify.data.length < 200) {
    console.error('Login FAILED');
    process.exit(1);
  }
  console.log('  Login OK');

  // Test different URL formats
  const tests = [
    { label: 'No params', url: `${BASE}/StudentFiles/Academic/StudentAttendanceList.jsp` },
    { label: 'exam only', url: `${BASE}/StudentFiles/Academic/StudentAttendanceList.jsp?exam=2026EVESEM` },
    { label: 'x=ddd&exam', url: `${BASE}/StudentFiles/Academic/StudentAttendanceList.jsp?x=ddd&exam=2026EVESEM` },
    { label: 'x=&exam', url: `${BASE}/StudentFiles/Academic/StudentAttendanceList.jsp?x=&exam=2026EVESEM` },
  ];

  for (const t of tests) {
    try {
      const resp = await axios.get(t.url, {
        timeout: 10000, validateStatus: () => true,
        headers: {
          Cookie: cookie,
          Referer: `${BASE}/StudentFiles/StudentPage.jsp`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = resp.data as string;
      const tbodyMatch = html.match(/<tbody>\s*([\s\S]*?)\s*<\/tbody>/);
      const tbodyContent = tbodyMatch ? tbodyMatch[1].trim() : '';
      const hasData = tbodyContent.length > 10;
      console.log(`\n[${t.label}] ${html.length} bytes, tbody=${tbodyContent.length} chars, hasData=${hasData}`);
      if (hasData) {
        fs.writeFileSync(`dump_attendance_${t.label.replace(/[^a-z]/gi, '_')}.html`, html);
        console.log(`  FOUND DATA! Saved to dump_attendance_${t.label.replace(/[^a-z]/gi, '_')}.html`);
        // Print first few rows
        const rowMatches = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/g) || [];
        console.log(`  Rows: ${rowMatches.length}`);
      }
    } catch (e: any) {
      console.log(`\n[${t.label}] ERROR: ${e.message}`);
    }
  }

  console.log('\nDone! Total requests: 2 (login) + 1 (verify) + 4 (tests) = 7');
}

main().catch(e => console.error('Fatal:', e.message));
