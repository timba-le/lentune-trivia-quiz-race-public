/* ==========================================================================
   Trivia Quiz Weekly Race — frontend
   ========================================================================== */

(() => {
  const CFG = window.QUIZ_CONFIG;
  const SCORING = window.QuizScoring;
  const TEAMS_MOD = window.QuizTeams;
  const SHOTS = window.QuizShotValidator;
  const HOLIDAYS = window.QUIZ_HOLIDAYS;
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  const state = {
    submissions: [],
    window: null,
    selectedWeek: null,
    selectedMonth: null,
    roster: null,
    monthRosters: Object.create(null),
    quizTeamsActive: false,
    namingOpen: false
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------------------------------------------------------------- helpers

  const { nameKey, weekKeyFor, dayIndex, monthKeyFor, round1 } = SCORING;

  function nzNow() {
    const fmt = new Intl.DateTimeFormat('en-NZ', {
      timeZone: CFG.TIMEZONE,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const p = {};
    for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const parts = {
      dateKey: `${p.year}-${p.month}-${p.day}`,
      dow: map[p.weekday],
      hour: Number(p.hour),
      minute: Number(p.minute)
    };
    const fake = CFG.DEV_DATE_KEY;
    if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) {
      const [y, m, d] = fake.split('-').map(Number);
      parts.dateKey = fake;
      parts.dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    }
    return parts;
  }

  function prettyDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', {
      timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function prettyMonth(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NZ', {
      timeZone: 'UTC', month: 'long', year: 'numeric'
    });
  }

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // -------------------------------------------------------- opening window

  function localWindowState() {
    const { dow, hour, minute, dateKey } = nzNow();
    const holiday = HOLIDAYS && HOLIDAYS.holidayOn(dateKey);
    if (holiday) return { open: false, reason: 'holiday', dateKey, holiday };
    const win = CFG.HOURS[dow];
    if (!win) return { open: false, reason: 'weekend', dateKey };
    const mins = hour * 60 + minute;
    if (mins < win.open * 60) return { open: false, reason: 'early', dateKey, win };
    if (mins >= win.close * 60) return { open: false, reason: 'late', dateKey, win };
    return { open: true, dateKey, win };
  }

  const hh = (h) => {
    const suffix = h >= 12 ? 'pm' : 'am';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}${suffix}`;
  };

  function prettyHolidayDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', {
      timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function renderHolidayNotes() {
    const banner = $('#holidayBanner');
    const list = $('#holidayList');
    if (!HOLIDAYS || !banner || !list) return;

    const today = (state.window && state.window.dateKey) || nzNow().dateKey;
    const todayName = (state.window && state.window.holiday) || HOLIDAYS.holidayOn(today);

    if (todayName) {
      banner.hidden = false;
      banner.innerHTML =
        `<strong>Public holiday today — ${escapeHtml(todayName)}.</strong> ` +
        `The form is closed. Treat it as a freebie day; no score needed.`;
    } else {
      banner.hidden = true;
      banner.innerHTML = '';
    }

    const upcoming = HOLIDAYS.upcomingHolidays(today, 6);
    if (!upcoming.length) {
      list.innerHTML = '<tr><td colspan="2" class="muted">No upcoming public holidays on the calendar yet.</td></tr>';
      return;
    }
    list.innerHTML = upcoming
      .map(({ date, name }) => {
        const isToday = date === today;
        return `<tr class="${isToday ? 'hours-row--today' : ''}">
          <td>${escapeHtml(name)}${isToday ? ' <span class="muted">(today)</span>' : ''}</td>
          <td><strong>${escapeHtml(prettyHolidayDate(date))}</strong></td>
        </tr>`;
      })
      .join('');
  }

  function renderWindow() {
    const w = state.window || localWindowState();
    const pill = $('#statusPill');
    const text = $('#statusText');
    const detail = $('#statusDetail');
    const btn = $('#submitBtn');

    pill.classList.remove('status-pill--loading', 'status-pill--open', 'status-pill--closed');

    if (w.open) {
      pill.classList.add('status-pill--open');
      text.textContent = 'Submissions are OPEN';
      detail.textContent = `Closes at ${hh(w.win.close)} NZ time today. Get your screenshot in.`;
      btn.disabled = false;
      btn.textContent = 'Log my score 🏁';
    } else {
      pill.classList.add('status-pill--closed');
      text.textContent = 'Submissions are CLOSED';
      detail.textContent =
        w.reason === 'holiday'
          ? `Public holiday — ${w.holiday}. The form is closed; treat today as a freebie.`
          : w.reason === 'weekend'
            ? "It's the weekend — the race runs Monday to Friday. Go touch some grass."
            : w.reason === 'early'
              ? `Very keen. The form opens at ${hh(w.win.open)} NZ time.`
              : `Today's window shut at ${hh(w.win.close)} NZ time. Back tomorrow at ${hh(8)}.`;
      btn.disabled = true;
      btn.textContent = 'Form closed 🔒';
    }

    renderHolidayNotes();
  }

  // ---------------------------------------------------------------- scoring

  function todayKey() {
    return (state.window && state.window.dateKey) || nzNow().dateKey;
  }

  function quizMode() {
    if (TEAMS_MOD) return TEAMS_MOD.quizTeamsActive(todayKey());
    return todayKey() >= (CFG.QUIZ_TEAMS_START || '2026-09-01');
  }

  function rosterFor(monthKey) {
    if (!monthKey) return null;
    if (state.monthRosters[monthKey]) return state.monthRosters[monthKey];
    if (state.roster && state.roster.monthKey === monthKey) return state.roster;
    return null;
  }

  const scoringOpts = () => ({
    bestNDays: CFG.BEST_N_DAYS,
    teams: CFG.TEAMS,
    quizTeamsStart: CFG.QUIZ_TEAMS_START || '2026-09-01',
    roster: TEAMS_MOD && TEAMS_MOD.quizMonth(state.selectedMonth) ? rosterFor(state.selectedMonth) : null
  });

  function teamLabelFor(row) {
    if (row.teamId && TEAMS_MOD) {
      const played = (row.days || []).find((d) => d && d.dateKey);
      const mk = played ? monthKeyFor(played.dateKey) : monthKeyFor(todayKey());
      const roster = rosterFor(mk) || state.roster;
      const team = roster && roster.teams && roster.teams.find((t) => t.id === row.teamId);
      if (team) return TEAMS_MOD.displayName(team);
    }
    return row.team || '';
  }

  const weeklyRows = (weekKey) => SCORING.weeklyRows(state.submissions, weekKey, scoringOpts());

  const teamRows = (monthKey) => SCORING.teamRows(state.submissions, monthKey, scoringOpts());

  /** Reveal day only, before the Social reveal time — scores stay under wraps. */
  function scoresVeiled() {
    if (!HOLIDAYS || !HOLIDAYS.revealDateKey) return false;
    const now = nzNow();
    if (now.dateKey !== HOLIDAYS.revealDateKey(now.dateKey)) return false;
    const reveal = CFG.FRIDAY_REVEAL || { hour: 15, minute: 25 };
    return now.hour * 60 + now.minute < reveal.hour * 60 + reveal.minute;
  }

  function prettyRevealTime() {
    const reveal = CFG.FRIDAY_REVEAL || { hour: 15, minute: 25 };
    const h = reveal.hour % 12 === 0 ? 12 : reveal.hour % 12;
    const suffix = reveal.hour >= 12 ? 'pm' : 'am';
    const m = String(reveal.minute).padStart(2, '0');
    return `${h}:${m}${suffix}`;
  }

  function prettyRevealDay() {
    const now = nzNow();
    const revealDay = HOLIDAYS && HOLIDAYS.revealDateKey
      ? HOLIDAYS.revealDateKey(now.dateKey)
      : now.dateKey;
    const friday = HOLIDAYS && HOLIDAYS.weekMonday
      ? HOLIDAYS.addDays(HOLIDAYS.weekMonday(now.dateKey), 4)
      : null;
    const shortWeek = friday && revealDay !== friday;
    const [y, m, d] = revealDay.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-NZ', {
      timeZone: 'UTC', weekday: 'long'
    });
    return { weekday, shortWeek, holiday: friday ? HOLIDAYS.holidayOn(friday) : null };
  }

  function veilScore(value) {
    return `<span class="score-veil" aria-hidden="true">${value}</span><span class="sr-only">Hidden until ${escapeHtml(prettyRevealTime())}</span>`;
  }

  // ------------------------------------------------------------- rendering

  function availableWeeks() {
    const weeks = new Set(state.submissions.map((s) => s.weekKey));
    weeks.add(weekKeyFor(nzNow().dateKey));
    return Array.from(weeks).sort().reverse();
  }

  function availableMonths() {
    const months = new Set(state.submissions.map((s) => monthKeyFor(s.dateKey)));
    months.add(monthKeyFor(nzNow().dateKey));
    return Array.from(months).sort().reverse();
  }

  function renderWeekSelect() {
    const sel = $('#weekSelect');
    const weeks = availableWeeks();
    if (!state.selectedWeek || !weeks.includes(state.selectedWeek)) state.selectedWeek = weeks[0];
    const thisWeek = weekKeyFor(nzNow().dateKey);
    sel.innerHTML = weeks
      .map((w) => `<option value="${w}"${w === state.selectedWeek ? ' selected' : ''}>${prettyDate(w)}${w === thisWeek ? ' — this week' : ''}</option>`)
      .join('');
  }

  function renderMonthSelect() {
    const sel = $('#monthSelect');
    const months = availableMonths();
    if (!state.selectedMonth || !months.includes(state.selectedMonth)) {
      const current = monthKeyFor(todayKey());
      state.selectedMonth = months.includes(current) ? current : months[0];
    }
    const current = monthKeyFor(todayKey());
    const archived = quizMode();
    sel.innerHTML = months
      .map((m) => {
        const ref = archived && TEAMS_MOD && TEAMS_MOD.isArchiveMonth(m, todayKey());
        const tag = ref ? ' — reference only' : m === current ? ' — this month' : '';
        return `<option value="${m}"${m === state.selectedMonth ? ' selected' : ''}>${prettyMonth(m)}${tag}</option>`;
      })
      .join('');
  }

  function renderLeaderboard() {
    const rows = weeklyRows(state.selectedWeek);
    const podium = $('#podium');
    const body = $('#boardBody');
    const note = $('#boardNote');
    const veiled = scoresVeiled();
    const show = (n) => (veiled ? veilScore(n) : String(n));

    $('#panel-leaderboard')?.classList.toggle('board-veiled', veiled);

    if (!rows.length) {
      podium.innerHTML = '';
      body.innerHTML = `<tr><td colspan="10">
        <div class="empty-state">
          <span class="emoji">🏁</span>
          <strong>No scores logged for this week yet.</strong><br>
          Be the first on the board — the view from the front is lovely.
        </div></td></tr>`;
      note.textContent = '';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const prizes = ['Beer or lollies 🍺', 'Chocolate bar 🍫', 'Bragging rights'];
    podium.innerHTML = rows.slice(0, 3).map((r, i) => `
      <div class="podium-card podium-card--${i + 1}">
        <div class="podium-medal">${medals[i]}</div>
        <div class="podium-name">${escapeHtml(r.name)}</div>
        <div class="podium-team">${escapeHtml(teamLabelFor(r))}</div>
        <div class="podium-score">${show(r.total)}</div>
        <div class="podium-prize">${prizes[i]}</div>
      </div>`).join('');

    body.innerHTML = rows.map((r, i) => {
      const rankClass = i < 3 ? ` rank-badge--${i + 1}` : '';
      const dayCells = r.days.map((d, di) => {
        if (!d) return '<td class="num day-empty">–</td>';
        const dropped = r.droppedIdx ? r.droppedIdx.has(di) : !r.countedIdx.has(di);
        const cls = dropped ? 'day-dropped' : '';
        const title = veiled
          ? (d.hasScreenshot ? `Screenshot — ${prettyDate(d.dateKey)}` : prettyDate(d.dateKey))
          : dropped
            ? `Dropped freebie — ${prettyDate(d.dateKey)} (${d.score}) does not count toward the weekly total`
            : d.hasScreenshot
              ? `View screenshot — ${prettyDate(d.dateKey)}`
              : prettyDate(d.dateKey);
        const label = d.hasScreenshot
          ? `<button type="button" data-shot="${d.id}" title="${escapeHtml(title)}" class="${cls}"${dropped ? ' aria-disabled="true"' : ''}>${show(d.score)}</button>`
          : `<span class="${cls}" title="${escapeHtml(title)}">${show(d.score)}</span>`;
        return `<td class="num day-cell${dropped ? ' day-cell--dropped' : ''}">${label}</td>`;
      }).join('');

      const droppedTitle = veiled
        ? 'Lowest day — hidden until the Friday reveal'
        : 'Lowest day — auto-excluded from the weekly total';

      return `<tr>
        <td><span class="rank-badge${rankClass}">${i + 1}</span></td>
        <td class="racer-name">${escapeHtml(r.name)}</td>
        <td><span class="team-chip">${escapeHtml(teamLabelFor(r))}</span></td>
        ${dayCells}
        <td class="num day-dropped" title="${escapeHtml(droppedTitle)}">${r.droppedScore == null ? '–' : show(r.droppedScore)}</td>
        <td class="num total">${show(r.total)}</td>
      </tr>`;
    }).join('');

    if (veiled) {
      const day = prettyRevealDay();
      note.textContent = day.shortWeek
        ? `Short week (${day.holiday} Friday) — scores are blurred until ${prettyRevealTime()} NZ time today. Names and places stay up; the numbers drop at the reveal.`
        : `Friday drama mode: scores are blurred until ${prettyRevealTime()} NZ time. Names and places stay up — the numbers drop at the reveal.`;
      return;
    }

    const tiedTop = rows.filter((r) => r.total === rows[0].total).length > 1;
    note.textContent = tiedTop
      ? `Same total at the top — first to submit keeps the higher spot. Best ${CFG.BEST_N_DAYS} of 5 days count; your lowest day is struck through and left out of the total.`
      : `Best ${CFG.BEST_N_DAYS} of 5 days count toward the total. Your lowest day is struck through automatically once all five are in. Equal totals? Whoever submitted first stays above. Tap a scored day to see the screenshot.`;
  }

  function renderTeams() {
    const rows = teamRows(state.selectedMonth);
    const grid = $('#teamGrid');
    const panel = $('#panel-teams');
    const archive = $('#archiveBanner');
    const isArchive = TEAMS_MOD && TEAMS_MOD.isArchiveMonth(state.selectedMonth, todayKey());
    panel?.classList.toggle('panel-teams--archive', Boolean(isArchive));
    if (archive) archive.hidden = !isArchive;

    const trophyLegacy = $('#trophyCardLegacy');
    const trophyQuiz = $('#trophyCardQuiz');
    if (trophyLegacy && trophyQuiz) {
      const quizOn = quizMode();
      trophyLegacy.hidden = quizOn;
      trophyQuiz.hidden = !quizOn;
    }

    const lede = $('#panel-teams .panel-lede');
    if (lede) {
      lede.textContent = quizMode()
        ? 'Sum of every daily score this month — no weekly freebie. Quiz teams, redrawn on the 1st.'
        : 'Sum of every daily score this month — no weekly freebie. More players showing up means more points.';
    }

    const active = rows.filter((r) => r.entries > 0);

    if (!active.length) {
      grid.innerHTML = `<div class="empty-state">
        <span class="emoji">🏆</span>
        <strong>No team scores for ${prettyMonth(state.selectedMonth)} yet.</strong><br>
        The trophy shelf is looking suspiciously empty.
      </div>`;
      return;
    }

    const best = active[0].total || 1;
    grid.innerHTML = rows.map((r, i) => {
      const lead = !isArchive && i === 0 && r.entries > 0;
      const width = r.total > 0 ? Math.max(4, (r.total / best) * 100) : 0;
      const meta = r.entries
        ? `${r.players} player${r.players === 1 ? '' : 's'} · ${r.entries} daily score${r.entries === 1 ? '' : 's'} this month`
        : 'No scores logged yet';
      const members = r.members && r.members.length
        ? `<div class="team-members">${escapeHtml(r.members.join(', '))}</div>`
        : '';
      return `<div class="team-row${lead ? ' team-row--lead' : ''}">
        <div class="team-rank">${lead ? '🏆' : i + 1}</div>
        <div>
          <div class="team-name">${escapeHtml(r.team)}</div>
          ${members}
          <div class="team-meta">${meta}</div>
          <div class="team-bar"><span style="width:${width}%"></span></div>
        </div>
        <div class="team-score"><b>${r.entries ? r.total : '–'}</b><span>Total this month</span></div>
      </div>`;
    }).join('');
  }

  function renderAll() {
    applyQuizMode();
    renderWindow();
    renderWeekSelect();
    renderMonthSelect();
    renderLeaderboard();
    renderTeams();
    renderRosterCard();
    if (quizMode()) renderTeammatePicker();
  }

  // ------------------------------------------------------------------ data

  async function loadData() {
    try {
      const res = await fetch('/api/submissions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.submissions = data.submissions || [];
      state.window = data.window || null;
      state.quizTeamsActive = Boolean(data.quizTeamsActive);
      state.namingOpen = Boolean(data.namingOpen);
      state.roster = data.roster || null;
      if (state.roster && state.roster.monthKey) {
        state.monthRosters[state.roster.monthKey] = state.roster;
      }
    } catch (err) {
      console.warn('Could not load submissions:', err);
      state.window = localWindowState();
    }
    renderAll();
  }

  // ------------------------------------------------------------------ form

  function applyQuizMode() {
    const on = quizMode();
    const setHidden = (id, hidden) => {
      const el = $(id);
      if (el) el.hidden = hidden;
    };
    const preview = $('#devDateBanner');
    if (preview) {
      if (CFG.DEV_DATE_KEY) {
        preview.hidden = false;
        preview.innerHTML = `<strong>Local preview — treating today as ${escapeHtml(CFG.DEV_DATE_KEY)}.</strong> Quiz teams, naming day, and the new form. Production still waits for 1 September.`;
      } else {
        preview.hidden = true;
        preview.innerHTML = '';
      }
    }
    setHidden('#nameConsistencyNotice', on);
    setHidden('#fieldNameLegacy', on);
    setHidden('#fieldNameQuiz', !on);
    setHidden('#fieldTeamLegacy', on);
    setHidden('#fieldQuizTeam', !on);
    setHidden('#fieldTeammates', !on);
    setHidden('#quizRosterCard', !on);
    setHidden('#rulesLegacy', on);
    setHidden('#rulesQuiz', !on);

    const nameInput = $('#name');
    const nameSelect = $('#nameSelect');
    const teamSel = $('#team');
    if (nameInput) nameInput.required = !on;
    if (nameSelect) nameSelect.required = on;
    if (teamSel) teamSel.required = !on;

    const lede = $('#panel-submit .panel-lede');
    if (lede) {
      lede.textContent = on
        ? 'Pick your name, who you played with, the score, and a screenshot.'
        : 'Four fields, ten seconds, one small act of honesty.';
    }

    if (on) populateNameSelect();
  }

  function populateNameSelect() {
    const sel = $('#nameSelect');
    if (!sel || sel.dataset.filled === '1') return;
    const players = (CFG.PLAYERS || (TEAMS_MOD && TEAMS_MOD.PLAYERS) || []).slice()
      .sort((a, b) => a.localeCompare(b));
    const current = sel.value;
    sel.innerHTML = '<option value="">Choose your name…</option>';
    for (const p of players) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    }
    if (current) sel.value = current;
    sel.dataset.filled = '1';
  }

  function scoredTodayKeys() {
    const day = todayKey();
    return new Set(
      state.submissions
        .filter((s) => s.dateKey === day)
        .map((s) => SCORING.nameKey(s.name))
    );
  }

  function renderTeammatePicker() {
    const list = $('#teammateList');
    const label = $('#quizTeamLabel');
    const err = $('[data-error-for="teammates"]');
    if (!list || !TEAMS_MOD) return;

    const name = ($('#nameSelect') && $('#nameSelect').value) || '';
    if (!name) {
      if (label) label.textContent = 'Pick your name first.';
      list.innerHTML = '';
      return;
    }

    const team = TEAMS_MOD.findPlayerTeam(state.roster, name);
    if (label) {
      label.textContent = team ? TEAMS_MOD.displayName(team) : 'Not on a quiz team this month.';
    }

    const available = TEAMS_MOD.availableTeammates(state.roster, name, scoredTodayKeys());
    if (!available.length) {
      list.innerHTML = '<p class="hint">No teammates left to play with today — you need at least one, and never play alone.</p>';
      return;
    }

    list.innerHTML = available.map((p) => `
      <label class="teammate-option">
        <input type="checkbox" name="teammate" value="${escapeHtml(p)}">
        <span>${escapeHtml(p)}</span>
      </label>`).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      box.addEventListener('change', () => {
        const checked = list.querySelectorAll('input[type="checkbox"]:checked');
        if (checked.length > 2) {
          box.checked = false;
          if (err) {
            err.textContent = 'Max two teammates — three of you on the quiz, no more.';
            err.classList.add('is-shown');
          }
        } else if (err) {
          err.textContent = '';
          err.classList.remove('is-shown');
        }
      });
    });
  }

  function selectedTeammates() {
    return $$('#teammateList input[type="checkbox"]:checked').map((el) => el.value);
  }

  function renderRosterCard() {
    const card = $('#quizRosterCard');
    const body = $('#quizRosterBody');
    const lede = $('#quizRosterLede');
    if (!card || !body || !quizMode()) return;

    const roster = state.roster;
    if (!roster || !roster.teams) {
      body.innerHTML = '<p class="muted">Teams will appear here on 1 September.</p>';
      return;
    }

    const naming = state.namingOpen || (TEAMS_MOD && TEAMS_MOD.isNamingDay(todayKey()));
    if (lede) {
      lede.textContent = naming
        ? 'Here\'s who is on each team this month. Pick a name today — it\'s locked for the rest of the month.'
        : 'Here\'s who is on each team this month. Names are locked after the 1st.';
    }

    body.innerHTML = `<div class="roster-grid">${roster.teams.map((t) => {
      const title = TEAMS_MOD.displayName(t);
      const people = t.members || [];
      let extra = '';
      if (t.name) {
        extra = t.autoNamed
          ? '<p class="roster-name-note">Assigned after the naming window.</p>'
          : '<p class="roster-name-note">Name locked.</p>';
      } else if (naming) {
        extra = `<form class="roster-name-form" data-team-id="${escapeHtml(t.id)}">
          <label class="sr-only" for="team-name-${escapeHtml(t.id)}">Name for this team</label>
          <input type="text" id="team-name-${escapeHtml(t.id)}" maxlength="40" placeholder="Name this team" required>
          <button type="submit" class="btn btn--secondary">Lock this name</button>
          <p class="field-error" data-error-for="name-${escapeHtml(t.id)}"></p>
        </form>`;
      }
      return `<div class="roster-team">
        <p class="roster-kicker">${t.name ? 'Quiz team' : naming ? 'Needs a name today' : 'Quiz team'}</p>
        <div class="roster-team-name">${escapeHtml(title)}</div>
        <p class="roster-people-label">People on this team</p>
        <ul class="roster-people">
          ${people.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
        ${extra}
      </div>`;
    }).join('')}</div>`;
  }

  async function submitTeamName(event) {
    event.preventDefault();
    const form = event.target;
    const teamId = form.dataset.teamId;
    const name = (form.querySelector('input[type="text"]') || {}).value;
    const err = form.querySelector('.field-error');
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, name })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (err) {
          err.textContent = data.error || 'Could not save that name.';
          err.classList.add('is-shown');
        }
        return;
      }
      state.roster = data.roster;
      if (data.roster && data.roster.monthKey) state.monthRosters[data.roster.monthKey] = data.roster;
      renderRosterCard();
      renderTeammatePicker();
      renderTeams();
    } catch {
      if (err) {
        err.textContent = 'Network hiccup — try again.';
        err.classList.add('is-shown');
      }
    }
  }

  function populateTeams() {
    const sel = $('#team');
    const sorted = [...CFG.TEAMS].sort((a, b) => a.localeCompare(b));
    for (const t of sorted) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    $('#score').max = CFG.MAX_SCORE;
    $('#scoreSuffix').textContent = `/ ${CFG.MAX_SCORE}`;
  }

  function setFieldError(field, message) {
    const el = $(`[data-error-for="${field}"]`);
    const input = $(`#${field}`);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-shown', Boolean(message));
    if (input) input.classList.toggle('is-invalid', Boolean(message));
  }

  function clearErrors() {
    for (const f of ['name', 'nameSelect', 'score', 'team', 'teammates', 'screenshot']) setFieldError(f, '');
    const msg = $('#formMessage');
    msg.textContent = '';
    msg.className = 'form-message';
  }

  let compressedImage = null;
  let shotCheck = null;

  /** Downscale + re-encode so we never post a 6MB phone screenshot. */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file doesn't look like an image."));
        img.onload = () => {
          const maxEdge = 1400;
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          let quality = 0.85;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length * 0.75 > CFG.MAX_IMAGE_BYTES && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Look for the quiz score badge and, if a score has already been typed in,
   * check the two agree. Runs on upload and again on submit, because the score
   * field is often filled in after the screenshot is chosen.
   */
  async function checkScreenshot(expectedScore) {
    if (!compressedImage || !SHOTS) return null;
    try {
      shotCheck = await SHOTS.validateDataUrl(compressedImage, {
        expectedScore,
        maxScore: CFG.MAX_SCORE
      });
    } catch {
      shotCheck = null; // a checker wobble shouldn't block an honest submission
    }
    return shotCheck;
  }

  function renderShotCheck(result) {
    const note = $('#shotCheck');
    if (!note) return;
    if (!result) {
      note.textContent = '';
      note.className = 'shot-check';
      return;
    }
    note.classList.remove('is-hidden');
    if (result.accepted && result.mismatch) {
      note.textContent = `Screenshot checks out (${result.confidence}% match), but it reads ${result.readScore}/${CFG.MAX_SCORE}. All good if you're logging the team's score.`;
      note.className = 'shot-check is-warn';
    } else if (result.accepted) {
      const read = result.readScore === null ? '' : ` Reading ${result.readScore}/${CFG.MAX_SCORE}.`;
      note.textContent = `Screenshot checks out (${result.confidence}% match).${read}`;
      note.className = 'shot-check is-pass';
    } else {
      // Never a dead end: the check is a helper, not a bouncer.
      note.textContent = result.reason;
      note.className = 'shot-check is-warn';
    }
  }

  async function handleFile(file) {
    setFieldError('screenshot', '');
    compressedImage = null;
    shotCheck = null;
    renderShotCheck(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFieldError('screenshot', 'Please choose an image file (PNG or JPG).');
      return;
    }
    try {
      compressedImage = await compressImage(file);
      const preview = $('#preview');
      preview.src = compressedImage;
      preview.hidden = false;
      $('#dropBody').style.display = 'none';

      const typed = Number($('#score').value);
      renderShotCheck(await checkScreenshot(Number.isInteger(typed) ? typed : null));
    } catch (err) {
      setFieldError('screenshot', err.message);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    clearErrors();

    const quizOn = quizMode();
    const name = quizOn
      ? ($('#nameSelect').value || '').trim()
      : $('#name').value.trim().replace(/\s+/g, ' ');
    const team = quizOn ? '' : $('#team').value;
    const teammates = quizOn ? selectedTeammates() : [];
    const scoreRaw = $('#score').value;
    const score = Number(scoreRaw);

    let ok = true;
    if (quizOn) {
      if (!name) { setFieldError('nameSelect', 'Pick your name from the list.'); ok = false; }
      if (teammates.length < 1 || teammates.length > 2) {
        setFieldError('teammates', 'Pick 1 or 2 teammates. Never play alone, never more than three of you.');
        ok = false;
      }
    } else {
      if (name.length < 2) { setFieldError('name', 'We need your full name so your scores group together.'); ok = false; }
      if (!team) { setFieldError('team', 'Pick your work team.'); ok = false; }
    }
    if (scoreRaw === '' || !Number.isInteger(score) || score < 0 || score > CFG.MAX_SCORE) {
      setFieldError('score', `A whole number from 0 to ${CFG.MAX_SCORE}, please.`); ok = false;
    }
    if (!compressedImage) { setFieldError('screenshot', 'A screenshot is required — it keeps everyone honest.'); ok = false; }
    if (!ok) return;

    const btn = $('#submitBtn');
    const msg = $('#formMessage');
    btn.disabled = true;
    btn.textContent = 'Checking screenshot…';

    // Re-check now that we know the score they claim. The verdict is recorded
    // and shown, but it never stops the submission — a screenshot the checker
    // can't read is a job for a human, not a reason to turn someone away.
    const check = await checkScreenshot(score);
    renderShotCheck(check);

    btn.textContent = 'Logging…';

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          team: quizOn ? undefined : team,
          teammates: quizOn ? teammates : undefined,
          score,
          screenshot: compressedImage,
          shotConfidence: check ? check.confidence : null,
          shotRead: check ? check.readScore : null
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        msg.textContent = data.error || 'That did not go through. Give it another crack.';
        msg.className = 'form-message is-error';
        btn.disabled = false;
        btn.textContent = 'Log my score 🏁';
        if (res.status === 423) await loadData();
        return;
      }

      const logged = quizOn && Array.isArray(data.submissions) && data.submissions.length > 1
        ? data.submissions.map((s) => s.name).join(', ')
        : name;
      msg.textContent = `Logged — ${score}/${CFG.MAX_SCORE} for ${logged}. Nice work. 🏁`;
      msg.className = 'form-message is-success';

      $('#scoreForm').reset();
      compressedImage = null;
      shotCheck = null;
      renderShotCheck(null);
      $('#preview').hidden = true;
      $('#preview').removeAttribute('src');
      $('#dropBody').style.display = '';

      await loadData();
      btn.textContent = 'Log my score 🏁';
      btn.disabled = !(state.window && state.window.open);
    } catch (err) {
      msg.textContent = 'Network hiccup — check your connection and try again.';
      msg.className = 'form-message is-error';
      btn.disabled = false;
      btn.textContent = 'Log my score 🏁';
    }
  }

  // ------------------------------------------------------------------ tabs

  function switchTab(panelName) {
    $$('.tab').forEach((t) => {
      const on = t.dataset.panel === panelName;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('.panel').forEach((p) => {
      const on = p.id === `panel-${panelName}`;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
    if (history.replaceState) history.replaceState(null, '', `#${panelName}`);
  }

  // -------------------------------------------------------------- lightbox

  function openLightbox(id) {
    $('#lightboxImg').src = `/api/screenshot?id=${encodeURIComponent(id)}`;
    $('#lightbox').hidden = false;
    $('#lightboxClose').focus();
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    $('#lightboxImg').removeAttribute('src');
  }

  // ------------------------------------------------------------------ init

  function init() {
    populateTeams();
    populateNameSelect();
    applyQuizMode();
    renderWindow();

    $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.panel)));

    const hash = location.hash.replace('#', '');
    if (['submit', 'leaderboard', 'teams', 'rules'].includes(hash)) switchTab(hash);

    $('#scoreForm').addEventListener('submit', submitForm);
    $('#screenshot').addEventListener('change', (e) => handleFile(e.target.files[0]));
    $('#nameSelect')?.addEventListener('change', () => renderTeammatePicker());
    $('#quizRosterBody')?.addEventListener('submit', (e) => {
      if (e.target.matches('.roster-name-form')) submitTeamName(e);
    });

    // Score often gets typed after the screenshot — keep the check in step.
    $('#score').addEventListener('change', async () => {
      if (!compressedImage) return;
      const typed = Number($('#score').value);
      renderShotCheck(await checkScreenshot(Number.isInteger(typed) ? typed : null));
    });

    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      drop.addEventListener(ev, () => drop.classList.remove('is-drag')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) { $('#screenshot').files = e.dataTransfer.files; handleFile(file); }
    });

    $('#weekSelect').addEventListener('change', (e) => {
      state.selectedWeek = e.target.value;
      renderLeaderboard();
    });

    $('#monthSelect').addEventListener('change', async (e) => {
      state.selectedMonth = e.target.value;
      if (TEAMS_MOD && TEAMS_MOD.quizMonth(state.selectedMonth) && !rosterFor(state.selectedMonth)) {
        try {
          const res = await fetch(`/api/teams?month=${encodeURIComponent(state.selectedMonth)}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data.roster) state.monthRosters[state.selectedMonth] = data.roster;
          }
        } catch { /* standings still render from submissions */ }
      }
      renderTeams();
    });

    $('#boardBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-shot]');
      if (btn) openLightbox(btn.dataset.shot);
    });

    $('#lightboxClose').addEventListener('click', closeLightbox);
    $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

    loadData();

    // Keep the open/closed pill honest without a page refresh.
    setInterval(renderWindow, 30000);
    setInterval(loadData, 120000);
    // Flip the Friday veil the moment reveal time hits, even if nobody refreshes.
    setInterval(() => {
      const shouldVeil = scoresVeiled();
      const isVeiled = $('#panel-leaderboard')?.classList.contains('board-veiled');
      if (shouldVeil !== isVeiled) renderLeaderboard();
    }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
