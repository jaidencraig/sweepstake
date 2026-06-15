#!/usr/bin/env node
/**
 * World Cup 2026 Sweepstake — Live Data Fetcher
 *
 * Prerequisites:
 *   1. Get a FREE API key at https://www.football-data.org/client/register
 *   2. Set it in PowerShell:
 *        $env:WC_API_KEY = "your_key_here"
 *        node fetch-data.js
 *
 * Run this whenever you want fresh data, then reload your browser.
 */

'use strict';
const https      = require('https');
const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────────

// API key: env variable takes priority, then config.json (written by setup-schedule.ps1)
let API_KEY = process.env.WC_API_KEY || '';
if (!API_KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    API_KEY = cfg.WC_API_KEY || '';
  } catch (_) {}
}

const COMPETITION = 'WC';
const OUT_FILE    = path.join(__dirname, 'live.js');

// Normalise API team names → our sweepstake names
const NAME_MAP = {
  'Iran':                          'IR Iran',
  'South Korea':                   'Korea Republic',
  'Ivory Coast':                   "Côte d'Ivoire",
  "Côte d'Ivoire":                "Côte d'Ivoire",
  'United States':                 'USA',
  'DR Congo':                      'Congo DR',
  'Democratic Republic of Congo':  'Congo DR',
  'Bosnia-Herzegovina':            'Bosnia and Herzegovina',
  'Cape Verde Islands':            'Cabo Verde',
  'Cape Verde':                    'Cabo Verde',
  'Curacao':                       'Curaçao',
  'Turkey':                        'Türkiye',
};

const norm = name => NAME_MAP[name] || name;

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.football-data.org',
      path:     `/v4${urlPath}`,
      headers:  { 'X-Auth-Token': API_KEY, 'Accept': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try   { resolve(JSON.parse(body)); }
          catch { reject(new Error('Could not parse API response as JSON')); }
        } else if (res.statusCode === 401) {
          reject(new Error('Invalid API key (401). Double-check your WC_API_KEY.'));
        } else if (res.statusCode === 403) {
          reject(new Error('Access denied (403). The WC may not be on your plan yet — try the free tier at football-data.org.'));
        } else if (res.statusCode === 404) {
          reject(new Error(`Competition "${COMPETITION}" not found (404).`));
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limit hit (429). Wait a minute, then try again.'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        }
      });
    }).on('error', reject);
  });
}

// ─── Stage key mapping ────────────────────────────────────────────────────────

const STAGE_KEY = {
  ROUND_OF_32:    'r32',
  ROUND_OF_16:    'r16',
  QUARTER_FINALS: 'qf',
  SEMI_FINALS:    'sf',
  FINAL:          'final'
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('');
    console.error('  No API key found.');
    console.error('');
    console.error('  1. Sign up free at: https://www.football-data.org/client/register');
    console.error('  2. Then run in PowerShell:');
    console.error('       $env:WC_API_KEY = "paste_your_key_here"');
    console.error('       node fetch-data.js');
    console.error('');
    process.exit(1);
  }

  process.stdout.write('  Fetching standings... ');
  let standingsData;
  try {
    standingsData = await apiGet(`/competitions/${COMPETITION}/standings`);
    console.log('OK');
  } catch (err) {
    console.error('\n  Error: ' + err.message);
    process.exit(1);
  }

  process.stdout.write('  Fetching matches...   ');
  let matchesData;
  try {
    matchesData = await apiGet(`/competitions/${COMPETITION}/matches`);
    console.log('OK');
  } catch (err) {
    console.error('\n  Error: ' + err.message);
    process.exit(1);
  }

  // ─── Process group standings ────────────────────────────────────────────────

  const groupStandings = {};
  (standingsData.standings || []).forEach(s => {
    if (s.type !== 'TOTAL' || !s.group) return;
    const letter = s.group.replace('GROUP_', '');
    groupStandings[letter] = (s.table || []).map(row => ({
      team:   norm(row.team.name),
      played: row.playedGames,
      won:    row.won,
      drawn:  row.draw,
      lost:   row.lost,
      gf:     row.goalsFor,
      ga:     row.goalsAgainst,
      gd:     row.goalDifference,
      points: row.points
    }));
  });

  // ─── Process matches ────────────────────────────────────────────────────────

  const groupMatches    = {};
  const knockoutMatches = { r32: [], r16: [], qf: [], sf: [], final: [] };
  const eliminated      = new Set();

  (matchesData.matches || []).forEach(m => {
    const home     = norm(m.homeTeam.name);
    const away     = norm(m.awayTeam.name);
    const status   = m.status;
    const finished = status === 'FINISHED';
    const live     = status === 'IN_PLAY' || status === 'PAUSED';
    const hScore   = m.score.fullTime.home;
    const aScore   = m.score.fullTime.away;
    const apiWin   = m.score.winner; // HOME_TEAM | AWAY_TEAM | DRAW | null

    if (m.stage === 'GROUP_STAGE') {
      const letter = (m.group || '').replace('GROUP_', '');
      if (!groupMatches[letter]) groupMatches[letter] = [];
      groupMatches[letter].push({
        home, away,
        homeScore: hScore !== null ? hScore : null,
        awayScore: aScore !== null ? aScore : null,
        status, live,
        matchday: m.matchday,
        date: m.utcDate
      });
    } else {
      const key = STAGE_KEY[m.stage];
      if (!key) return;
      const winnerTeam = apiWin === 'HOME_TEAM' ? home : apiWin === 'AWAY_TEAM' ? away : null;
      const loserTeam  = apiWin === 'HOME_TEAM' ? away : apiWin === 'AWAY_TEAM' ? home : null;
      knockoutMatches[key].push({
        home, away,
        homeScore: hScore !== null ? hScore : null,
        awayScore: aScore !== null ? aScore : null,
        winner: winnerTeam || '',
        status, live,
        date: m.utcDate
      });
      if (finished && loserTeam) eliminated.add(loserTeam);
    }
  });

  // 4th-place teams in completed groups are always eliminated
  Object.values(groupStandings).forEach(table => {
    if (table && table.length === 4 && table.every(r => r.played === 3)) {
      eliminated.add(table[3].team);
    }
  });
  // Note: 3rd-place qualification (8 best from 12) is complex to compute locally.
  // Once the full group stage bracket is official, the API match data will reflect it
  // and knockout losers will be auto-detected above.

  // ─── Write live.js ──────────────────────────────────────────────────────────

  const payload = {
    fetchedAt: new Date().toISOString(),
    eliminated: [...eliminated],
    groupStandings,
    groupMatches,
    knockoutMatches
  };

  const js = [
    '// Auto-generated by fetch-data.js — do not edit manually',
    '// Last updated: ' + payload.fetchedAt,
    'window.LIVE_DATA = ' + JSON.stringify(payload, null, 2) + ';'
  ].join('\n') + '\n';

  fs.writeFileSync(OUT_FILE, js, 'utf8');

  const allMatches   = matchesData.matches || [];
  const finishedCount = allMatches.filter(m => m.status === 'FINISHED').length;
  const liveCount     = allMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED').length;

  console.log('');
  console.log('  live.js written successfully.');
  console.log(`  ${finishedCount}/${allMatches.length} matches finished${liveCount ? ', ' + liveCount + ' live now' : ''}`);
  console.log(`  ${eliminated.size} team(s) eliminated`);
  console.log('');
  console.log('  Reload your browser to see the updated data.');

  // ─── Auto-push to GitHub Pages (if git is configured) ──────────────────────
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore', cwd: __dirname });
    execSync('git add "' + OUT_FILE + '"', { stdio: 'ignore', cwd: __dirname });
    execSync('git commit -m "Auto-update live data"', { cwd: __dirname, stdio: 'ignore' });
    execSync('git push', { cwd: __dirname, stdio: 'ignore' });
    console.log('  Pushed live.js to GitHub — site updated for everyone.');
  } catch (_) {
    // Git not configured or nothing changed — skip silently.
  }

  console.log('');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
