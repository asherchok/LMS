let tabs = [];
let activeTabId = null;
let monacoEditors = {};
let saveTimeout = null;
let monacoReady = false;
let selectedRemindDays = 7;
let defaultLanguage = 'python';

// ── Monaco loader ─────────────────────────────────────────

function getMonacoTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'lms-light' : 'lms-dark';
}

function loadMonaco(cb) {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
    script.onload = () => {
        require.config({
            paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }
        });
        require(['vs/editor/editor.main'], () => {
            monaco.editor.defineTheme('lms-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#282828',
                    'editor.lineHighlightBackground': '#303030',
                    'editorGutter.background': '#232323',
                }
            });
            monaco.editor.defineTheme('lms-light', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#ffffff',
                    'editor.lineHighlightBackground': '#f5f0e8',
                    'editorGutter.background': '#faf7f2',
                }
            });
            monaco.editor.setTheme(getMonacoTheme());
            monacoReady = true;
            cb();
        });
    };
    document.head.appendChild(script);
}

// ── Init ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    const settingsResp = await fetch('/api/settings');
    const settings = await settingsResp.json();
    defaultLanguage = settings.default_language || 'python';

    initResizer();

    const origToggle = window.toggleTheme;
    window.toggleTheme = function() {
        origToggle();
        if (monacoReady) monaco.editor.setTheme(getMonacoTheme());
    };

    loadMonaco(() => {
        loadTabs();
        loadRevisions();
    });
});

// ── Resizable split ───────────────────────────────────────

function initResizer() {
    const page = document.getElementById('problemPage');
    const handle = document.getElementById('resizeHandle');
    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const rect = page.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.min(75, Math.max(25, pct));
        page.style.gridTemplateColumns = `${clamped}% 6px 1fr`;
        Object.values(monacoEditors).forEach(ed => ed.layout());
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        Object.values(monacoEditors).forEach(ed => ed.layout());
    });
}

// ── Tabs ──────────────────────────────────────────────────

async function loadTabs() {
    const resp = await fetch(`/api/problems/${PROBLEM_ID}/tabs`);
    tabs = await resp.json();
    renderVTabs();
    if (tabs.length > 0) {
        switchTab(tabs[tabs.length - 1].id);
    }
}

function renderVTabs() {
    const el = document.getElementById('vtabs');
    el.innerHTML = tabs.map((t, i) =>
        `<button class="vtab${t.id === activeTabId ? ' active' : ''}"
                 onclick="switchTab(${t.id})" title="${t.title}">
            ${i + 1}
            <span class="vtab-label">${t.title}</span>
        </button>`
    ).join('') +
    `<button class="vtab vtab-add" onclick="createTab()" title="New approach">+</button>`;
}

function switchTab(tabId) {
    saveCurrentTab();
    activeTabId = tabId;
    renderVTabs();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    document.getElementById('tabTitleInput').value = tab.title;
    renderBlocks(tab.content);
}

async function createTab() {
    saveCurrentTab();
    const n = tabs.length + 1;
    const resp = await fetch(`/api/problems/${PROBLEM_ID}/tabs`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title: `Approach ${n}`}),
    });
    const data = await resp.json();
    await loadTabs();
    switchTab(data.id);
}

async function deleteTab() {
    if (tabs.length <= 1) { alert('Cannot delete the last tab'); return; }
    if (!confirm('Delete this approach tab?')) return;
    await fetch(`/api/tabs/${activeTabId}`, {method: 'DELETE'});
    await loadTabs();
}

async function renameTab() {
    const title = document.getElementById('tabTitleInput').value.trim();
    if (!title) return;
    await fetch(`/api/tabs/${activeTabId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title}),
    });
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.title = title;
    renderVTabs();
}

// ── Blocks ────────────────────────────────────────────────

function renderBlocks(blocks) {
    Object.values(monacoEditors).forEach(e => e.dispose());
    monacoEditors = {};

    const container = document.getElementById('blocksContainer');
    if (!blocks || blocks.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = blocks.map((block, i) => {
        if (block.type === 'code') {
            return `<div class="block" data-index="${i}">
                <div class="block-toolbar">
                    <div class="block-toolbar-left">
                        <span class="block-type-label">Code</span>
                        <select class="lang-select" data-index="${i}" onchange="changeLang(${i}, this.value)">
                            ${langOptions(block.language || defaultLanguage)}
                        </select>
                    </div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">×</button>
                </div>
                <div class="monaco-container" id="monaco-${i}"></div>
            </div>`;
        } else {
            return `<div class="block" data-index="${i}">
                <div class="block-toolbar">
                    <div class="block-toolbar-left">
                        <span class="block-type-label">Commentary</span>
                    </div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">×</button>
                </div>
                <div class="md-toolbar" id="md-toolbar-${i}" style="display:none" onmousedown="event.preventDefault()">
                    <button onclick="mdInsert(${i},'**','**')" title="Bold"><b>B</b></button>
                    <button onclick="mdInsert(${i},'*','*')" title="Italic"><i>I</i></button>
                    <button onclick="mdInsert(${i},'<u>','</u>')" title="Underline"><u>U</u></button>
                    <button onclick="mdInsert(${i},'<mark>','</mark>')" title="Highlight">H</button>
                    <div class="sep"></div>
                    <button onclick="mdInsert(${i},'# ','')" title="H1">H1</button>
                    <button onclick="mdInsert(${i},'## ','')" title="H2">H2</button>
                    <button onclick="mdInsert(${i},'### ','')" title="H3">H3</button>
                    <div class="sep"></div>
                    <select onchange="mdColor(${i},this.value);this.selectedIndex=0" title="Color">
                        <option value="">Color</option>
                        <option value="#ff4f64">Red</option>
                        <option value="#00c9a7">Green</option>
                        <option value="#4dabf7">Blue</option>
                        <option value="#ffb800">Yellow</option>
                        <option value="#cc5de8">Purple</option>
                        <option value="#f0a030">Orange</option>
                    </select>
                    <div class="sep"></div>
                    <button onclick="mdInsert(${i},'$','$')" title="Inline math">∑</button>
                    <button onclick="mdInsert(${i},'\\n$$\\n','\\n$$\\n')" title="Block math">∑∑</button>
                    <button onclick="mdInsertDiagram(${i})" title="Diagram">◈</button>
                </div>
                <div class="markdown-preview" id="md-preview-${i}"
                     onclick="editMarkdown(${i})">${renderMarkdown(block.content || '')}</div>
                <textarea class="markdown-edit hidden" id="md-edit-${i}"
                          onblur="saveMarkdown(${i})"
                          oninput="scheduleSave()">${escapeHtml(block.content || '')}</textarea>
            </div>`;
        }
    }).join('');

    blocks.forEach((block, i) => {
        if (block.type === 'code' && monacoReady) {
            const container = document.getElementById(`monaco-${i}`);
            if (!container) return;
            const editor = monaco.editor.create(container, {
                value: block.content || '',
                language: block.language || defaultLanguage,
                theme: 'lms-dark',
                minimap: {enabled: false},
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
                lineNumbers: 'on',
                roundedSelection: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
                padding: {top: 8, bottom: 8},
            });
            editor.onDidChangeModelContent(() => scheduleSave());
            editor.onDidContentSizeChange(() => {
                const h = Math.min(600, Math.max(80, editor.getContentHeight()));
                container.style.height = h + 'px';
                editor.layout();
            });
            const initH = Math.min(600, Math.max(80, editor.getContentHeight()));
            container.style.height = initH + 'px';
            editor.layout();
            monacoEditors[i] = editor;
        }
    });
}

function langOptions(selected) {
    const langs = ['python','cpp','javascript','typescript','java','c','csharp','go',
                   'rust','ruby','swift','kotlin','scala','sql','shell','plaintext'];
    const labels = {'cpp':'C++','csharp':'C#','javascript':'JavaScript','typescript':'TypeScript'};
    return langs.map(l =>
        `<option value="${l}" ${l === selected ? 'selected' : ''}>${labels[l] || l}</option>`
    ).join('');
}

function changeLang(idx, lang) {
    const editor = monacoEditors[idx];
    if (editor) {
        monaco.editor.setModelLanguage(editor.getModel(), lang);
    }
    scheduleSave();
}

function addBlock(type) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const block = type === 'code'
        ? {type: 'code', language: defaultLanguage, content: ''}
        : {type: 'markdown', content: ''};
    tab.content.push(block);
    renderBlocks(tab.content);
    scheduleSave();
}

function removeBlock(idx) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.content.splice(idx, 1);
    renderBlocks(tab.content);
    scheduleSave();
}

// ── Markdown editing ──────────────────────────────────────

function editMarkdown(idx) {
    const preview = document.getElementById(`md-preview-${idx}`);
    const edit = document.getElementById(`md-edit-${idx}`);
    const toolbar = document.getElementById(`md-toolbar-${idx}`);
    preview.classList.add('hidden');
    edit.classList.remove('hidden');
    if (toolbar) toolbar.style.display = 'flex';
    edit.focus();
}

function saveMarkdown(idx) {
    const preview = document.getElementById(`md-preview-${idx}`);
    const edit = document.getElementById(`md-edit-${idx}`);
    const toolbar = document.getElementById(`md-toolbar-${idx}`);
    if (!preview || !edit) return;
    const content = edit.value;
    preview.innerHTML = renderMarkdown(content);
    preview.classList.remove('hidden');
    edit.classList.add('hidden');
    if (toolbar) toolbar.style.display = 'none';
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.content[idx]) {
        tab.content[idx].content = content;
    }
    scheduleSave();
}

function renderMarkdown(text) {
    if (!text) return '';
    let html;
    if (typeof marked !== 'undefined') {
        html = marked.parse(text);
    } else {
        html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    const temp = document.createElement('div');
    temp.innerHTML = html;

    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(temp, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                ],
                throwOnError: false,
            });
        } catch {}
    }

    temp.querySelectorAll('pre code.language-mermaid, pre code').forEach(el => {
        if (el.className.includes('mermaid') || el.parentElement.previousElementSibling?.textContent?.includes('mermaid')) {
            const mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.textContent = el.textContent;
            el.parentElement.replaceWith(mermaidDiv);
        }
    });

    const result = temp.innerHTML;

    setTimeout(() => {
        if (typeof mermaid !== 'undefined') {
            try { mermaid.run(); } catch {}
        }
    }, 50);

    return result;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

// ── Markdown toolbar helpers ──────────────────────────────

function mdInsert(idx, before, after) {
    const ta = document.getElementById(`md-edit-${idx}`);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const text = selected || 'text';
    ta.value = ta.value.substring(0, start) + before + text + after + ta.value.substring(end);
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + text.length;
    ta.focus();
    scheduleSave();
}

function mdColor(idx, color) {
    if (!color) return;
    mdInsert(idx, `<span style="color:${color}">`, '</span>');
}

function mdInsertDiagram(idx) {
    const ta = document.getElementById(`md-edit-${idx}`);
    if (!ta) return;
    const pos = ta.selectionStart;
    const snippet = '\n```mermaid\ngraph TD\n    A[Start] --> B[End]\n```\n';
    ta.value = ta.value.substring(0, pos) + snippet + ta.value.substring(pos);
    ta.selectionStart = ta.selectionEnd = pos + snippet.length;
    ta.focus();
    scheduleSave();
}

// ── Save ──────────────────────────────────────────────────

function collectTabContent() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return [];
    return (tab.content || []).map((block, i) => {
        if (block.type === 'code') {
            const editor = monacoEditors[i];
            const langSelect = document.querySelector(`.lang-select[data-index="${i}"]`);
            return {
                type: 'code',
                language: langSelect ? langSelect.value : (block.language || defaultLanguage),
                content: editor ? editor.getValue() : block.content,
            };
        } else {
            const edit = document.getElementById(`md-edit-${i}`);
            return {
                type: 'markdown',
                content: edit ? edit.value : block.content,
            };
        }
    });
}

function saveCurrentTab() {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.content = collectTabContent();
}

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 1000);
}

async function doSave() {
    if (!activeTabId) return;
    const content = collectTabContent();
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.content = content;
    await fetch(`/api/tabs/${activeTabId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content}),
    });
}

// ── Revisions ─────────────────────────────────────────────

async function loadRevisions() {
    const resp = await fetch(`/api/problems/${PROBLEM_ID}/revisions`);
    const revisions = await resp.json();
    const dotsEl = document.getElementById('revisionDots');
    const maxDots = Math.min(revisions.length, 10);
    dotsEl.innerHTML = Array(maxDots).fill('<div class="revision-dot"></div>').join('');
}

function showRevisedPopup() {
    document.getElementById('revisedModal').classList.remove('hidden');
}

function closeRevisedPopup() {
    document.getElementById('revisedModal').classList.add('hidden');
}

function selectRemind(btn) {
    document.querySelectorAll('.remind-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRemindDays = parseInt(btn.dataset.days);
    document.getElementById('customDays').value = '';
}

function clearRemindSelection() {
    document.querySelectorAll('.remind-option').forEach(b => b.classList.remove('selected'));
    selectedRemindDays = null;
}

async function confirmRevised() {
    const custom = parseInt(document.getElementById('customDays').value);
    const days = custom > 0 ? custom : selectedRemindDays;

    await fetch(`/api/problems/${PROBLEM_ID}/revise`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({remind_days: days}),
    });

    closeRevisedPopup();
    const countEl = document.getElementById('revisionCount');
    countEl.textContent = parseInt(countEl.textContent) + 1;
    loadRevisions();
}

// ── Edit problem ──────────────────────────────────────────

function toggleEditProblem() {
    document.getElementById('editForm').classList.toggle('hidden');
}

async function saveProblemEdit() {
    const data = {
        title: document.getElementById('editTitle').value.trim(),
        leetcode_number: parseInt(document.getElementById('editLcNum').value) || null,
        difficulty: document.getElementById('editDifficulty').value,
        elo_rating: parseInt(document.getElementById('editElo').value) || null,
        source_url: document.getElementById('editSourceUrl').value.trim() || null,
        tags: document.getElementById('editTags').value.split(',').map(s => s.trim()).filter(Boolean),
        description: document.getElementById('editDescription').value,
    };

    await fetch(`/api/problems/${PROBLEM_ID}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
    });

    location.reload();
}

async function deleteProblem() {
    if (!confirm('Delete this problem and all its tabs?')) return;
    await fetch(`/api/problems/${PROBLEM_ID}`, {method: 'DELETE'});
    window.location = '/';
}
