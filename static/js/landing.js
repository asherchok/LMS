let currentYear, currentMonth;
let allProblems = [];
let activeTagFilters = [];
const npTags = [];
let openInNewTab = true;
let dfrDays = 1;
let currentPage = 1;
const PAGE_SIZE = 10;
let activeSidebarTab = 'dfr';
let permanentDeleteNoAsk = false;

document.addEventListener('DOMContentLoaded', async () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;

    const settingsResp = await fetch('/api/settings');
    const settings = await settingsResp.json();
    openInNewTab = settings.open_in_new_tab !== 'false';
    dfrDays = parseInt(settings.dfr_days) || 1;

    loadAll();
});

function loadAll() {
    loadCalendar();
    loadReminders();
    loadUpcoming();
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

let _calendarData = null;

async function loadCalendar() {
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    document.getElementById('calendarMonth').textContent = `${months[currentMonth-1]} ${currentYear}`;

    const resp = await fetch(`/api/calendar/${currentYear}/${currentMonth}`);
    _calendarData = await resp.json();

    const grid = document.getElementById('calendarGrid');
    grid.style.gridTemplateRows = '';
    renderCalendarGrid(grid, _calendarData, false);

    // Lock row heights so topic filters don't cause layout shift
    requestAnimationFrame(() => {
        const cells = grid.querySelectorAll('.calendar-cell, .calendar-day-label');
        const cols = 7;
        const rows = Math.ceil(cells.length / cols);
        const rowHeights = [];
        for (let r = 0; r < rows; r++) {
            let maxH = 0;
            for (let c = 0; c < cols; c++) {
                const cell = cells[r * cols + c];
                if (cell) maxH = Math.max(maxH, cell.offsetHeight);
            }
            if (maxH > 0) rowHeights.push(maxH + 'px');
        }
        if (rowHeights.length > 0) grid.style.gridTemplateRows = rowHeights.join(' ');
    });
}

function renderCalendarGrid(grid, data, keepRowHeights) {
    const savedRows = keepRowHeights ? grid.style.gridTemplateRows : '';
    const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let html = dayLabels.map(d => `<div class="calendar-day-label">${d}</div>`).join('');

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
        const isFuture = dateStr > todayStr;
        let problems = data[dateStr] || [];

        if (activeTagFilters.length > 0) {
            const taggedIds = new Set(
                allProblems.filter(p => activeTagFilters.every(tag => p.tags.includes(tag)))
                           .map(p => p.id)
            );
            problems = problems.filter(p => taggedIds.has(p.id));
        }

        const revisedCount = problems.filter(p => p.type === 'revised').length;

        html += `<div class="calendar-cell${isToday ? ' today' : ''}">`;
        html += `<div class="calendar-date">${d}</div>`;
        html += '<div class="calendar-problems">';
        for (const p of problems) {
            const label = p.leetcode_number ? `#${p.leetcode_number}` : p.title.slice(0, 6);
            let cls = '';
            if (p.type === 'upcoming') {
                cls = ` diff-${p.difficulty || 'medium'} upcoming`;
            } else if (p.first_revision) {
                cls = ' first-revision';
            } else {
                cls = ` diff-${p.difficulty || 'medium'}`;
            }
            if (isFuture && p.type !== 'upcoming') cls += ' future';
            const openTarget = openInNewTab ? '_blank' : '_self';
            const dragAttr = p.type === 'upcoming' ? ` draggable="true" data-pid="${p.id}"` : '';
            html += `<span class="calendar-problem-tag${cls}"${dragAttr}
                          onclick="event.stopPropagation();window.open('/problem/${p.id}','${openTarget}')"
                          onmouseenter="showTooltip(event, ${JSON.stringify(p).replace(/"/g, '&quot;')})"
                          onmouseleave="hideTooltip()">${label}</span>`;
        }
        html += '</div>';
        if (revisedCount > 0) {
            html += `<div class="calendar-revised-count">${revisedCount}</div>`;
        }
        html += '</div>';
    }

    grid.innerHTML = html;
    if (savedRows) grid.style.gridTemplateRows = savedRows;
    initCalendarDrag(grid);
}

function refreshCalendarFilters() {
    if (!_calendarData) return;
    const grid = document.getElementById('calendarGrid');
    renderCalendarGrid(grid, _calendarData, true);
}

// ── Calendar drag-and-drop (upcoming items only) ─────────
function initCalendarDrag(grid) {
    grid.addEventListener('dragstart', e => {
        const tag = e.target.closest('.calendar-problem-tag.upcoming[draggable="true"]');
        if (!tag) return;
        e.dataTransfer.setData('text/plain', tag.dataset.pid);
        e.dataTransfer.effectAllowed = 'move';
    });
    grid.addEventListener('dragover', e => {
        const cell = e.target.closest('.calendar-cell:not(.empty)');
        if (!cell) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        grid.querySelectorAll('.cal-drop-target').forEach(c => c.classList.remove('cal-drop-target'));
        cell.classList.add('cal-drop-target');
    });
    grid.addEventListener('dragleave', e => {
        const cell = e.target.closest('.calendar-cell');
        if (cell) cell.classList.remove('cal-drop-target');
    });
    grid.addEventListener('drop', async e => {
        e.preventDefault();
        grid.querySelectorAll('.cal-drop-target').forEach(c => c.classList.remove('cal-drop-target'));
        const cell = e.target.closest('.calendar-cell:not(.empty)');
        if (!cell) return;
        const pid = e.dataTransfer.getData('text/plain');
        if (!pid) return;
        const dateEl = cell.querySelector('.calendar-date');
        if (!dateEl) return;
        const day = parseInt(dateEl.textContent);
        const newDate = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const today = new Date();
        today.setHours(0,0,0,0);
        if (new Date(newDate + 'T00:00:00') < today) return;
        await fetch(`/api/problems/${pid}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({remind_date: newDate}),
        });
        loadCalendar();
        loadUpcoming();
    });
}

// ── Tooltip ───────────────────────────────────────────────

function showTooltip(e, problem) {
    const tip = document.getElementById('tooltip');
    const visited = problem.last_visited_at
        ? new Date(problem.last_visited_at).toLocaleString()
        : 'Never';
    const typeLabel = problem.type === 'upcoming' ? 'Upcoming reminder' : (problem.type === 'revised' ? 'Revised' : 'Created');
    tip.innerHTML = `
        <div class="tooltip-title">${problem.leetcode_number ? '#'+problem.leetcode_number+' ' : ''}${problem.title}</div>
        <div class="tooltip-meta">Last visited: ${visited}</div>
        <div class="tooltip-meta">${typeLabel} this day</div>
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

// ── Reminders (DFR / Coming Up tabs) ─────────────────────

let dfrReminders = [];
let upcomingReminders = [];

function switchSidebarTab(tab) {
    activeSidebarTab = tab;
    document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('dfrPanel').classList.toggle('hidden', tab !== 'dfr');
    document.getElementById('upcomingPanel').classList.toggle('hidden', tab !== 'upcoming');
}

async function loadReminders() {
    const resp = await fetch('/api/reminders');
    dfrReminders = await resp.json();
    renderDfr();
}

async function loadUpcoming() {
    const resp = await fetch('/api/upcoming?days=7');
    upcomingReminders = await resp.json();
    renderUpcoming();
}

function formatDueStatus(remindDate) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(remindDate + 'T00:00:00');
    const diffMs = today - due;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return '<span class="due-today">Due Today</span>';
    if (diffDays > 0) return `<span class="past-due">Past Due: ${diffDays}d</span>`;
    return `<span class="due-future">In ${-diffDays}d</span>`;
}

function renderDfr() {
    const el = document.getElementById('dfrList');
    if (!el) return;
    if (dfrReminders.length === 0) {
        el.innerHTML = '<div class="no-reminders">No problems due for review</div>';
        return;
    }
    const target = openInNewTab ? '_blank' : '_self';
    el.innerHTML = dfrReminders.map(r => `
        <div class="reminder-card" onclick="window.open('/problem/${r.id}','${target}')">
            <div class="reminder-title">
                ${r.leetcode_number ? '#'+r.leetcode_number+' ' : ''}${r.title}
            </div>
            <div class="reminder-meta">
                <span class="badge badge-${r.difficulty}">${r.difficulty}</span>
                &nbsp;${formatDueStatus(r.remind_date)}
            </div>
        </div>
    `).join('');
}

function renderUpcoming() {
    const el = document.getElementById('upcomingList');
    if (!el) return;
    if (upcomingReminders.length === 0) {
        el.innerHTML = '<div class="no-reminders">Nothing coming up in the next 7 days</div>';
        return;
    }
    const target = openInNewTab ? '_blank' : '_self';
    el.innerHTML = upcomingReminders.map((r, i) => {
        const due = new Date(r.remind_date + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        const inDays = Math.ceil((due - today) / 86400000);
        return `<div class="reminder-card-wrap" data-pid="${r.id}" data-idx="${i}" data-remind="${r.remind_date}">
            <div class="drag-handle" draggable="true">
                <div class="drag-handle-dots"><span></span><span></span><span></span></div>
            </div>
            <div class="reminder-card" onclick="window.open('/problem/${r.id}','${target}')">
                <div class="reminder-title">
                    ${r.leetcode_number ? '#'+r.leetcode_number+' ' : ''}${r.title}
                </div>
                <div class="reminder-meta">
                    <span class="badge badge-${r.difficulty}">${r.difficulty}</span>
                    &nbsp;<span class="due-future">In ${inDays}d</span>
                </div>
            </div>
        </div>`;
    }).join('');
    initUpcomingDrag(el);
}

function initUpcomingDrag(container) {
    let dragPid = null;
    container.addEventListener('dragstart', e => {
        const handle = e.target.closest('.drag-handle');
        if (!handle) { e.preventDefault(); return; }
        const wrap = handle.closest('.reminder-card-wrap');
        dragPid = wrap.dataset.pid;
        e.dataTransfer.setData('text/plain', dragPid);
        e.dataTransfer.effectAllowed = 'move';
        wrap.style.opacity = '.4';
    });
    container.addEventListener('dragover', e => {
        if (!dragPid) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.upcoming-drop-above,.upcoming-drop-below').forEach(
            el => { el.classList.remove('upcoming-drop-above','upcoming-drop-below'); }
        );
        const wrap = e.target.closest('.reminder-card-wrap');
        if (!wrap || wrap.dataset.pid === dragPid) return;
        const rect = wrap.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            wrap.classList.add('upcoming-drop-above');
        } else {
            wrap.classList.add('upcoming-drop-below');
        }
    });
    container.addEventListener('dragleave', e => {
        const wrap = e.target.closest('.reminder-card-wrap');
        if (wrap) wrap.classList.remove('upcoming-drop-above','upcoming-drop-below');
    });
    container.addEventListener('drop', async e => {
        e.preventDefault();
        container.querySelectorAll('.upcoming-drop-above,.upcoming-drop-below').forEach(
            el => { el.classList.remove('upcoming-drop-above','upcoming-drop-below'); }
        );
        const targetWrap = e.target.closest('.reminder-card-wrap');
        if (!targetWrap || !dragPid) return;
        const rect = targetWrap.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        const targetIdx = parseInt(targetWrap.dataset.idx);
        const insertIdx = above ? targetIdx : targetIdx + 1;
        const targetDate = upcomingReminders[insertIdx] ? upcomingReminders[insertIdx].remind_date
                         : upcomingReminders[targetIdx].remind_date;
        await fetch(`/api/problems/${dragPid}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({remind_date: targetDate}),
        });
        dragPid = null;
        loadUpcoming();
        loadCalendar();
    });
    container.addEventListener('dragend', e => {
        container.querySelectorAll('.reminder-card-wrap').forEach(w => w.style.opacity = '');
        container.querySelectorAll('.upcoming-drop-above,.upcoming-drop-below').forEach(
            el => { el.classList.remove('upcoming-drop-above','upcoming-drop-below'); }
        );
        dragPid = null;
    });
}

// ── Trash (loaded in settings) ──────────────────────────

let deletedProblems = [];

async function loadDeletedProblems() {
    const resp = await fetch('/api/problems/deleted');
    deletedProblems = await resp.json();
    renderTrashInSettings();
}

function renderTrashInSettings() {
    const el = document.getElementById('trashList');
    if (!el) return;
    if (deletedProblems.length === 0) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px 0">No deleted problems</div>';
        return;
    }
    el.innerHTML = deletedProblems.map(p => {
        const deletedDate = p.deleted_at ? new Date(p.deleted_at) : null;
        const daysLeft = deletedDate ? Math.max(0, 7 - Math.floor((Date.now() - deletedDate.getTime()) / 86400000)) : '?';
        return `<div class="trash-item">
            <span class="problem-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.leetcode_number ? '#'+p.leetcode_number+' ' : ''}${p.title}</span>
            <span style="font-size:10px;color:var(--text-muted)">${daysLeft}d left</span>
            <div class="trash-actions">
                <button class="restore-btn" onclick="event.stopPropagation();restoreProblem(${p.id})" title="Restore">↩</button>
                <button class="perm-delete-btn" onclick="event.stopPropagation();permDeleteProblem(${p.id})" title="Permanently delete">✕</button>
            </div>
        </div>`;
    }).join('');
}

async function restoreProblem(id) {
    await fetch(`/api/problems/${id}/restore`, {method: 'POST'});
    loadDeletedProblems();
    loadProblems();
    loadStats();
    loadCalendar();
}

async function permDeleteProblem(id) {
    if (!permanentDeleteNoAsk) {
        if (!confirm('Permanently delete this problem? This cannot be undone.')) return;
    }
    await fetch(`/api/problems/${id}?permanent=1`, {method: 'DELETE'});
    loadDeletedProblems();
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
    const resetBtn = document.getElementById('topicResetBtn');
    if (sorted.length === 0) {
        el.innerHTML = '<span style="color:var(--text-muted);font-size:13px">No topics yet</span>';
        if (resetBtn) resetBtn.classList.add('hidden');
        return;
    }
    el.innerHTML = sorted.map(([tag, count]) => {
        const isActive = activeTagFilters.includes(tag);
        return `<div class="topic-bubble${isActive ? ' active' : ''}" onclick="toggleTagFilter('${tag.replace(/'/g, "\\'")}')">
            ${tag} <span class="topic-count">${count}</span>
        </div>`;
    }).join('');
    if (resetBtn) resetBtn.classList.toggle('hidden', activeTagFilters.length === 0);
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
    refreshCalendarFilters();
}

function clearAllFilters() {
    activeTagFilters.length = 0;
    document.getElementById('searchInput').value = '';
    renderTopicBubbles();
    renderActiveFilters();
    renderProblemList(allProblems);
    refreshCalendarFilters();
}

function resetTopicFilters() {
    activeTagFilters.length = 0;
    renderTopicBubbles();
    renderActiveFilters();
    renderProblemList(allProblems);
    refreshCalendarFilters();
}

function removeFilter(tag) {
    const idx = activeTagFilters.indexOf(tag);
    if (idx >= 0) activeTagFilters.splice(idx, 1);
    renderTopicBubbles();
    renderActiveFilters();
    applyFilters();
    refreshCalendarFilters();
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
        document.getElementById('problemPagination').innerHTML = '';
        return;
    }
    const totalPages = Math.ceil(problems.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = problems.slice(start, start + PAGE_SIZE);
    const target = openInNewTab ? '_blank' : '_self';

    el.innerHTML = page.map(p => `
        <div class="problem-item" onclick="window.open('/problem/${p.id}','${target}')">
            <span class="problem-number">${p.leetcode_number ? '#'+p.leetcode_number : '—'}</span>
            <span class="problem-name">${p.title}</span>
            <span class="badge badge-${p.difficulty}" style="font-size:10px">${p.difficulty[0].toUpperCase()}</span>
        </div>
    `).join('');

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pagEl = document.getElementById('problemPagination');
    if (totalPages <= 1) { pagEl.innerHTML = ''; return; }

    const pages = buildPageNumbers(currentPage, totalPages);
    let center = '';
    for (const p of pages) {
        if (p === '...') {
            center += `<span class="pag-ellipsis">…</span>`;
        } else if (p === currentPage) {
            center += `<button class="active pag-current" onclick="showGoToPage(this, ${totalPages})">${p}</button>`;
        } else {
            center += `<button onclick="goPage(${p})">${p}</button>`;
        }
    }

    pagEl.innerHTML =
        `<button class="pag-arrow" ${currentPage <= 1 ? 'disabled' : ''} onclick="goPage(${currentPage-1})">‹</button>` +
        `<div class="pag-center">${center}</div>` +
        `<button class="pag-arrow" ${currentPage >= totalPages ? 'disabled' : ''} onclick="goPage(${currentPage+1})">›</button>`;
}

function buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push('...');
    const lo = Math.max(2, current - 1);
    const hi = Math.min(total - 1, current + 1);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}

function showGoToPage(btn, totalPages) {
    const rect = btn.getBoundingClientRect();
    let popup = document.getElementById('goToPagePopup');
    if (popup) { popup.remove(); return; }
    popup = document.createElement('div');
    popup.id = 'goToPagePopup';
    popup.className = 'goto-page-popup';
    popup.innerHTML = `<label>Go to page</label><input type="number" min="1" max="${totalPages}" value="${currentPage}" autofocus>`;
    popup.style.position = 'fixed';
    popup.style.left = rect.left + 'px';
    popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    document.body.appendChild(popup);
    const input = popup.querySelector('input');
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = parseInt(input.value);
            if (val >= 1 && val <= totalPages) { goPage(val); }
            popup.remove();
        } else if (e.key === 'Escape') {
            popup.remove();
        }
    });
    input.addEventListener('blur', () => setTimeout(() => popup.remove(), 150));
}

function goPage(page) {
    currentPage = page;
    const popup = document.getElementById('goToPagePopup');
    if (popup) popup.remove();
    applyFilters();
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
    const resp = await fetch('/api/leetcode/auth');
    const a = await resp.json();
    const loggedIn = !!a.logged_in;
    document.getElementById('lcLoginForm').classList.toggle('hidden', loggedIn);
    document.getElementById('lcAccountActions').classList.toggle('hidden', !loggedIn);
    document.getElementById('lcAuthState').textContent =
        loggedIn ? `— logged in${a.username ? ' as ' + a.username : ''}` : '— not logged in';
}

async function leetcodeLogin() {
    const session = document.getElementById('lcSessionInput').value.trim();
    const csrfEl = document.getElementById('lcCsrfInput');
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
    const lcUser = document.getElementById('lcUsernameInput');
    if (lcUser) lcUser.value = settings.leetcode_username || '';
    const lcStatus = document.getElementById('lcSyncStatus');
    if (lcStatus) {
        lcStatus.textContent = settings.leetcode_last_sync_at
            ? 'Last synced: ' + new Date(settings.leetcode_last_sync_at).toLocaleString() : '';
        lcStatus.style.color = 'var(--text-muted)';
    }

    openInNewTab = settings.open_in_new_tab !== 'false';
    const newTabToggle = document.getElementById('settingNewTab');
    if (newTabToggle) newTabToggle.classList.toggle('on', openInNewTab);

    dfrDays = parseInt(settings.dfr_days) || 1;
    const dfrInput = document.getElementById('settingDfrDays');
    if (dfrInput) dfrInput.value = dfrDays;

    const cfgResp = await fetch('/api/config');
    const cfg = await cfgResp.json();
    document.getElementById('dataDirInput').value = cfg.data_dir || './data';
    document.getElementById('dataDirStatus').textContent = '';
    document.getElementById('settingsVersion').textContent = 'v' + (cfg.version || '?');

    loadDiskUsage();
    loadDeletedProblems();

    document.getElementById('settingsModal').classList.remove('hidden');
}

function toggleNewTabSetting() {
    openInNewTab = !openInNewTab;
    const el = document.getElementById('settingNewTab');
    if (el) el.classList.toggle('on', openInNewTab);
    saveSetting('open_in_new_tab', openInNewTab ? 'true' : 'false');
}

function saveDfrDays() {
    const val = parseInt(document.getElementById('settingDfrDays').value);
    if (val >= 1) {
        dfrDays = val;
        saveSetting('dfr_days', String(val));
    }
}

async function loadDiskUsage() {
    const el = document.getElementById('diskUsage');
    if (!el) return;
    try {
        const resp = await fetch('/api/disk-usage');
        const data = await resp.json();
        el.innerHTML = `<strong>${data.total_mb} MB</strong> used (${data.file_count} files)`;
    } catch {
        el.textContent = 'Unable to load';
    }
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
    if (openInNewTab) {
        window.open(`/problem/${data.id}`, '_blank');
        closeModal();
        loadProblems();
    } else {
        window.location = `/problem/${data.id}`;
    }
}
