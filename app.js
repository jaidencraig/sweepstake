// ─── Live data (written by fetch-data.js, null if not yet synced) ─────────────
const LIVE = window.LIVE_DATA || null;

// ─── State ────────────────────────────────────────────────────────────────────

function makeBracket() {
  return {
    r32:   Array.from({length:16}, (_,i) => ({id:'r32_'+i,  teamA:'', teamB:'', winner:''})),
    r16:   Array.from({length:8},  (_,i) => ({id:'r16_'+i,  teamA:'', teamB:'', winner:''})),
    qf:    Array.from({length:4},  (_,i) => ({id:'qf_'+i,   teamA:'', teamB:'', winner:''})),
    sf:    Array.from({length:2},  (_,i) => ({id:'sf_'+i,   teamA:'', teamB:'', winner:''})),
    final: Array.from({length:1},  (_,i) => ({id:'final_0', teamA:'', teamB:'', winner:''}))
  };
}

const state = {
  eliminated: new Set(),
  bracket:    makeBracket(),
  view:       'overview',
  adminOpen:  false
};

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem('wc2026_sweep');
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.eliminated)) state.eliminated = new Set(d.eliminated);
      if (d.bracket) {
        Object.keys(state.bracket).forEach(round => {
          if (!d.bracket[round]) return;
          d.bracket[round].forEach((m, i) => {
            if (state.bracket[round][i]) Object.assign(state.bracket[round][i], m);
          });
        });
      }
    }
  } catch (_) {}

  // Merge live data on top of local state
  if (LIVE) {
    // Union: live eliminations always apply
    (LIVE.eliminated || []).forEach(t => state.eliminated.add(t));

    // Auto-populate bracket slots from live knockout matches (don't overwrite manual data)
    Object.keys(state.bracket).forEach(round => {
      const liveMsArr = (LIVE.knockoutMatches || {})[round] || [];
      liveMsArr.forEach((lm, i) => {
        const slot = state.bracket[round][i];
        if (!slot) return;
        if (!slot.teamA) slot.teamA = lm.home;
        if (!slot.teamB) slot.teamB = lm.away;
        if (!slot.winner && lm.winner) slot.winner = lm.winner;
      });
    });
  }
}

function saveState() {
  localStorage.setItem('wc2026_sweep', JSON.stringify({
    eliminated: [...state.eliminated],
    bracket:    state.bracket
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const flag     = t => FLAGS[t] || '🏳';
const isOut    = t => state.eliminated.has(t);
const isLiveOut = t => LIVE && (LIVE.eliminated || []).includes(t);
const teamsLeft = p => p.teams.filter(t => !isOut(t)).length;

function getWinner() {
  const fin = state.bracket.final[0];
  if (fin.winner && TEAM_OWNER[fin.winner]) return TEAM_OWNER[fin.winner];
  const paying  = PARTICIPANTS.filter(p => p.pays);
  const active  = paying.filter(p => teamsLeft(p) > 0);
  if (active.length === 1) return active[0];
  return null;
}

function sortedParticipants() {
  return [...PARTICIPANTS].sort((a, b) => {
    const diff = teamsLeft(b) - teamsLeft(a);
    if (diff !== 0) return diff;
    return (b.pays ? 1 : 0) - (a.pays ? 1 : 0);
  });
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Insights helpers ─────────────────────────────────────────────────────────

function getTeamMatchHistory(team) {
  if (!LIVE) return [];
  const matches = [];
  Object.values(LIVE.groupMatches || {}).forEach(function(ms) {
    ms.forEach(function(m) {
      if (m.status !== 'FINISHED') return;
      if (m.home === team) {
        matches.push({ result: m.homeScore > m.awayScore ? 'W' : m.homeScore < m.awayScore ? 'L' : 'D', gf: m.homeScore, ga: m.awayScore, date: m.date });
      } else if (m.away === team) {
        matches.push({ result: m.awayScore > m.homeScore ? 'W' : m.awayScore < m.homeScore ? 'L' : 'D', gf: m.awayScore, ga: m.homeScore, date: m.date });
      }
    });
  });
  Object.values(LIVE.knockoutMatches || {}).forEach(function(ms) {
    ms.forEach(function(m) {
      if (m.status !== 'FINISHED') return;
      if (m.home === team) {
        matches.push({ result: m.winner === team ? 'W' : 'L', gf: m.homeScore || 0, ga: m.awayScore || 0, date: m.date });
      } else if (m.away === team) {
        matches.push({ result: m.winner === team ? 'W' : 'L', gf: m.awayScore || 0, ga: m.homeScore || 0, date: m.date });
      }
    });
  });
  return matches.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
}

function getTeamForm(team, n) {
  n = n || 3;
  return getTeamMatchHistory(team).slice(-n).map(function(m) { return m.result; });
}

function isAtRisk(team) {
  if (!LIVE || isOut(team)) return false;
  if ((LIVE.guaranteedQualified || []).includes(team)) return false;
  const grp = TEAM_GROUP[team];
  const idx = ((LIVE.groupStandings || {})[grp] || []).findIndex(function(r) { return r.team === team; });
  if (idx < 2) return false;
  return ((LIVE.groupMatches || {})[grp] || []).some(function(m) {
    return m.status !== 'FINISHED' && (m.home === team || m.away === team);
  });
}

function calcParticipantStats(p) {
  var gf = 0, ga = 0, w = 0, d = 0, l = 0, cs = 0;
  p.teams.forEach(function(t) {
    getTeamMatchHistory(t).forEach(function(m) {
      gf += m.gf; ga += m.ga;
      if (m.result === 'W') w++;
      else if (m.result === 'D') d++;
      else l++;
      if (m.ga === 0) cs++;
    });
  });
  return { gf: gf, ga: ga, gd: gf - ga, w: w, d: d, l: l, cs: cs, played: w + d + l };
}

function calcWinProbabilities() {
  if (!LIVE) return {};
  const liveGuaranteed = LIVE.guaranteedQualified || [];

  function teamSurvivalProb(team) {
    if (state.eliminated.has(team)) return 0;
    if (liveGuaranteed.includes(team)) return 1.0;
    const grp      = TEAM_GROUP[team];
    const standing = (LIVE.groupStandings || {})[grp] || [];
    const gMatches = (LIVE.groupMatches  || {})[grp] || [];
    const hasLeft  = gMatches.some(function(m) {
      return m.status !== 'FINISHED' && (m.home === team || m.away === team);
    });
    if (!hasLeft) {
      const idx = standing.findIndex(function(r) { return r.team === team; });
      return idx < 2 ? 1.0 : 0;
    }
    const idx = standing.findIndex(function(r) { return r.team === team; });
    return ([0.88, 0.72, 0.28, 0.10][idx] !== undefined ? [0.88, 0.72, 0.28, 0.10][idx] : 0.10);
  }

  const paying = PARTICIPANTS.filter(function(p) { return p.pays; });
  const scores = {};
  paying.forEach(function(p) {
    scores[p.id] = p.teams.reduce(function(s, t) { return s + teamSurvivalProb(t); }, 0);
  });
  const total = Object.values(scores).reduce(function(a, b) { return a + b; }, 0);
  const probs = {};
  paying.forEach(function(p) {
    probs[p.id] = total > 0 ? scores[p.id] / total : 1 / paying.length;
  });
  return probs;
}

function formPill(r) {
  return '<span class="form-pill form-pill--' + r.toLowerCase() + '">' + r + '</span>';
}

function renderHBarChart(items, getValue, getLabel, getColor, opts) {
  opts     = opts || {};
  const fmt    = opts.format    || function(v) { return String(v); };
  const sec    = opts.secondary || null;
  const barH   = opts.height    || 30;
  const gap    = opts.gap       || 8;
  const labelW = opts.labelW    || 80;
  const valW   = opts.valW      || 48;
  const cW     = opts.chartW    || 480;
  const barW   = cW - labelW - valW;

  const primVals = items.map(getValue);
  const secVals  = sec ? items.map(sec) : [];
  const max      = Math.max.apply(null, primVals.concat(secVals).concat([1]));
  const totalH   = items.length * (barH + gap) - gap;

  const bars = items.map(function(item, i) {
    const v   = getValue(item);
    const bw  = Math.round((v / max) * barW);
    const y   = i * (barH + gap);
    const col = getColor(item);
    const mid = y + barH / 2 + 4.5;
    let secR  = '';
    if (sec) {
      const sv  = sec(item);
      const sbw = Math.round((sv / max) * barW);
      secR = '<rect x="' + labelW + '" y="' + y + '" width="' + sbw + '" height="' + barH + '" rx="3" fill="' + col + '" opacity="0.18"/>';
    }
    return '<text x="' + (labelW - 8) + '" y="' + mid + '" text-anchor="end" fill="#475569" font-size="11.5" font-weight="600" font-family="Inter,system-ui,sans-serif">' + getLabel(item) + '</text>'
      + '<rect x="' + labelW + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="3" fill="#e2e8f0"/>'
      + secR
      + (bw > 0 ? '<rect x="' + labelW + '" y="' + y + '" width="' + bw + '" height="' + barH + '" rx="3" fill="' + col + '" opacity="0.88"/>' : '')
      + '<text x="' + (labelW + Math.max(bw, 1) + 6) + '" y="' + mid + '" fill="#64748b" font-size="11.5" font-weight="700" font-family="Inter,system-ui,sans-serif">' + fmt(v) + '</text>';
  }).join('');

  return '<div class="chart-wrap"><svg viewBox="0 0 ' + cW + ' ' + totalH + '" preserveAspectRatio="xMidYMid meet" class="chart-svg">' + bars + '</svg></div>';
}

// ─── Sync status bar ──────────────────────────────────────────────────────────

function renderSyncBar() {
  if (!LIVE) {
    return '<div class="sync-bar sync-bar--none">'
      + '⚪ No live data — run <code>node fetch-data.js</code> in your terminal to sync'
      + '</div>';
  }
  const d = new Date(LIVE.fetchedAt);
  const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const liveCount = Object.values(LIVE.groupMatches || {})
    .flat().filter(m => m.live).length
    + Object.values(LIVE.knockoutMatches || {})
    .flat().filter(m => m.live).length;
  const liveNote = liveCount > 0
    ? ' · <span class="sync-bar-live">🔴 ' + liveCount + ' match' + (liveCount > 1 ? 'es' : '') + ' live now</span>'
    : '';
  return '<div class="sync-bar sync-bar--ok">'
    + '🟢 Synced ' + when + liveNote
    + ' · <small>Re-run <code>node fetch-data.js</code> then refresh to update</small>'
    + '</div>';
}

// ─── Render: Leaderboard ──────────────────────────────────────────────────────

function renderLeaderboard() {
  const sorted = sortedParticipants();
  const probs  = calcWinProbabilities();
  const rows = sorted.map((p, i) => {
    const left    = teamsLeft(p);
    const total   = p.teams.length;
    const out     = left === 0;
    const pct     = total ? (left / total * 100) : 0;
    const rankCls = i === 0 ? 'lb-pos--1' : i === 1 ? 'lb-pos--2' : i === 2 ? 'lb-pos--3' : '';
    const winPct  = p.pays && !out ? Math.round((probs[p.id] || 0) * 100) : null;
    return `
      <div class="lb-row ${out ? 'lb-row--out' : ''}">
        <div class="lb-pos ${rankCls}">${i + 1}</div>
        <div class="lb-avatar" style="background:linear-gradient(135deg,${p.color},${p.color}88)">${p.name[0]}</div>
        <div class="lb-info">
          <div class="lb-name-row">
            <span class="lb-name">${p.name}</span>
            ${!p.pays ? '<span class="lb-nostake">no stake</span>' : ''}
          </div>
          <div class="lb-bar-track">
            <div class="lb-bar-fill" style="width:${pct}%;background:${out ? '#374151' : p.color}"></div>
          </div>
        </div>
        <div class="lb-stat">
          ${out
            ? '<span class="lb-out-label">OUT</span>'
            : `<div><span class="lb-num" style="color:${p.color}">${left}</span><span class="lb-denom">/${total}</span></div>
               ${winPct !== null ? `<div class="lb-win-prob">${winPct}% win</div>` : ''}`
          }
        </div>
      </div>`;
  }).join('');
  return `<div class="leaderboard">${rows}</div>`;
}

// ─── Render: Overview ─────────────────────────────────────────────────────────

function renderParticipantCard(p) {
  const left  = teamsLeft(p);
  const total = p.teams.length;
  const out   = left === 0;
  const pct   = total ? (left / total * 100).toFixed(1) : 0;

  const liveQ = LIVE ? (LIVE.guaranteedQualified || []) : [];
  const teamCells = p.teams.map(t => {
    const eliminated  = isOut(t);
    const guaranteed  = liveQ.includes(t);
    const risk        = isAtRisk(t);
    const grp         = TEAM_GROUP[t];
    const cellCls     = eliminated ? 'team-cell--out' : guaranteed ? 'team-cell--through' : risk ? 'team-cell--risk' : 'team-cell--active';
    const badge       = guaranteed && !eliminated ? '<span class="team-cell-badge team-cell-badge--q">Q</span>'
                      : risk ? '<span class="team-cell-badge team-cell-badge--r">!</span>' : '';
    return `
      <div class="team-cell ${cellCls}">
        <span class="team-flag">${flag(t)}</span>
        <span class="team-cell-name">${t}</span>
        ${badge}
        <span class="team-cell-grp">${grp}</span>
      </div>`;
  }).join('');

  return `
    <div class="p-card ${out ? 'p-card--elim' : ''}">
      <div class="p-banner" style="background:linear-gradient(135deg,${p.color}22 0%,${p.color}08 50%,transparent 100%)">
        <div class="p-banner-left">
          <div class="p-banner-avatar" style="background:linear-gradient(135deg,${p.color},${p.color}88)">${p.name[0]}</div>
          <div>
            <div class="p-banner-name">${p.name}</div>
            <div class="p-banner-sub">${p.pays ? '£10 stake' : 'Just for fun 🌟'}</div>
          </div>
        </div>
        ${out
          ? '<div class="p-banner-out">💀 Eliminated</div>'
          : `<div class="p-banner-count"><span style="color:${p.color}">${left}</span><span class="p-banner-total">/${total}</span></div>`
        }
      </div>
      <div class="p-progress">
        <div class="p-progress-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="p-teams">${teamCells}</div>
    </div>`;
}

function renderOverview() {
  const winner  = getWinner();
  const banner  = winner
    ? '<div class="winner-banner">🏆 ' + winner.name + ' wins the £50 pot! 🏆</div>'
    : '';
  const cards = sortedParticipants().map(renderParticipantCard).join('');
  return banner + renderSyncBar() + renderLeaderboard() + '<div class="p-grid">' + cards + '</div>';
}

// ─── Render: Scores ───────────────────────────────────────────────────────────

function getAllMatches() {
  if (!LIVE) return [];
  const out = [];

  Object.entries(LIVE.groupMatches || {}).forEach(([letter, ms]) => {
    ms.forEach(m => out.push(Object.assign({}, m, { stage: 'group', group: letter })));
  });

  const ROUND_LABEL = { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' };
  Object.entries(LIVE.knockoutMatches || {}).forEach(([key, ms]) => {
    ms.forEach(m => out.push(Object.assign({}, m, { stage: 'knockout', round: key, roundLabel: ROUND_LABEL[key] || key })));
  });

  return out.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function localDateKey(isoStr) {
  const d = new Date(isoStr);
  // YYYY-MM-DD in local time
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

function dayLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date  = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((date - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1)  return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderMatchCard(m) {
  const homeOwner = TEAM_OWNER[m.home];
  const awayOwner = TEAM_OWNER[m.away];
  const done      = m.status === 'FINISHED';
  const live      = m.live || m.status === 'IN_PLAY' || m.status === 'PAUSED';

  const stageLabel = m.stage === 'group'
    ? `Group ${m.group}${m.matchday ? ` · MD${m.matchday}` : ''}`
    : (m.roundLabel || m.round || 'Knockout');

  const dateLabel = m.date ? (() => {
    const d = new Date(m.date);
    const base = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return done || live ? base : `${base} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  })() : '';

  let scoreHtml;
  if (done) {
    scoreHtml = `<div class="ms-score ms-score--done">${m.homeScore} – ${m.awayScore}</div>`;
  } else if (live) {
    scoreHtml = `<div class="ms-score ms-score--live">${m.homeScore} – ${m.awayScore}<div class="ms-live-pulse">LIVE <span class="live-dot">●</span></div></div>`;
  } else {
    const t = new Date(m.date);
    scoreHtml = `<div class="ms-score ms-score--upcoming">${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>`;
  }

  let footer = '';
  if (homeOwner && awayOwner) {
    if (homeOwner.id === awayOwner.id) {
      footer = `<div class="ms-footer ms-clash">⚡ ${homeOwner.name}'s teams go head to head!</div>`;
    } else {
      footer = `<div class="ms-footer ms-vs">
        <span class="ms-vs-dot" style="background:${homeOwner.color}"></span>
        ${homeOwner.name} vs ${awayOwner.name}
        <span class="ms-vs-dot" style="background:${awayOwner.color}"></span>
      </div>`;
    }
  }

  return `
    <div class="match-card ${live ? 'match-card--live' : done ? 'match-card--done' : 'match-card--upcoming'}">
      <div class="ms-meta">
        <span class="ms-stage">${stageLabel}</span>
        <div class="ms-meta-right">
          ${live ? '<span class="ms-live-badge">LIVE</span>' : ''}
          <span class="ms-date">${dateLabel}</span>
        </div>
      </div>
      <div class="ms-body">
        <div class="ms-team ms-team--home">
          ${homeOwner ? `<span class="ms-pip" style="background:${homeOwner.color}" title="${homeOwner.name}"></span>` : ''}
          <span class="ms-flag">${flag(m.home)}</span>
          <span class="ms-name">${m.home}</span>
        </div>
        <div class="ms-center">${scoreHtml}</div>
        <div class="ms-team ms-team--away">
          <span class="ms-name">${m.away}</span>
          <span class="ms-flag">${flag(m.away)}</span>
          ${awayOwner ? `<span class="ms-pip" style="background:${awayOwner.color}" title="${awayOwner.name}"></span>` : ''}
        </div>
      </div>
      ${footer}
    </div>`;
}

function renderScores() {
  if (!LIVE) {
    return renderSyncBar()
      + '<div class="scores-empty">'
      + '<p>No live data yet.</p>'
      + '<p>Run <code>node C:\\sweepstake\\fetch-data.js</code> in PowerShell to pull in results.</p>'
      + '</div>';
  }

  const all = getAllMatches();
  if (!all.length) return renderSyncBar() + '<div class="scores-empty"><p>No matches in data yet.</p></div>';

  // Group by local date
  const byDay = {};
  all.forEach(m => {
    const k = localDateKey(m.date);
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(m);
  });

  // Sort days: past + today ascending, future ascending — but live always at very top
  const liveMatches = all.filter(m => m.live || m.status === 'IN_PLAY' || m.status === 'PAUSED');
  const liveSection = liveMatches.length
    ? '<div class="scores-day scores-day--live">'
      + '<div class="scores-day-header scores-day-header--live">🔴 Live Now</div>'
      + '<div class="scores-grid">' + liveMatches.map(renderMatchCard).join('') + '</div>'
      + '</div>'
    : '';

  const daySections = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayMatches]) => {
      // Within a day: finished first (most recent score info), then upcoming by time
      const sorted = dayMatches.slice().sort((a, b) => {
        const rank = m => (m.live || m.status === 'IN_PLAY') ? 0 : m.status === 'FINISHED' ? 1 : 2;
        return rank(a) !== rank(b) ? rank(a) - rank(b) : new Date(a.date) - new Date(b.date);
      });
      return '<div class="scores-day">'
        + '<div class="scores-day-header">' + dayLabel(dateKey) + '</div>'
        + '<div class="scores-grid">' + sorted.map(renderMatchCard).join('') + '</div>'
        + '</div>';
    }).join('');

  return renderSyncBar() + liveSection + daySections;
}

// ─── Render: Groups ───────────────────────────────────────────────────────────

function renderGroupCard(letter, teams) {
  const standing = LIVE ? (LIVE.groupStandings || {})[letter] : null;
  const gMatches = LIVE ? ((LIVE.groupMatches || {})[letter] || []) : [];

  const header = '<div class="g-card-header">Group ' + letter + '</div>';

  // Always show standings table. Use live API data when available, zeros when not.
  // Points: 3 for a win, 1 for a draw, 0 for a loss.
  const rows = (standing && standing.length > 0)
    ? standing
    : teams.map(t => ({ team: t, played: 0, won: 0, drawn: 0, lost: 0, gd: 0, points: 0 }));

  const allPlayed      = standing && standing.every(r => r.played === 3);
  const liveGuaranteed = LIVE ? (LIVE.guaranteedQualified || []) : [];

  const tableRows = rows.map((row, i) => {
    const out     = isOut(row.team);
    const o       = TEAM_OWNER[row.team];
    const advance = !!(standing && i < 2 && (allPlayed || liveGuaranteed.includes(row.team)));
    const rowCls  = out ? 'g-elim' : advance ? 'g-advanced' : '';
    const gdStr   = row.gd > 0 ? '+' + row.gd : String(row.gd);
    const form    = getTeamForm(row.team, 3);
    const formHtml = form.length
      ? '<span class="g-form">' + form.map(formPill).join('') + '</span>'
      : '';

    return '<tr class="' + rowCls + '">'
      + '<td class="g-pos">' + (i + 1) + '</td>'
      + '<td class="g-cell-team">'
      +   '<span class="g-flag">' + flag(row.team) + '</span>'
      +   '<span class="g-name">' + row.team + '</span>'
      +   (o ? '<span class="g-owner-dot" style="background:' + o.color + '" title="' + o.name + '"></span>' : '')
      +   formHtml
      + '</td>'
      + '<td>' + row.played + '</td>'
      + '<td>' + row.won   + '</td>'
      + '<td>' + row.drawn + '</td>'
      + '<td>' + row.lost  + '</td>'
      + '<td>' + gdStr     + '</td>'
      + '<td class="g-pts">' + row.points + '</td>'
      + '</tr>';
  }).join('');

  const table = '<table class="g-table">'
    + '<thead><tr>'
    + '<th></th><th class="g-th-team">Team</th>'
    + '<th title="Played">P</th>'
    + '<th title="Won (3pts)">W</th>'
    + '<th title="Drawn (1pt)">D</th>'
    + '<th title="Lost (0pts)">L</th>'
    + '<th title="Goal difference">GD</th>'
    + '<th class="g-pts" title="Points">Pts</th>'
    + '</tr></thead>'
    + '<tbody>' + tableRows + '</tbody>'
    + '</table>';

  const matchRows = gMatches
    .slice()
    .sort((a, b) => (a.matchday || 0) - (b.matchday || 0))
    .map(m => {
      const done  = m.status === 'FINISHED';
      const live  = m.live;
      const score = (done || live) ? (m.homeScore + '–' + m.awayScore) : 'vs';
      return '<div class="g-match' + (live ? ' g-match--live' : done ? ' g-match--done' : '') + '">'
        + '<span class="g-match-team g-match-home">' + flag(m.home) + ' ' + m.home + '</span>'
        + '<span class="g-match-score">' + score + (live ? ' <span class="live-dot">●</span>' : '') + '</span>'
        + '<span class="g-match-team g-match-away">' + m.away + ' ' + flag(m.away) + '</span>'
        + '</div>';
    }).join('');

  const matchSection = matchRows ? '<div class="g-matches">' + matchRows + '</div>' : '';

  return '<div class="g-card">' + header + table + matchSection + '</div>';
}

function renderGroups() {
  const legend = PARTICIPANTS.map(p =>
    '<span class="legend-item"><span class="legend-dot" style="background:' + p.color + '"></span>' + p.name + '</span>'
  ).join('');

  const groupCards = Object.entries(GROUPS)
    .map(([letter, teams]) => renderGroupCard(letter, teams))
    .join('');

  return renderSyncBar()
    + '<div class="groups-legend">' + legend + '</div>'
    + '<div class="g-grid">' + groupCards + '</div>';
}

// ─── Render: Insights ─────────────────────────────────────────────────────────

function renderInsights() {
  if (!LIVE) {
    return renderSyncBar()
      + '<div class="scores-empty"><p>No live data yet.</p>'
      + '<p>Run <code>node C:\\sweepstake\\fetch-data.js</code> to sync.</p></div>';
  }

  const probs    = calcWinProbabilities();
  const paying   = PARTICIPANTS.filter(function(p) { return p.pays; });
  const statsMap = {};
  PARTICIPANTS.forEach(function(p) { statsMap[p.id] = calcParticipantStats(p); });

  // Tournament-wide totals
  let goalsTotal = 0, matchesPlayed = 0;
  Object.values(LIVE.groupMatches || {}).flat().forEach(function(m) {
    if (m.status === 'FINISHED') { goalsTotal += m.homeScore + m.awayScore; matchesPlayed++; }
  });
  Object.values(LIVE.knockoutMatches || {}).flat().forEach(function(m) {
    if (m.status === 'FINISHED') { goalsTotal += (m.homeScore || 0) + (m.awayScore || 0); matchesPlayed++; }
  });
  const teamsAlive    = ALL_TEAMS.filter(function(t) { return !state.eliminated.has(t); }).length;
  const groupsDecided = Object.values(LIVE.groupStandings || {}).filter(function(s) {
    return s.length && s.every(function(r) { return r.played === 3; });
  }).length;

  // ── Headline stat cards ────────────────────────────────────────────────────
  const statCards = '<div class="insight-stat-grid">'
    + '<div class="insight-stat-card">'
    +   '<div class="isc-value">' + goalsTotal + '</div>'
    +   '<div class="isc-label">Total Goals</div>'
    +   '<div class="isc-sub">' + (matchesPlayed > 0 ? (goalsTotal / matchesPlayed).toFixed(2) : '—') + ' per game</div>'
    + '</div>'
    + '<div class="insight-stat-card">'
    +   '<div class="isc-value">' + matchesPlayed + '</div>'
    +   '<div class="isc-label">Games Played</div>'
    +   '<div class="isc-sub">of 104 total</div>'
    + '</div>'
    + '<div class="insight-stat-card">'
    +   '<div class="isc-value">' + teamsAlive + '</div>'
    +   '<div class="isc-label">Teams Alive</div>'
    +   '<div class="isc-sub">of ' + ALL_TEAMS.length + '</div>'
    + '</div>'
    + '<div class="insight-stat-card">'
    +   '<div class="isc-value">' + groupsDecided + '</div>'
    +   '<div class="isc-label">Groups Done</div>'
    +   '<div class="isc-sub">of 12</div>'
    + '</div>'
    + '</div>';

  // ── Win probability chart ──────────────────────────────────────────────────
  const probItems = paying.slice().sort(function(a, b) { return (probs[b.id] || 0) - (probs[a.id] || 0); });
  const probChart = renderHBarChart(
    probItems,
    function(p) { return Math.round((probs[p.id] || 0) * 100); },
    function(p) { return p.name; },
    function(p) { return p.color; },
    { format: function(v) { return v + '%'; }, height: 32, gap: 10, chartW: 440, labelW: 72 }
  );

  // ── Goals scored chart (conceded shown as ghost bar) ──────────────────────
  const goalItems = PARTICIPANTS.slice().sort(function(a, b) { return statsMap[b.id].gf - statsMap[a.id].gf; });
  const goalsChart = renderHBarChart(
    goalItems,
    function(p) { return statsMap[p.id].gf; },
    function(p) { return p.name; },
    function(p) { return p.color; },
    { secondary: function(p) { return statsMap[p.id].ga; }, height: 32, gap: 10, chartW: 440, labelW: 72 }
  );

  // ── Performance table ──────────────────────────────────────────────────────
  const perfRows = PARTICIPANTS.slice()
    .sort(function(a, b) {
      const sa = statsMap[a.id], sb = statsMap[b.id];
      return sb.w !== sa.w ? sb.w - sa.w : sb.gf - sa.gf;
    })
    .map(function(p) {
      const s   = statsMap[p.id];
      const gdStr = s.gd >= 0 ? '+' + s.gd : String(s.gd);
      return '<tr>'
        + '<td><span class="perf-dot" style="background:' + p.color + '"></span>'
        +      '<span class="perf-name">' + p.name + '</span>'
        +      (!p.pays ? ' <span class="lb-nostake">no stake</span>' : '') + '</td>'
        + '<td>' + s.played + '</td>'
        + '<td class="perf-w">' + s.w + '</td>'
        + '<td class="perf-d">' + s.d + '</td>'
        + '<td class="perf-l">' + s.l + '</td>'
        + '<td>' + s.gf + '</td>'
        + '<td>' + s.ga + '</td>'
        + '<td class="' + (s.gd >= 0 ? 'perf-pos' : 'perf-neg') + '">' + gdStr + '</td>'
        + '<td>' + s.cs + '</td>'
        + '</tr>';
    }).join('');

  const perfTable = '<div class="perf-table-wrap"><table class="perf-table">'
    + '<thead><tr>'
    + '<th style="text-align:left">Participant</th>'
    + '<th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th>'
    + '<th title="Goals For">GF</th><th title="Goals Against">GA</th>'
    + '<th title="Goal Difference">GD</th><th title="Clean Sheets">CS</th>'
    + '</tr></thead>'
    + '<tbody>' + perfRows + '</tbody>'
    + '</table></div>';

  // ── Top scoring teams chart ────────────────────────────────────────────────
  const teamGoals = ALL_TEAMS.map(function(t) {
    const gf  = getTeamMatchHistory(t).reduce(function(s, m) { return s + m.gf; }, 0);
    const o   = TEAM_OWNER[t];
    return { team: t, gf: gf, color: o ? o.color : '#94a3b8' };
  }).filter(function(t) { return t.gf > 0; })
    .sort(function(a, b) { return b.gf - a.gf; })
    .slice(0, 12);

  const topTeamsChart = renderHBarChart(
    teamGoals,
    function(t) { return t.gf; },
    function(t) { return flag(t.team) + ' ' + (t.team.length > 15 ? t.team.slice(0, 13) + '…' : t.team); },
    function(t) { return t.color; },
    { height: 26, gap: 7, chartW: 440, labelW: 140 }
  );

  // ── Clean sheets chart ─────────────────────────────────────────────────────
  const csItems = PARTICIPANTS.slice().sort(function(a, b) { return statsMap[b.id].cs - statsMap[a.id].cs; });
  const csChart = renderHBarChart(
    csItems,
    function(p) { return statsMap[p.id].cs; },
    function(p) { return p.name; },
    function(p) { return p.color; },
    { height: 32, gap: 10, chartW: 440, labelW: 72 }
  );

  // ── Form guide per participant ─────────────────────────────────────────────
  const liveGuaranteed2 = LIVE.guaranteedQualified || [];
  const formGuide = PARTICIPANTS.map(function(p) {
    const teamRows = p.teams.map(function(t) {
      const form      = getTeamForm(t, 3);
      const out       = isOut(t);
      const through   = liveGuaranteed2.includes(t);
      const risk      = isAtRisk(t);
      const cls       = out ? 'fg-team--out' : through ? 'fg-team--through' : risk ? 'fg-team--risk' : '';
      const pills     = form.map(formPill).join('');
      const noGames   = !form.length ? '<span class="fg-nogames">No games</span>' : '';
      return '<div class="fg-team ' + cls + '">'
        + '<span class="fg-flag">' + flag(t) + '</span>'
        + '<span class="fg-name">' + t + '</span>'
        + '<span class="fg-form">' + pills + noGames + '</span>'
        + '</div>';
    }).join('');
    return '<div class="fg-person">'
      + '<div class="fg-header" style="border-left:3px solid ' + p.color + '">'
      +   '<span class="fg-avatar" style="background:' + p.color + '">' + p.name[0] + '</span>'
      +   '<span class="fg-pname">' + p.name + '</span>'
      + '</div>'
      + '<div class="fg-teams">' + teamRows + '</div>'
      + '</div>';
  }).join('');

  // ── Assemble dashboard ─────────────────────────────────────────────────────
  return renderSyncBar()
    + '<div class="insights-dashboard">'
    + statCards
    + '<div class="insight-row">'
    +   '<div class="insight-card">'
    +     '<div class="insight-card-title">🏆 Win Probability</div>'
    +     '<div class="insight-card-sub">Estimated chance of winning the £50 pot based on group stage survival odds</div>'
    +     probChart
    +   '</div>'
    +   '<div class="insight-card">'
    +     '<div class="insight-card-title">⚽ Goals Scored vs Conceded</div>'
    +     '<div class="insight-card-sub">Solid bar = scored · faded bar = conceded · sorted by goals scored</div>'
    +     goalsChart
    +   '</div>'
    + '</div>'
    + '<div class="insight-card">'
    +   '<div class="insight-card-title">📊 Participant Performance</div>'
    +   '<div class="insight-card-sub">Aggregated across all teams · CS = clean sheets</div>'
    +   perfTable
    + '</div>'
    + '<div class="insight-row">'
    +   '<div class="insight-card">'
    +     '<div class="insight-card-title">🌟 Top Scoring Teams</div>'
    +     '<div class="insight-card-sub">Colour indicates owner · top 12 by goals scored</div>'
    +     topTeamsChart
    +   '</div>'
    +   '<div class="insight-card">'
    +     '<div class="insight-card-title">🧤 Clean Sheets</div>'
    +     '<div class="insight-card-sub">Total shutouts across each participant\'s teams</div>'
    +     csChart
    +   '</div>'
    + '</div>'
    + '<div class="insight-card">'
    +   '<div class="insight-card-title">📈 Team Form Guide</div>'
    +   '<div class="insight-card-sub">Last 3 results · <span class="form-pill form-pill--w">W</span> win · <span class="form-pill form-pill--d">D</span> draw · <span class="form-pill form-pill--l">L</span> loss · green = qualified · amber = at risk · grey = out</div>'
    +   '<div class="fg-grid">' + formGuide + '</div>'
    + '</div>'
    + '</div>';
}

// ─── Render: Bracket ──────────────────────────────────────────────────────────

function renderTeamSlot(team, isWinner, isLoser, round, matchIdx, slot) {
  if (state.adminOpen) {
    const opts = ['<option value="">— TBD —</option>']
      .concat(ALL_TEAMS.map(t =>
        '<option value="' + t + '"' + (team === t ? ' selected' : '') + '>' + FLAGS[t] + ' ' + t + '</option>'
      )).join('');
    return '<div class="b-team"><select class="bracket-select" data-round="' + round
      + '" data-match="' + matchIdx + '" data-slot="' + slot + '">' + opts + '</select></div>';
  }

  if (!team) return '<div class="b-team b-team--tbd">TBD</div>';

  const o   = TEAM_OWNER[team];
  const cls = isWinner ? 'b-team--winner' : isLoser ? 'b-team--loser' : '';
  const border = o && !isLoser ? 'border-left:3px solid ' + o.color + ';' : '';

  return '<div class="b-team ' + cls + '" style="' + border + '">'
    + '<span class="b-flag">' + flag(team) + '</span>'
    + '<span class="b-name">' + team + '</span>'
    + (isWinner ? '<span class="b-check" title="Advanced">✓</span>' : '')
    + (o ? '<span class="b-owner-pip" style="background:' + o.color + '" title="' + o.name + '"></span>' : '')
    + '</div>';
}

function renderBracketMatch(m, round, idx) {
  const { teamA, teamB, winner } = m;
  const wA = !!(winner && winner === teamA);
  const wB = !!(winner && winner === teamB);
  const lA = !!(winner && winner !== teamA && teamA !== '');
  const lB = !!(winner && winner !== teamB && teamB !== '');

  let winnerRow = '';
  if (state.adminOpen) {
    const opts = ['<option value="">— no result yet —</option>']
      .concat(teamA ? ['<option value="' + teamA + '"' + (winner === teamA ? ' selected' : '') + '>' + flag(teamA) + ' ' + teamA + ' wins</option>'] : [])
      .concat(teamB ? ['<option value="' + teamB + '"' + (winner === teamB ? ' selected' : '') + '>' + flag(teamB) + ' ' + teamB + ' wins</option>'] : [])
      .join('');
    winnerRow = '<div class="b-winner-row"><select class="bracket-select" data-round="' + round
      + '" data-match="' + idx + '" data-slot="winner">' + opts + '</select></div>';
  }
  // In read mode the advancing team is shown via the ✓ + winner styling on its
  // own row, so no separate winner row is rendered — this keeps every match box
  // the same height, which is what lets the bracket tree line up cleanly.

  return '<div class="b-match">'
    + renderTeamSlot(teamA, wA, lA, round, idx, 'teamA')
    + renderTeamSlot(teamB, wB, lB, round, idx, 'teamB')
    + winnerRow
    + '</div>';
}

function renderBracket() {
  const ROUNDS = [
    {key:'r32',   label:'Round of 32'},
    {key:'r16',   label:'Round of 16'},
    {key:'qf',    label:'Quarter-finals'},
    {key:'sf',    label:'Semi-finals'},
    {key:'final', label:'Final'}
  ];

  const cols = ROUNDS.map(r => {
    const matches = state.bracket[r.key].map((m, i) => renderBracketMatch(m, r.key, i)).join('');
    return '<div class="b-round">'
      + '<div class="b-round-label">' + r.label + '</div>'
      + '<div class="b-round-matches">' + matches + '</div>'
      + '</div>';
  }).join('');

  const note = state.adminOpen
    ? '<p class="bracket-admin-note">⚙ Admin mode — select teams and mark winners in the bracket below.</p>'
    : '';

  const r32Empty = LIVE && (LIVE.knockoutMatches.r32 || []).length === 0;
  const r32Note  = (r32Empty && !state.adminOpen)
    ? '<p class="bracket-stage-note">⏳ Round of 32 slots not yet assigned by FIFA — the bracket will auto-fill once all group games complete. Teams guaranteed to advance are highlighted in the Groups tab.</p>'
    : '';

  return renderSyncBar()
    + note
    + r32Note
    + '<div class="bracket-wrap"><div class="bracket">' + cols + '</div></div>';
}

// ─── Render: Admin Panel ──────────────────────────────────────────────────────

function renderAdminPanel() {
  const sections = Object.entries(GROUPS).map(([letter, teams]) => {
    const rows = teams.map(t => {
      const o       = TEAM_OWNER[t];
      const out     = isOut(t);
      const fromApi = isLiveOut(t);
      return '<label class="admin-team-row">'
        + '<input type="checkbox" class="elim-checkbox" data-team="' + t + '"'
        + (out ? ' checked' : '') + (fromApi ? ' data-api="1"' : '') + ' />'
        + '<span class="admin-flag">' + flag(t) + '</span>'
        + '<span class="admin-team-name">' + t + '</span>'
        + (fromApi ? '<span class="admin-api-badge">API</span>' : '')
        + '<span class="admin-owner-dot" style="background:' + (o ? o.color : '#444') + '" title="' + (o ? o.name : '') + '"></span>'
        + '</label>';
    }).join('');
    return '<div class="admin-group"><div class="admin-group-label">Group ' + letter + '</div>' + rows + '</div>';
  }).join('');

  const syncNote = LIVE
    ? '<p class="admin-sync-note">🟢 Live data loaded · API badge = auto-eliminated</p>'
    : '<p class="admin-sync-note">⚪ No live data · <code>node fetch-data.js</code> to sync</p>';

  return syncNote
    + sections
    + '<div class="admin-reset-wrap">'
    + '<button class="admin-reset-btn" id="adminResetBtn">Reset all manual data</button>'
    + '</div>';
}

// ─── Bracket Connectors ───────────────────────────────────────────────────────

function drawBracketConnectors() {
  const bracket = document.querySelector('.bracket');
  if (!bracket) return;
  bracket.querySelectorAll('.bracket-svg').forEach(s => s.remove());

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('bracket-svg');

  const rounds = Array.from(bracket.querySelectorAll('.b-round'));
  const bRect  = bracket.getBoundingClientRect();

  for (let r = 0; r < rounds.length - 1; r++) {
    const curMatches  = Array.from(rounds[r].querySelectorAll('.b-match'));
    const nextMatches = Array.from(rounds[r + 1].querySelectorAll('.b-match'));

    nextMatches.forEach((nMatch, i) => {
      const mA = curMatches[i * 2];
      const mB = curMatches[i * 2 + 1];
      if (!mA || !nMatch) return;

      const aR = mA.getBoundingClientRect();
      const nR = nMatch.getBoundingClientRect();
      const x1 = aR.right  - bRect.left;
      const y1 = (aR.top + aR.bottom) / 2 - bRect.top;
      const x3 = nR.left   - bRect.left;
      const y3 = (nR.top + nR.bottom) / 2 - bRect.top;
      const midX = x1 + (x3 - x1) * 0.5;

      let d = `M ${x1} ${y1} H ${midX} V ${y3} H ${x3}`;

      if (mB) {
        const bR2 = mB.getBoundingClientRect();
        const x2  = bR2.right - bRect.left;
        const y2  = (bR2.top + bR2.bottom) / 2 - bRect.top;
        d += ` M ${x2} ${y2} H ${midX}`;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgba(0,0,0,0.12)');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
      svg.appendChild(path);
    });
  }

  bracket.appendChild(svg);
}

// ─── Main Render ──────────────────────────────────────────────────────────────

function renderMain() {
  const root = document.getElementById('app-root');
  if      (state.view === 'overview') root.innerHTML = renderOverview();
  else if (state.view === 'scores')   root.innerHTML = renderScores();
  else if (state.view === 'groups')   root.innerHTML = renderGroups();
  else if (state.view === 'insights') root.innerHTML = renderInsights();
  else if (state.view === 'bracket') {
    root.innerHTML = renderBracket();
    requestAnimationFrame(drawBracketConnectors);
  }
}

function renderAdmin() {
  const body      = document.getElementById('adminPanelBody');
  const scrollTop = body.scrollTop;
  body.innerHTML  = renderAdminPanel();
  body.scrollTop  = scrollTop;
}

function renderShell() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
  const panel    = document.getElementById('adminPanel');
  const backdrop = document.getElementById('adminBackdrop');
  const adminBtn = document.getElementById('adminToggleBtn');
  panel.classList.toggle('open', state.adminOpen);
  backdrop.classList.toggle('hidden', !state.adminOpen);
  panel.setAttribute('aria-hidden', String(!state.adminOpen));
  adminBtn.classList.toggle('active', state.adminOpen);
}

function render() {
  renderShell();
  renderMain();
  renderAdmin();
}

// ─── Events ───────────────────────────────────────────────────────────────────

function initListeners() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderShell();
      renderMain();
    });
  });

  document.getElementById('adminToggleBtn').addEventListener('click', () => {
    state.adminOpen = !state.adminOpen;
    renderShell();
    renderAdmin();
  });

  document.getElementById('adminCloseBtn').addEventListener('click', () => {
    state.adminOpen = false;
    renderShell();
  });

  document.getElementById('adminBackdrop').addEventListener('click', () => {
    state.adminOpen = false;
    renderShell();
  });

  // Admin: team elimination toggles
  document.getElementById('adminPanelBody').addEventListener('change', e => {
    if (!e.target.classList.contains('elim-checkbox')) return;
    const team = e.target.dataset.team;
    if (e.target.checked) state.eliminated.add(team);
    else state.eliminated.delete(team);
    saveState();
    renderMain();
  });

  // Admin: reset button
  document.getElementById('adminPanelBody').addEventListener('click', e => {
    if (!e.target.closest('#adminResetBtn')) return;
    if (!confirm('Reset all manually set data? (Live API data will still apply on next render.)')) return;
    state.eliminated = new Set();
    state.bracket    = makeBracket();
    // Re-apply live data
    if (LIVE) {
      (LIVE.eliminated || []).forEach(t => state.eliminated.add(t));
      Object.keys(state.bracket).forEach(round => {
        const liveMsArr = (LIVE.knockoutMatches || {})[round] || [];
        liveMsArr.forEach((lm, i) => {
          const slot = state.bracket[round][i];
          if (!slot) return;
          slot.teamA  = lm.home;
          slot.teamB  = lm.away;
          slot.winner = lm.winner || '';
        });
      });
    }
    saveState();
    renderMain();
    renderAdmin();
  });

  // Bracket: slot selects
  document.getElementById('app-root').addEventListener('change', e => {
    if (!e.target.classList.contains('bracket-select')) return;
    const { round, match, slot } = e.target.dataset;
    const m = state.bracket[round][parseInt(match, 10)];
    m[slot] = e.target.value;
    if (slot === 'winner' && e.target.value) {
      const loser = e.target.value === m.teamA ? m.teamB : m.teamA;
      if (loser) state.eliminated.add(loser);
    }
    saveState();
    renderMain();
    renderAdmin();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initListeners();
  render();

  // Auto-refresh page every 5 minutes, but only when admin panel is closed
  setInterval(() => {
    if (!state.adminOpen) location.reload();
  }, 5 * 60 * 1000);
});
