/**
 * Inspect WebKiosk frame structure — fetches all frames from a single login.
 * Usage: ts-node scripts/inspect-webkiosk.ts <enrollment> <dob> <password>
 */

import 'dotenv/config';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';

const BASE = process.env.WEBKIOSK_BASE_URL || 'https://webkiosk.juet.ac.in';

async function fetchPage(url: string, cookie: string): Promise<string> {
  const resp = await axios.get(url, {
    timeout: 10000,
    validateStatus: () => true,
    headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
  });
  return typeof resp.data === 'string' ? resp.data : '';
}

async function main() {
  const [enrollment, dob, password] = process.argv.slice(2);
  if (!enrollment || !dob || !password) {
    console.error('Usage: ts-node scripts/inspect-webkiosk.ts <enrollment> <dob> <password>');
    process.exit(1);
  }

  // Step 1: Get login page + captcha (1 request)
  console.log('[1] Fetching login page...');
  const loginResp = await axios.get(`${BASE}/`, { timeout: 10000 });
  const cookies = loginResp.headers['set-cookie'] || [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
  
  const dom = new JSDOM(loginResp.data);
  const captcha = dom.window.document.querySelector('.noselect')?.textContent?.trim() || '';
  console.log(`   Captcha: ${captcha}`);

  // Step 2: Login (1 request)
  console.log('[2] Logging in...');
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
  const sessionCookie = `JSESSIONID=${jsid}`;
  console.log(`   Session: ${jsid.substring(0, 15)}...`);

  // Step 3: Fetch all 3 frames (3 requests)
  console.log('[3] Fetching frames...');

  const leftMenu = await fetchPage(`${BASE}/StudentFiles/FrameLeftStudent.jsp`, sessionCookie);
  fs.writeFileSync('dump_left_menu.html', leftMenu);
  console.log(`   Left menu: ${leftMenu.length} bytes → dump_left_menu.html`);

  const topTitle = await fetchPage(`${BASE}/CommonFiles/TopTitle.jsp`, sessionCookie);
  fs.writeFileSync('dump_top_title.html', topTitle);
  console.log(`   Top title: ${topTitle.length} bytes → dump_top_title.html`);

  const mainContent = await fetchPage(`${BASE}/StudentFiles/PersonalFiles/ShowAlertMessageSTUD.jsp`, sessionCookie);
  fs.writeFileSync('dump_main_content.html', mainContent);
  console.log(`   Main content: ${mainContent.length} bytes → dump_main_content.html`);

  // Step 4: Parse left menu to find all navigation links
  console.log('\n[4] Left menu links:');
  const menuDom = new JSDOM(leftMenu);
  const menuDoc = menuDom.window.document;

  menuDoc.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const target = a.getAttribute('target') || '';
    const onclick = a.getAttribute('onclick') || '';
    const text = a.textContent?.trim() || '';
    if (text) {
      console.log(`  "${text}" → href="${href}" target="${target}" onclick="${onclick}"`);
    }
  });

  menuDoc.querySelectorAll('select').forEach((sel) => {
    const onchange = sel.getAttribute('onchange') || '';
    console.log(`  <select onchange="${onchange}">`);
    sel.querySelectorAll('option').forEach((opt) => {
      console.log(`    "${opt.textContent?.trim()}" → value="${opt.getAttribute('value')}"`);
    });
  });

  // Step 5: Parse top title for student name
  console.log('\n[5] Top title content:');
  const topDom = new JSDOM(topTitle);
  console.log(`   Text: ${topDom.window.document.body?.textContent?.trim().substring(0, 200)}`);

  // Step 6: Parse main content for notices
  console.log('\n[6] Main content (notices):');
  const mainDom = new JSDOM(mainContent);
  mainDom.window.document.querySelectorAll('a').forEach((a) => {
    console.log(`  "${a.textContent?.trim()}" → ${a.getAttribute('href')}`);
  });

  console.log('\nDone! Total requests: 5 (login + captcha + 3 frames)');
}

main().catch((e) => console.error('Error:', e.message));
