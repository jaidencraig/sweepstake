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
  LAST_32:        'r32',
  LAST_16:        'r16',
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

  process.stdout.write('  Fetching matches...   ');
  let matchesData;
  try {
    matchesData = await apiGet(`/competitions/${COMPETITION}/matches`);
    console.log('OK');
  } catch (err) {
    console.error('\n  Error: ' + err.message);
    process.exit(1);
  }

  // ─── Process matches ────────────────────────────────────────────────────────

  const groupMatches    = {};
  const groupTeams      = {}; // all teams per group (from ALL matches, incl. scheduled)
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
      if (!groupTeams[letter])   groupTeams[letter]   = new Set();
      // Collect teams from all matches (including scheduled) so every team appears
      groupTeams[letter].add(home);
      groupTeams[letter].add(away);
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

  // ─── Compute group standings from match results ──────────────────────────────
  // Points: 3 for a win, 1 for a draw, 0 for a loss.

  const groupStandings = {};
  Object.entries(groupTeams).forEach(([letter, teamsSet]) => {
    const stats = {};
    teamsSet.forEach(t => {
      stats[t] = { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
    });

    (groupMatches[letter] || []).forEach(m => {
      if (m.status !== 'FINISHED' || m.homeScore === null || m.awayScore === null) return;
      const h = stats[m.home];
      const a = stats[m.away];
      if (!h || !a) return;

      h.played++; a.played++;
      h.gf += m.homeScore; h.ga += m.awayScore;
      a.gf += m.awayScore; a.ga += m.homeScore;
      h.gd = h.gf - h.ga;
      a.gd = a.gf - a.ga;

      if (m.homeScore > m.awayScore) {
        h.won++; h.points += 3; a.lost++;
      } else if (m.homeScore < m.awayScore) {
        a.won++; a.points += 3; h.lost++;
      } else {
        h.drawn++; h.points += 1;
        a.drawn++; a.points += 1;
      }
    });

    // Sort: points → GD → GF
    groupStandings[letter] = Object.values(stats)
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  });

  // Guaranteed qualifiers and mathematical eliminations
  const guaranteedQualified = new Set();
  Object.values(groupStandings).forEach(table => {
    if (table.length !== 4) return;
    if (table.every(r => r.played === 3)) {
      // Full group complete: 4th place is eliminated
      eliminated.add(table[3].team);
    } else {
      // Mid-group: 4th place eliminated if they can't even reach 3rd's current pts
      const thirdPts = table[2].points;
      const fourth   = table[3];
      if (fourth.points + 3 * (3 - fourth.played) < thirdPts) eliminated.add(fourth.team);
    }
    // Guaranteed top-2: fewer than 2 other teams can mathematically exceed this team's pts
    table.forEach(row => {
      const canBeat = table.filter(o => o.team !== row.team && (o.points + 3 * (3 - o.played)) > row.points).length;
      if (canBeat < 2) guaranteedQualified.add(row.team);
    });
  });
  // Once the full Round-of-32 line-up is known, any team not in it is out.
  // This catches 3rd-place teams that missed the best-8 cut, which the
  // per-group maths above can't detect.
  const r32Teams = new Set();
  knockoutMatches.r32.forEach(m => {
    if (m.home) r32Teams.add(m.home);
    if (m.away) r32Teams.add(m.away);
  });
  if (r32Teams.size === 32) {
    Object.values(groupTeams).forEach(teamsSet => teamsSet.forEach(t => {
      if (!r32Teams.has(t)) eliminated.add(t);
    }));
  }

  // ─── Write live.js ──────────────────────────────────────────────────────────

  const payload = {
    fetchedAt: new Date().toISOString(),
    eliminated: [...eliminated],
    guaranteedQualified: [...guaranteedQualified],
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

  // Update cache-busting timestamp on the live.js script tag in index.html
  const indexPath = path.join(__dirname, 'index.html');
  const ts = payload.fetchedAt.replace(/[^0-9]/g, '').slice(0, 14);
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/src="live\.js(?:\?v=[^"]*)?"/,  `src="live.js?v=${ts}"`);
  fs.writeFileSync(indexPath, html, 'utf8');

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
    execSync('git add "' + OUT_FILE + '" "' + indexPath + '"', { stdio: 'ignore', cwd: __dirname });
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
