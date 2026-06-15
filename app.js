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
  const rows = sorted.map((p, i) => {
    const left = teamsLeft(p);
    const total = p.teams.length;
    const out  = left === 0;
    const pct  = total ? (left / total * 100) : 0;
    const rankCls = i === 0 ? 'lb-pos--1' : i === 1 ? 'lb-pos--2' : i === 2 ? 'lb-pos--3' : '';
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
            : `<span class="lb-num" style="color:${p.color}">${left}</span><span class="lb-denom">/${total}</span>`
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

  const teamCells = p.teams.map(t => {
    const eliminated = isOut(t);
    const grp = TEAM_GROUP[t];
    return `
      <div class="team-cell ${eliminated ? 'team-cell--out' : 'team-cell--active'}">
        <span class="team-flag">${flag(t)}</span>
        <span class="team-cell-name">${t}</span>
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

  const allPlayed = standing && standing.every(r => r.played === 3);

  const tableRows = rows.map((row, i) => {
    const out     = isOut(row.team);
    const o       = TEAM_OWNER[row.team];
    const advance = !!(standing && i < 2 && allPlayed);
    const rowCls  = out ? 'g-elim' : advance ? 'g-advanced' : '';
    const gdStr   = row.gd > 0 ? '+' + row.gd : String(row.gd);

    return '<tr class="' + rowCls + '">'
      + '<td class="g-pos">' + (i + 1) + '</td>'
      + '<td class="g-cell-team">'
      +   '<span class="g-flag">' + flag(row.team) + '</span>'
      +   '<span class="g-name">' + row.team + '</span>'
      +   (o ? '<span class="g-owner-dot" style="background:' + o.color + '" title="' + o.name + '"></span>' : '')
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
  } else if (winner) {
    const o = TEAM_OWNER[winner];
    winnerRow = '<div class="b-winner-row" style="color:' + (o ? o.color : 'var(--gold)') + '">'
      + '✓ ' + flag(winner) + ' ' + winner + '</div>';
  }

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

  return renderSyncBar()
    + note
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
