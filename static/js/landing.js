let currentYear, currentMonth;
let allProblems = [];
let activeTagFilters = [];
const npTags = [];

document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    loadAll();
});

function loadAll() {
    loadCalendar();
    loadReminders();
    loadStats();
    loadContributions();
    loadProblems();
    loadLeetCode();
}

// ── Calendar ──────────────────────────────────────────────

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    loadCalendar();
}

async function loadCalendar() {
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    document.getElementById('calendarMonth').textContent = `${months[currentMonth-1]} ${currentYear}`;

    const resp = await fetch(`/api/calendar/${currentYear}/${currentMonth}`);
    const data = await resp.json();

    const grid = document.getElementById('calendarGrid');
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let html = days.map(d => `<div class="calendar-day-label">${d}</div>`).join('');

    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    for (let i = 0; i < startDow; i++) {
        html += '<div class="calendar-cell empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = dateStr === todayStr;
        const problems = data[dateStr] || [];

        html += `<div class="calendar-cell${isToday ? ' today' : ''}">`;
        html += `<div class="calendar-date">${d}</div>`;
        html += '<div class="calendar-problems">';
        for (const p of problems.slice(0, 4)) {
            const label = p.leetcode_number ? `#${p.leetcode_number}` : p.title.slice(0, 6);
            const cls = p.type === 'revised' ? ' revised' : '';
            html += `<span class="calendar-problem-tag${cls}"
                          onclick="event.stopPropagation();window.location='/problem/${p.id}'"
                          onmouseenter="showTooltip(event, ${JSON.stringify(p).replace(/"/g, '&quot;')})"
                          onmouseleave="hideTooltip()">${label}</span>`;
        }
        if (problems.length > 4) {
            html += `<span class="calendar-overflow">+${problems.length - 4}</span>`;
        }
        html += '</div></div>';
    }

    grid.innerHTML = html;
}

// ── Tooltip ───────────────────────────────────────────────

function showTooltip(e, problem) {
    const tip = document.getElementById('tooltip');
    const visited = problem.last_visited_at
        ? new Date(problem.last_visited_at).toLocaleString()
        : 'Never';
    tip.innerHTML = `
        <div class="tooltip-title">${problem.leetcode_number ? '#'+problem.leetcode_number+' ' : ''}${problem.title}</div>
        <div class="tooltip-meta">Last visited: ${visited}</div>
        <div class="tooltip-meta">${problem.type === 'revised' ? 'Revised' : 'Created'} this day</div>
    `;
    tip.classList.remove('hidden');
    const rect = e.target.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    if (left + 250 > window.innerWidth) left = rect.left - 260;
    if (top + 80 > window.innerHeight) top = window.innerHeight - 80;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').classList.add('hidden');
}

// ── Reminders ─────────────────────────────────────────────

async function loadReminders() {
    const resp = await fetch('/api/reminders');
    const reminders = await resp.json();
    const el = document.getElementById('reminders');

    if (reminders.length === 0) {
        el.innerHTML = '<div class="no-reminders">No problems due for review</div>';
        return;
    }

    el.innerHTML = reminders.map(r => `
        <div class="reminder-card" onclick="window.location='/problem/${r.id}'">
            <div class="reminder-title">
                ${r.leetcode_number ? '#'+r.leetcode_number+' ' : ''}${r.title}
            </div>
            <div class="reminder-meta">
                <span class="badge badge-${r.difficulty}">${r.difficulty}</span>
                &nbsp;Due: ${r.remind_date}
            </div>
        </div>
    `).join('');
}

// ── Stats ─────────────────────────────────────────────────

let tagCounts = {};

async function loadStats() {
    const resp = await fetch('/api/stats');
    const stats = await resp.json();
    const dc = stats.difficulty_counts;
    tagCounts = stats.tag_counts;

    const easy = dc.easy || 0;
    const med = dc.medium || 0;
    const hard = dc.hard || 0;
    const total = easy + med + hard;

    document.getElementById('statsRow').innerHTML = `
        <div class="stat-card">
            <div class="stat-count" style="color:var(--text-primary)">${total}</div>
            <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
            <div class="stat-count easy">${easy}</div>
            <div class="stat-label">Easy</div>
        </div>
        <div class="stat-card">
            <div class="stat-count medium">${med}</div>
            <div class="stat-label">Medium</div>
        </div>
        <div class="stat-card">
            <div class="stat-count hard">${hard}</div>
            <div class="stat-label">Hard</div>
        </div>
    `;

    renderTopicBubbles();
}

function renderTopicBubbles() {
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const el = document.getElementById('topicBubbles');
    if (sorted.length === 0) {
        el.innerHTML = '<span style="color:var(--text-muted);font-size:13px">No topics yet</span>';
        return;
    }
    el.innerHTML = sorted.map(([tag, count]) => {
        const isActive = activeTagFilters.includes(tag);
        return `<div class="topic-bubble${isActive ? ' active' : ''}" onclick="toggleTagFilter('${tag.replace(/'/g, "\\'")}')">
            ${tag} <span class="topic-count">${count}</span>
        </div>`;
    }).join('');
}

// ── Topic filtering ───────────────────────────────────────

function toggleTagFilter(tag) {
    const idx = activeTagFilters.indexOf(tag);
    if (idx >= 0) {
        activeTagFilters.splice(idx, 1);
    } else {
        activeTagFilters.push(tag);
    }
    renderTopicBubbles();
    renderActiveFilters();
    applyFilters();
}

function clearAllFilters() {
    activeTagFilters.length = 0;
    document.getElementById('searchInput').value = '';
    renderTopicBubbles();
    renderActiveFilters();
    renderProblemList(allProblems);
}

function removeFilter(tag) {
    const idx = activeTagFilters.indexOf(tag);
    if (idx >= 0) activeTagFilters.splice(idx, 1);
    renderTopicBubbles();
    renderActiveFilters();
    applyFilters();
}

function renderActiveFilters() {
    const el = document.getElementById('activeFilters');
    if (activeTagFilters.length === 0) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `<div class="active-filters">
        ${activeTagFilters.map(t =>
            `<span class="active-filter-chip">${t} <button onclick="removeFilter('${t.replace(/'/g, "\\'")}')">×</button></span>`
        ).join('')}
        <button class="clear-filters" onclick="clearAllFilters()">Clear all</button>
    </div>`;
}

function applyFilters() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    let filtered = allProblems;

    if (activeTagFilters.length > 0) {
        filtered = filtered.filter(p =>
            activeTagFilters.every(tag => p.tags.includes(tag))
        );
    }

    if (q) {
        filtered = filtered.filter(p =>
            p.title.toLowerCase().includes(q) ||
            (p.leetcode_number && String(p.leetcode_number).includes(q)) ||
            p.tags.some(t => t.toLowerCase().includes(q)) ||
            p.description.toLowerCase().includes(q)
        );
    }

    renderProblemList(filtered);
}

// ── Contribution graph ────────────────────────────────────

async function loadContributions() {
    const resp = await fetch('/api/contributions');
    const data = await resp.json();

    const today = new Date();
    const graph = document.getElementById('contribGraph');
    const monthsEl = document.getElementById('contribMonths');

    const dow = today.getDay();
    const startOffset = dow === 0 ? 6 : dow - 1;
    const totalDays = 52 * 7 + startOffset + 1;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - totalDays + 1);

    let cells = '';
    let months = {};

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const count = data[key] || 0;
        let level = '';
        if (count >= 4) level = ' l4';
        else if (count >= 3) level = ' l3';
        else if (count >= 2) level = ' l2';
        else if (count >= 1) level = ' l1';

        const col = Math.floor(i / 7);
        if (d.getDate() <= 7) {
            const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            months[col] = mNames[d.getMonth()];
        }

        cells += `<div class="contrib-cell${level}" title="${key}: ${count} problem${count!==1?'s':''}"></div>`;
    }

    graph.innerHTML = cells;

    const maxCol = Math.floor(totalDays / 7);
    let monthHtml = '';
    let lastMonth = '';
    for (let c = 0; c <= maxCol; c++) {
        const m = months[c] || '';
        if (m && m !== lastMonth) {
            monthHtml += `<span style="min-width:${14*3}px">${m}</span>`;
            lastMonth = m;
        }
    }
    monthsEl.innerHTML = monthHtml;
}

// ── Problem list ──────────────────────────────────────────

async function loadProblems() {
    const resp = await fetch('/api/problems');
    allProblems = await resp.json();
    renderProblemList(allProblems);
}

function renderProblemList(problems) {
    const el = document.getElementById('problemList');
    if (problems.length === 0) {
        el.innerHTML = '<div class="no-reminders">No problems found</div>';
        return;
    }
    el.innerHTML = problems.map(p => `
        <div class="problem-item" onclick="window.location='/problem/${p.id}'">
            <span class="problem-number">${p.leetcode_number ? '#'+p.leetcode_number : '—'}</span>
            <span class="problem-name">${p.title}</span>
            <span class="badge badge-${p.difficulty}" style="font-size:10px">${p.difficulty[0].toUpperCase()}</span>
        </div>
    `).join('');
}

function filterProblems() {
    applyFilters();
}

// ── LeetCode ──────────────────────────────────────────────

async function loadLeetCode() {
    const resp = await fetch('/api/leetcode/cached');
    const p = await resp.json();
    renderLeetCode(p);
}

function renderLeetCode(p) {
    const el = document.getElementById('lcPanel');
    if (!p || !p.username) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const s = p.solved || {};
    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="lc-panel-head">
            <div>
                <span class="lc-badge">LeetCode</span>
                <a class="lc-user" href="https://leetcode.com/u/${p.username}/" target="_blank" rel="noopener">@${p.username}</a>
                ${p.ranking ? `<span class="lc-rank">Rank #${p.ranking.toLocaleString()}</span>` : ''}
            </div>
            <button class="btn btn-sm btn-secondary" onclick="syncLeetCode()">↻ Sync</button>
        </div>
        <div class="lc-stats">
            <div class="lc-stat"><span class="lc-num">${s.all || 0}</span><span class="lc-cap">Solved</span></div>
            <div class="lc-stat"><span class="lc-num easy">${s.easy || 0}</span><span class="lc-cap">Easy</span></div>
            <div class="lc-stat"><span class="lc-num medium">${s.medium || 0}</span><span class="lc-cap">Medium</span></div>
            <div class="lc-stat"><span class="lc-num hard">${s.hard || 0}</span><span class="lc-cap">Hard</span></div>
            <div class="lc-stat"><span class="lc-num">${p.streak || 0}</span><span class="lc-cap">Streak</span></div>
            <div class="lc-stat"><span class="lc-num">${p.totalActiveDays || 0}</span><span class="lc-cap">Active days</span></div>
        </div>`;
}

async function syncLeetCode() {
    const status = document.getElementById('lcSyncStatus');
    const username = (document.getElementById('lcUsernameInput')?.value || '').trim();
    const setStatus = (msg, color) => { if (status) { status.textContent = msg; status.style.color = color; } };
    setStatus('Syncing from LeetCode…', 'var(--text-muted)');
    try {
        const resp = await fetch('/api/leetcode/sync', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(username ? {username} : {}),
        });
        const data = await resp.json();
        if (!resp.ok) {
            setStatus(data.error || 'Sync failed', 'var(--hard)');
            return;
        }
        const msg = `Synced @${data.username}: ${data.new_count} new, ${data.rep_count} rep${data.rep_count !== 1 ? 's' : ''}.`;
        setStatus(msg, 'var(--success)');
        renderLeetCode(data.profile);
        // Refresh views that the sync may have changed.
        loadCalendar();
        loadStats();
        loadContributions();
        loadProblems();
    } catch {
        setStatus('Failed to reach LeetCode', 'var(--hard)');
    }
}

// ── LeetCode account (v2) ─────────────────────────────────

async function loadAuthState() {
    const resp = await fetch('/api/leetcode/auth?validate=1');
    const a = await resp.json();
    const loggedIn = !!a.logged_in;
    const expired = loggedIn && a.valid === false;   // stored token no longer works
    // On expiry, re-show the login form so a fresh token can be pasted.
    document.getElementById('lcLoginForm').classList.toggle('hidden', loggedIn && !expired);
    document.getElementById('lcAccountActions').classList.toggle('hidden', !loggedIn || expired);
    document.getElementById('lcAuthState').textContent =
        expired ? '— session expired, log in again'
        : loggedIn ? `— logged in${a.username ? ' as ' + a.username : ''}`
        : '— not logged in';
    const st = document.getElementById('lcAuthStatus');
    if (st && expired) {
        st.textContent = 'Your saved LeetCode session expired. Paste a fresh LEETCODE_SESSION above.';
        st.style.color = 'var(--hard)';
    }
}

async function leetcodeLogin() {
    const session = document.getElementById('lcSessionInput').value.trim();
    const csrfEl = document.getElementById('lcCsrfInput');   // optional, may be hidden
    const csrf = csrfEl ? csrfEl.value.trim() : '';
    const status = document.getElementById('lcAuthStatus');
    if (!session) { status.textContent = 'Paste your LEETCODE_SESSION cookie.'; status.style.color = 'var(--hard)'; return; }
    status.textContent = 'Verifying…'; status.style.color = 'var(--text-muted)';
    try {
        const resp = await fetch('/api/leetcode/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({session, csrf}),
        });
        const data = await resp.json();
        if (!resp.ok) { status.textContent = data.error || 'Login failed'; status.style.color = 'var(--hard)'; return; }
        document.getElementById('lcSessionInput').value = '';
        if (csrfEl) csrfEl.value = '';
        status.textContent = `Logged in as ${data.username}. Click "Import solved problems".`;
        status.style.color = 'var(--success)';
        await loadAuthState();
    } catch {
        status.textContent = 'Failed to reach LeetCode'; status.style.color = 'var(--hard)';
    }
}

async function leetcodeLogout() {
    await fetch('/api/leetcode/logout', {method: 'POST'});
    document.getElementById('lcAuthStatus').textContent = 'Logged out.';
    document.getElementById('lcAuthStatus').style.color = 'var(--text-muted)';
    await loadAuthState();
}

async function backfillSolved() {
    const status = document.getElementById('lcAuthStatus');
    status.textContent = 'Importing your solved problems…'; status.style.color = 'var(--text-muted)';
    try {
        const resp = await fetch('/api/leetcode/backfill', {method: 'POST'});
        const data = await resp.json();
        if (!resp.ok) { status.textContent = data.error || 'Import failed'; status.style.color = 'var(--hard)'; return; }
        status.textContent = `Imported ${data.created} new (${data.skipped} already tracked, ${data.solved_total} solved total).`;
        status.style.color = 'var(--success)';
        loadStats(); loadProblems(); loadCalendar(); loadContributions();
    } catch {
        status.textContent = 'Failed to reach LeetCode'; status.style.color = 'var(--hard)';
    }
}

// ── Settings ──────────────────────────────────────────────

async function showSettings() {
    loadAuthState();
    const resp = await fetch('/api/settings');
    const settings = await resp.json();
    const langSel = document.getElementById('settingDefaultLang');
    langSel.value = settings.default_language || 'python';
    // v1 username sync UI is hidden; guard in case those elements are absent.
    const lcUser = document.getElementById('lcUsernameInput');
    if (lcUser) lcUser.value = settings.leetcode_username || '';
    const lcStatus = document.getElementById('lcSyncStatus');
    if (lcStatus) {
        lcStatus.textContent = settings.leetcode_last_sync_at
            ? 'Last synced: ' + new Date(settings.leetcode_last_sync_at).toLocaleString() : '';
        lcStatus.style.color = 'var(--text-muted)';
    }

    const cfgResp = await fetch('/api/config');
    const cfg = await cfgResp.json();
    document.getElementById('dataDirInput').value = cfg.data_dir || './data';
    document.getElementById('dataDirStatus').textContent = '';
    document.getElementById('settingsVersion').textContent = 'v' + (cfg.version || '?');

    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

async function saveSetting(key, value) {
    await fetch('/api/settings', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({[key]: value}),
    });
}

async function saveDataDir() {
    const dir = document.getElementById('dataDirInput').value.trim();
    if (!dir) return;
    const status = document.getElementById('dataDirStatus');
    status.textContent = 'Saving...';
    status.style.color = 'var(--text-muted)';
    await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({data_dir: dir}),
    });
    status.textContent = 'Saved. Restart the app to use the new directory.';
    status.style.color = 'var(--success)';
}

function resetDataDir() {
    document.getElementById('dataDirInput').value = './data';
    document.getElementById('dataDirStatus').textContent = 'Reset to default. Click Save to apply.';
    document.getElementById('dataDirStatus').style.color = 'var(--text-muted)';
}

// ── New Problem Modal ─────────────────────────────────────

function showNewProblemModal() {
    document.getElementById('newProblemModal').classList.remove('hidden');
    document.getElementById('npLeetcodeNum').focus();
}

function closeModal() {
    document.getElementById('newProblemModal').classList.add('hidden');
    document.getElementById('npLeetcodeNum').value = '';
    document.getElementById('npTitle').value = '';
    document.getElementById('npDifficulty').value = 'medium';
    document.getElementById('npElo').value = '';
    document.getElementById('npSourceUrl').value = '';
    document.getElementById('npDescription').value = '';
    document.getElementById('npTagInput').value = '';
    document.getElementById('fetchStatus').textContent = '';
    npTags.length = 0;
    renderTags();
}

async function fetchLeetCode() {
    const num = document.getElementById('npLeetcodeNum').value;
    if (!num) return;
    const status = document.getElementById('fetchStatus');
    status.textContent = 'Fetching from LeetCode...';
    status.style.color = 'var(--text-muted)';

    try {
        const resp = await fetch(`/api/leetcode/${num}`);
        if (!resp.ok) {
            status.textContent = 'Problem not found or LeetCode unavailable';
            status.style.color = 'var(--hard)';
            return;
        }
        const data = await resp.json();
        document.getElementById('npTitle').value = data.title || '';
        document.getElementById('npDifficulty').value = data.difficulty || 'medium';
        document.getElementById('npSourceUrl').value = data.source_url || '';
        document.getElementById('npDescription').value = data.description || '';
        npTags.length = 0;
        (data.tags || []).forEach(t => npTags.push(t));
        renderTags();
        status.textContent = 'Fetched successfully!';
        status.style.color = 'var(--easy)';
    } catch {
        status.textContent = 'Failed to fetch from LeetCode';
        status.style.color = 'var(--hard)';
    }
}

function handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(/,/g, '');
        if (val && !npTags.includes(val)) {
            npTags.push(val);
            renderTags();
        }
        e.target.value = '';
    }
    if (e.key === 'Backspace' && !e.target.value && npTags.length) {
        npTags.pop();
        renderTags();
    }
}

function removeTag(idx) {
    npTags.splice(idx, 1);
    renderTags();
}

function renderTags() {
    const wrap = document.getElementById('npTagsWrap');
    const input = document.getElementById('npTagInput');
    wrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
    npTags.forEach((tag, i) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `${tag} <button onclick="removeTag(${i})">×</button>`;
        wrap.insertBefore(chip, input);
    });
}

async function createProblem() {
    const title = document.getElementById('npTitle').value.trim();
    if (!title) { alert('Title is required'); return; }

    const body = {
        leetcode_number: parseInt(document.getElementById('npLeetcodeNum').value) || null,
        title,
        difficulty: document.getElementById('npDifficulty').value,
        elo_rating: parseInt(document.getElementById('npElo').value) || null,
        source_url: document.getElementById('npSourceUrl').value.trim() || null,
        tags: [...npTags],
        description: document.getElementById('npDescription').value,
    };

    const resp = await fetch('/api/problems', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
    });
    const data = await resp.json();
    window.location = `/problem/${data.id}`;
}
