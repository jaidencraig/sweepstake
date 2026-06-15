/**
 * World Cup 2026 Sweepstake — Scheduler Setup
 *
 * Run once with: node setup-schedule.js
 * Saves your API key and schedules a refresh every 3 hours automatically.
 */

'use strict';
const { execSync } = require('child_process');
const readline     = require('readline');
const fs           = require('fs');
const path         = require('path');

const SCRIPT_DIR = __dirname;
const CONFIG_FILE = path.join(SCRIPT_DIR, 'config.json');
const BAT_FILE    = path.join(SCRIPT_DIR, 'run-fetch.bat');
const TASK_NAME   = 'WC2026Sweepstake';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  console.log('');
  console.log('  World Cup 2026 Sweepstake — Scheduler Setup');
  console.log('  ============================================');
  console.log('');

  // ─── 1. API key ─────────────────────────────────────────────────────────────

  let apiKey = process.env.WC_API_KEY || '';

  if (!apiKey) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      apiKey = cfg.WC_API_KEY || '';
      if (apiKey) console.log('  Found existing API key in config.json');
    } catch (_) {}
  }

  if (!apiKey) {
    console.log('  Get a free key at: https://www.football-data.org/client/register');
    apiKey = await ask('  Paste your API key here: ');
  }

  if (!apiKey) {
    console.error('  No API key entered. Exiting.');
    process.exit(1);
  }

  // ─── 2. Save key to config.json ─────────────────────────────────────────────

  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ WC_API_KEY: apiKey }, null, 2), 'utf8');
  console.log('  API key saved to config.json (fetch-data.js will read it automatically)');

  // ─── 3. Find node.exe ───────────────────────────────────────────────────────

  let nodePath;
  try {
    nodePath = execSync('where node').toString().trim().split(/\r?\n/)[0].trim();
  } catch (_) {
    console.error('  Could not find node.exe. Make sure Node.js is installed.');
    process.exit(1);
  }
  console.log('  Node.js found: ' + nodePath);

  // ─── 4. Write run-fetch.bat ─────────────────────────────────────────────────
  // A .bat file avoids all PowerShell execution-policy issues

  const fetchScript = path.join(SCRIPT_DIR, 'fetch-data.js');
  fs.writeFileSync(BAT_FILE, '@echo off\r\n"' + nodePath + '" "' + fetchScript + '"\r\n', 'ascii');
  console.log('  Created run-fetch.bat');

  // ─── 5. Register scheduled task via schtasks (no PowerShell policy needed) ──

  try { execSync('schtasks /delete /tn "' + TASK_NAME + '" /f', { stdio: 'ignore' }); } catch (_) {}

  try {
    execSync(
      'schtasks /create'
      + ' /tn "' + TASK_NAME + '"'
      + ' /tr "' + BAT_FILE + '"'
      + ' /sc HOURLY /mo 3 /st 00:00 /f',
      { stdio: 'ignore' }
    );
    console.log('  Scheduled task created — will run every 3 hours (00:00, 03:00, 06:00...)');
  } catch (_) {
    console.log('  Note: could not create scheduled task (may need to run as Administrator).');
    console.log('  You can still refresh manually with: node fetch-data.js');
  }

  // ─── 6. Run first sync now ───────────────────────────────────────────────────

  console.log('');
  console.log('  Running first data sync now...');
  console.log('');
  try {
    execSync('"' + nodePath + '" "' + fetchScript + '"', { stdio: 'inherit', cwd: SCRIPT_DIR });
  } catch (_) {}

  console.log('');
  console.log('  All done! Reload your browser to see live data.');
  console.log('  From now on the data refreshes automatically every 3 hours.');
  console.log('');
}

main().catch(err => { console.error('  Error:', err.message); process.exit(1); });
