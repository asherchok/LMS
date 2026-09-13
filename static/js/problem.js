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

function getMermaidTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark';
}

function rerenderMermaid() {
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize({startOnLoad: false, theme: getMermaidTheme()});
    document.querySelectorAll('.mermaid[data-mermaid-src]').forEach(el => {
        el.removeAttribute('data-processed');
        el.innerHTML = '';
        el.textContent = el.getAttribute('data-mermaid-src');
    });
    try { mermaid.run(); } catch {}
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
                    'editor.background': '#faf6f0',
                    'editor.lineHighlightBackground': '#f0ebe2',
                    'editorGutter.background': '#f5f0e8',
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
        rerenderMermaid();
    };

    loadMonaco(() => {
        loadTabs();
        loadRevisions();
    });

    initImageDrop();
    initVideoDrop();
    lazyEnrichDescription();
});

// ── Lazy description sync ─────────────────────────────────
// Imported problems have no description until opened. Fetch it from LeetCode
// (public) on first view so the page becomes a proper problem environment.

async function lazyEnrichDescription() {
    const el = document.getElementById('probDescription');
    if (!el || !PROBLEM_SLUG) return;
    if (el.textContent.trim()) return;   // already has a description
    el.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Loading problem from LeetCode…</span>';
    try {
        const resp = await fetch(`/api/problems/${PROBLEM_ID}/enrich`, {method: 'POST'});
        const data = await resp.json();
        if (data.enriched && data.problem) {
            el.innerHTML = data.problem.description || '';
            if (typeof renderMathInElement !== 'undefined') {
                try {
                    renderMathInElement(el, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                        ],
                        throwOnError: false,
                    });
                } catch {}
            }
            renderProblemTags(data.problem.tags || []);
        } else {
            el.innerHTML = '';
        }
    } catch {
        el.innerHTML = '';
    }
}

function renderProblemTags(tags) {
    const wrap = document.getElementById('probTags');
    if (!wrap || !tags.length) return;
    if (wrap.querySelector('.prob-tag')) return;   // don't duplicate
    wrap.innerHTML = tags.map(t => `<span class="prob-tag">${t}</span>`).join('');
}

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

let dragSrcIndex = null;

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
            return `<div class="block" data-index="${i}" draggable="false">
                <div class="block-toolbar">
                    <div class="block-toolbar-left">
                        <span class="block-type-label">Code</span>
                        <select class="lang-select" data-index="${i}" onchange="changeLang(${i}, this.value)">
                            ${langOptions(block.language || defaultLanguage)}
                        </select>
                    </div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">&times;</button>
                </div>
                <div class="monaco-container" id="monaco-${i}"></div>
            </div>`;
        } else if (block.type === 'image') {
            return `<div class="block" data-index="${i}" draggable="false">
                <div class="block-toolbar">
                    <div class="block-toolbar-left"><span class="block-type-label">Image</span></div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">&times;</button>
                </div>
                <div class="media-block-content">
                    <img src="${escapeAttr(block.src)}" alt="${escapeAttr(block.caption || '')}">
                </div>
            </div>`;
        } else if (block.type === 'video') {
            let vc;
            if (block.source_type === 'youtube' && block.video_id) {
                vc = `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${escapeAttr(block.video_id)}" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe></div>`;
            } else if (block.source_type === 'upload') {
                vc = `<video controls src="${escapeAttr(block.src)}"></video>`;
            } else {
                const thumb = block.thumbnail
                    ? `<img src="${escapeAttr(block.thumbnail)}" alt="">`
                    : `<div class="video-no-thumb"></div>`;
                vc = `<a href="${escapeAttr(block.src)}" target="_blank" rel="noopener" class="video-link">${thumb}<div class="video-link-label">Open video ↗</div></a>`;
            }
            return `<div class="block" data-index="${i}" draggable="false">
                <div class="block-toolbar">
                    <div class="block-toolbar-left"><span class="block-type-label">Video</span></div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">&times;</button>
                </div>
                <div class="media-block-content">${vc}</div>
            </div>`;
        } else {
            return `<div class="block" data-index="${i}" draggable="false">
                <div class="block-toolbar">
                    <div class="block-toolbar-left">
                        <span class="block-type-label">Commentary</span>
                    </div>
                    <button class="block-delete" onclick="removeBlock(${i})" title="Delete block">&times;</button>
                </div>
                <div class="md-toolbar" id="md-toolbar-${i}" style="display:none" onmousedown="event.preventDefault()">
                    <button onclick="mdInsert(${i},'**','**')" title="Bold"><b>B</b></button>
                    <button onclick="mdInsert(${i},'*','*')" title="Italic"><i>I</i></button>
                    <button onclick="mdInsert(${i},'<u>','</u>')" title="Underline"><u>U</u></button>
                    <div class="sep"></div>
                    <button onclick="mdInsert(${i},'# ','')" title="H1">H1</button>
                    <button onclick="mdInsert(${i},'## ','')" title="H2">H2</button>
                    <button onclick="mdInsert(${i},'### ','')" title="H3">H3</button>
                    <div class="sep"></div>
                    <span class="md-color-group" title="Text color">
                        <span class="md-group-label">A</span>
                        <span class="md-color-dot" style="background:#ff4f64" onclick="mdColor(${i},'#ff4f64')"></span>
                        <span class="md-color-dot" style="background:#00c9a7" onclick="mdColor(${i},'#00c9a7')"></span>
                        <span class="md-color-dot" style="background:#4dabf7" onclick="mdColor(${i},'#4dabf7')"></span>
                        <span class="md-color-dot" style="background:#ffb800" onclick="mdColor(${i},'#ffb800')"></span>
                        <span class="md-color-dot" style="background:#cc5de8" onclick="mdColor(${i},'#cc5de8')"></span>
                        <span class="md-color-dot" style="background:#f0a030" onclick="mdColor(${i},'#f0a030')"></span>
                    </span>
                    <div class="sep"></div>
                    <span class="md-color-group" title="Highlight">
                        <span class="md-group-label">H</span>
                        <span class="md-hl-dot" style="background:#ff4f6440;border-color:#ff4f64" onclick="mdHighlight(${i},'#ff4f6440')"></span>
                        <span class="md-hl-dot" style="background:#00c9a740;border-color:#00c9a7" onclick="mdHighlight(${i},'#00c9a740')"></span>
                        <span class="md-hl-dot" style="background:#4dabf740;border-color:#4dabf7" onclick="mdHighlight(${i},'#4dabf740')"></span>
                        <span class="md-hl-dot" style="background:#ffb80040;border-color:#ffb800" onclick="mdHighlight(${i},'#ffb80040')"></span>
                        <span class="md-hl-dot" style="background:#cc5de840;border-color:#cc5de8" onclick="mdHighlight(${i},'#cc5de840')"></span>
                        <span class="md-hl-dot" style="background:#f0a03040;border-color:#f0a030" onclick="mdHighlight(${i},'#f0a03040')"></span>
                    </span>
                    <div class="sep"></div>
                    <button onclick="mdInsert(${i},'$','$')" title="Inline math">&sum;</button>
                    <button onclick="mdInsert(${i},'\\n$$\\n','\\n$$\\n')" title="Block math">&sum;&sum;</button>
                    <button onclick="mdInsertDiagram(${i})" title="Diagram">&#x25C8;</button>
                </div>
                <div class="markdown-preview" id="md-preview-${i}"
                     onclick="editMarkdown(${i})">${renderMarkdown(block.content || '')}</div>
                <textarea class="markdown-edit hidden" id="md-edit-${i}"
                          onblur="saveMarkdown(${i})"
                          oninput="scheduleSave()">${escapeHtml(block.content || '')}</textarea>
            </div>`;
        }
    }).join('');

    container.querySelectorAll('.block').forEach(el => {
        el.addEventListener('dragstart', onBlockDragStart);
        el.addEventListener('dragend', onBlockDragEnd);
        el.addEventListener('dragover', onBlockDragOver);
        el.addEventListener('dragenter', onBlockDragEnter);
        el.addEventListener('dragleave', onBlockDragLeave);
        el.addEventListener('drop', onBlockDrop);
        // Only allow drag from toolbar, not from editor/textarea content
        el.setAttribute('draggable', 'false');
        const toolbar = el.querySelector('.block-toolbar');
        if (toolbar) {
            toolbar.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
            toolbar.addEventListener('mouseup', () => el.setAttribute('draggable', 'false'));
        }
    });

    blocks.forEach((block, i) => {
        if (block.type === 'code' && monacoReady) {
            const cont = document.getElementById(`monaco-${i}`);
            if (!cont) return;
            const editor = monaco.editor.create(cont, {
                value: block.content || '',
                language: block.language || defaultLanguage,
                theme: getMonacoTheme(),
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
                cont.style.height = h + 'px';
                editor.layout();
            });
            const initH = Math.min(600, Math.max(80, editor.getContentHeight()));
            cont.style.height = initH + 'px';
            editor.layout();
            monacoEditors[i] = editor;
        }
    });
}

// ── Block drag-and-drop ──────────────────────────────────

function onBlockDragStart(e) {
    dragSrcIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcIndex);
}

function onBlockDragEnd() {
    this.classList.remove('dragging');
    this.setAttribute('draggable', 'false');
    document.querySelectorAll('.block').forEach(b => b.classList.remove('drag-over'));
    dragSrcIndex = null;
}

function onBlockDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function onBlockDragEnter(e) {
    e.preventDefault();
    const idx = parseInt(this.dataset.index);
    if (idx !== dragSrcIndex) this.classList.add('drag-over');
}

function onBlockDragLeave() {
    this.classList.remove('drag-over');
}

function onBlockDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    const fromIdx = dragSrcIndex;
    const toIdx = parseInt(this.dataset.index);
    if (fromIdx === null || fromIdx === toIdx) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    tab.content = collectTabContent();
    const [moved] = tab.content.splice(fromIdx, 1);
    tab.content.splice(toIdx, 0, moved);
    renderBlocks(tab.content);
    scheduleSave();
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
    if (type === 'image') { showImageModal(); return; }
    if (type === 'video') { showVideoModal(); return; }
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
            const src = el.textContent;
            mermaidDiv.textContent = src;
            mermaidDiv.setAttribute('data-mermaid-src', src);
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

function mdHighlight(idx, color) {
    if (!color) return;
    mdInsert(idx, `<mark style="background:${color}">`, '</mark>');
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
        } else if (block.type === 'image') {
            return {type: 'image', src: block.src, caption: block.caption || ''};
        } else if (block.type === 'video') {
            return {type: 'video', src: block.src, source_type: block.source_type,
                    video_id: block.video_id || null, thumbnail: block.thumbnail || null};
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

let saveStatusTimeout = null;

function showSaveStatus(state) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    clearTimeout(saveStatusTimeout);
    el.className = 'save-status';
    void el.offsetHeight;
    if (state === 'saving') {
        el.textContent = 'Saving...';
        el.className = 'save-status visible saving';
    } else if (state === 'saved') {
        el.textContent = 'Saved';
        el.className = 'save-status visible saved';
        saveStatusTimeout = setTimeout(() => { el.className = 'save-status'; }, 2000);
    }
}

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 1000);
}

async function doSave() {
    if (!activeTabId) return;
    showSaveStatus('saving');
    const content = collectTabContent();
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) tab.content = content;
    await fetch(`/api/tabs/${activeTabId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({content}),
    });
    showSaveStatus('saved');
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

function escapeAttr(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Image modal ──────────────────────────────────────────

function showImageModal() {
    document.getElementById('imageModal').classList.remove('hidden');
    document.getElementById('imageUrlInput').value = '';
    document.getElementById('imageUploadStatus').textContent = '';
}

function closeImageModal() {
    document.getElementById('imageModal').classList.add('hidden');
}

function insertImageFromUrl() {
    const url = document.getElementById('imageUrlInput').value.trim();
    if (!url) return;
    insertImageBlock(url);
    closeImageModal();
}

function insertImageBlock(src) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.content = collectTabContent();
    tab.content.push({type: 'image', src, caption: ''});
    renderBlocks(tab.content);
    scheduleSave();
}

function initImageDrop() {
    const zone = document.getElementById('imageDropZone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) uploadImageFile(file);
    });
}

function pickImageFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => { if (inp.files[0]) uploadImageFile(inp.files[0]); };
    inp.click();
}

async function uploadImageFile(file) {
    const status = document.getElementById('imageUploadStatus');
    status.textContent = 'Uploading...';
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/upload', {method: 'POST', body: fd});
    const data = await resp.json();
    if (data.url) {
        insertImageBlock(data.url);
        closeImageModal();
    } else {
        status.textContent = 'Upload failed';
    }
}

// ── Video modal ──────────────────────────────────────────

function showVideoModal() {
    document.getElementById('videoModal').classList.remove('hidden');
    document.getElementById('videoUrlInput').value = '';
    document.getElementById('videoUploadStatus').textContent = '';
}

function closeVideoModal() {
    document.getElementById('videoModal').classList.add('hidden');
}

async function insertVideoFromUrl() {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (!url) return;
    const status = document.getElementById('videoUploadStatus');
    status.textContent = 'Fetching preview...';
    try {
        const resp = await fetch('/api/video-thumbnail', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url}),
        });
        const data = await resp.json();
        const block = {
            type: 'video', src: url,
            source_type: data.type || 'url',
            video_id: data.video_id || null,
            thumbnail: data.thumbnail || null,
        };
        insertVideoBlock(block);
        closeVideoModal();
    } catch {
        status.textContent = 'Failed to fetch preview';
    }
}

function insertVideoBlock(block) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.content = collectTabContent();
    tab.content.push(block);
    renderBlocks(tab.content);
    scheduleSave();
}

function initVideoDrop() {
    const zone = document.getElementById('videoDropZone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) uploadVideoFile(file);
    });
}

function pickVideoFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'video/*';
    inp.onchange = () => { if (inp.files[0]) uploadVideoFile(inp.files[0]); };
    inp.click();
}

async function uploadVideoFile(file) {
    const status = document.getElementById('videoUploadStatus');
    status.textContent = 'Uploading...';
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/upload', {method: 'POST', body: fd});
    const data = await resp.json();
    if (data.url) {
        insertVideoBlock({type: 'video', src: data.url, source_type: 'upload', video_id: null, thumbnail: null});
        closeVideoModal();
    } else {
        status.textContent = 'Upload failed';
    }
}

// ── LeetCode: import my accepted submission (on-demand) ────

// Map LeetCode language slugs to this editor's language values.
const LC_LANG_MAP = {
    python: 'python', python3: 'python', pythondata: 'python',
    golang: 'go', bash: 'shell',
    mysql: 'sql', mssql: 'sql', oraclesql: 'sql',
};

function mapLcLang(lc) {
    if (!lc) return defaultLanguage;
    const known = ['python','cpp','javascript','typescript','java','c','csharp','go',
                   'rust','ruby','swift','kotlin','scala','sql','shell'];
    return LC_LANG_MAP[lc] || (known.includes(lc) ? lc : 'plaintext');
}

async function importLeetCodeCode() {
    const status = document.getElementById('lcImportStatus');
    const setStatus = (m, c) => { status.textContent = m; status.style.color = c || 'var(--text-muted)'; };
    if (!PROBLEM_SLUG) {
        setStatus('No LeetCode slug on this problem — set the LeetCode # and re-fetch first.', 'var(--hard)');
        return;
    }
    setStatus('Fetching your submissions from LeetCode…');
    try {
        const listResp = await fetch(`/api/leetcode/submissions/${PROBLEM_SLUG}`);
        if (listResp.status === 401) {
            const err = await listResp.json().catch(() => ({}));
            setStatus(err.message || 'Log in to LeetCode from the home page Settings first.', 'var(--hard)');
            return;
        }
        const list = await listResp.json();
        const subs = list.submissions || [];
        const accepted = subs.find(s => s.statusDisplay === 'Accepted') || subs[0];
        if (!accepted) { setStatus('No submissions found for this problem.', 'var(--hard)'); return; }

        const codeResp = await fetch(`/api/leetcode/submission/${accepted.id}`);
        const detail = await codeResp.json();
        if (!detail.code) { setStatus('Could not retrieve the submission code.', 'var(--hard)'); return; }

        const when = accepted.timestamp
            ? new Date(accepted.timestamp * 1000).toLocaleDateString() : '';
        const lang = (detail.lang && detail.lang.name) || accepted.lang;
        const blocks = [
            {type: 'markdown',
             content: `**Imported from LeetCode** — ${accepted.statusDisplay || 'Accepted'}`
                 + `${when ? ' · ' + when : ''}`
                 + `${accepted.runtime ? ' · ' + accepted.runtime : ''}`
                 + `${accepted.memory ? ' · ' + accepted.memory : ''}`},
            {type: 'code', language: mapLcLang(lang), content: detail.code},
        ];

        // Land the import in its OWN new tab so existing notes are never
        // touched, even if this problem already had approaches.
        saveCurrentTab();
        const tabResp = await fetch(`/api/problems/${PROBLEM_ID}/tabs`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title: when ? `LeetCode · ${when}` : 'LeetCode Submission'}),
        });
        const newTab = await tabResp.json();
        await fetch(`/api/tabs/${newTab.id}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({content: blocks}),
        });
        await loadTabs();
        switchTab(newTab.id);

        // Activate the problem on its real solve date (clears the imported flag
        // so it now shows on the calendar on the day it was actually solved).
        if (accepted.timestamp) {
            const solvedIso = new Date(accepted.timestamp * 1000).toISOString();
            fetch(`/api/problems/${PROBLEM_ID}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({created_at: solvedIso, imported: 0}),
            });
        }
        setStatus('Imported into a new tab.', 'var(--success)');
    } catch {
        setStatus('Failed to reach LeetCode.', 'var(--hard)');
    }
}
