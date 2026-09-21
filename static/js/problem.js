let tabs = [];
let activeTabId = null;
let monacoEditors = {};
let saveTimeout = null;
let monacoReady = false;
let selectedRemindDays = 7;
let defaultLanguage = 'python';
let _toolbarInsertIdx = null;

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
    initClipboardPaste();
    initToolbarDrag();
    lazyEnrichDescription();

    if (typeof IS_DELETED !== 'undefined' && IS_DELETED) {
        document.querySelectorAll('.editor-toolbar-right button, .add-block-row button, .prob-edit-btn').forEach(
            btn => { btn.disabled = true; btn.style.opacity = '.3'; btn.style.pointerEvents = 'none'; }
        );
    }
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

let tabDragSrcIdx = null;

function renderVTabs() {
    const el = document.getElementById('vtabs');
    el.innerHTML = tabs.map((t, i) =>
        `<button class="vtab${t.id === activeTabId ? ' active' : ''}"
                 draggable="true" data-tab-idx="${i}"
                 onclick="switchTab(${t.id})" title="${t.title}">
            ${i + 1}
            <span class="vtab-label">${t.title}</span>
        </button>`
    ).join('') +
    `<button class="vtab vtab-add" onclick="createTab()" title="New approach">+</button>`;

    el.querySelectorAll('.vtab[draggable]').forEach(btn => {
        btn.addEventListener('dragstart', onTabDragStart);
        btn.addEventListener('dragend', onTabDragEnd);
        btn.addEventListener('dragover', onTabDragOver);
        btn.addEventListener('drop', onTabDrop);
    });
}

function onTabDragStart(e) {
    tabDragSrcIdx = parseInt(this.dataset.tabIdx);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabDragSrcIdx);
}

function onTabDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.vtab').forEach(b => b.classList.remove('tab-drop-above', 'tab-drop-below'));
    tabDragSrcIdx = null;
}

function onTabDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const idx = parseInt(this.dataset.tabIdx);
    document.querySelectorAll('.vtab').forEach(b => b.classList.remove('tab-drop-above', 'tab-drop-below'));
    if (idx === tabDragSrcIdx) return;
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
        this.classList.add('tab-drop-above');
    } else {
        this.classList.add('tab-drop-below');
    }
}

async function onTabDrop(e) {
    e.preventDefault();
    const isAbove = this.classList.contains('tab-drop-above');
    document.querySelectorAll('.vtab').forEach(b => b.classList.remove('tab-drop-above', 'tab-drop-below'));
    const fromIdx = tabDragSrcIdx;
    let toIdx = parseInt(this.dataset.tabIdx);
    if (fromIdx === null || fromIdx === toIdx) return;
    const [moved] = tabs.splice(fromIdx, 1);
    if (fromIdx < toIdx) toIdx--;
    if (!isAbove) toIdx++;
    tabs.splice(toIdx, 0, moved);
    renderVTabs();
    await fetch(`/api/problems/${PROBLEM_ID}/tabs/reorder`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tab_ids: tabs.map(t => t.id)}),
    });
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
    document.querySelectorAll('.block').forEach(b => {
        b.classList.remove('drag-over', 'drop-above', 'drop-below');
    });
    dragSrcIndex = null;
}

function onBlockDragOver(e) {
    if (_toolbarDragType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const idx = parseInt(this.dataset.index);
    if (idx === dragSrcIndex) return;
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.classList.remove('drop-above', 'drop-below');
    if (e.clientY < midY) {
        this.classList.add('drop-above');
    } else {
        this.classList.add('drop-below');
    }
}

function onBlockDragEnter(e) {
    e.preventDefault();
}

function onBlockDragLeave(e) {
    const rect = this.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
        this.classList.remove('drop-above', 'drop-below', 'drag-over');
    }
}

function onBlockDrop(e) {
    e.preventDefault();
    const isAbove = this.classList.contains('drop-above');
    this.classList.remove('drag-over', 'drop-above', 'drop-below');
    const fromIdx = dragSrcIndex;
    let toIdx = parseInt(this.dataset.index);
    if (fromIdx === null || fromIdx === toIdx) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    tab.content = collectTabContent();
    const [moved] = tab.content.splice(fromIdx, 1);
    if (fromIdx < toIdx) toIdx--;
    if (!isAbove) toIdx++;
    tab.content.splice(toIdx, 0, moved);
    renderBlocks(tab.content);
    scheduleSave();
}

// ── Toolbar button drag-to-insert ────────────────────────

let _tbDrag = null;

function initToolbarDrag() {
    document.querySelectorAll('.add-block-btn').forEach(btn => {
        let pressTimer = null;

        btn.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            const startX = e.clientX, startY = e.clientY;
            pressTimer = setTimeout(() => {
                _tbDrag = {type: btn.dataset.blockType, ghost: null};
                btn.classList.add('dragging');
                const ghost = btn.cloneNode(true);
                ghost.className = 'add-block-ghost';
                ghost.style.left = e.clientX + 'px';
                ghost.style.top = e.clientY + 'px';
                document.body.appendChild(ghost);
                _tbDrag.ghost = ghost;
            }, 300);

            const onMove = ev => {
                if (!_tbDrag && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
                    clearTimeout(pressTimer);
                }
                if (!_tbDrag) return;
                _tbDrag.ghost.style.left = ev.clientX + 'px';
                _tbDrag.ghost.style.top = ev.clientY + 'px';
                updateToolbarDropIndicator(ev.clientY);
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                clearTimeout(pressTimer);
                if (_tbDrag) {
                    const type = _tbDrag.type;
                    _tbDrag.ghost.remove();
                    btn.classList.remove('dragging');
                    const idx = resolveToolbarDropIdx();
                    clearToolbarDropIndicators();
                    _tbDrag = null;
                    if (idx !== null) {
                        _toolbarInsertIdx = idx;
                        if (type === 'lc-import') importLeetCodeCode();
                        else addBlock(type);
                    }
                } else {
                    const type = btn.dataset.blockType;
                    if (type === 'lc-import') importLeetCodeCode();
                    else addBlock(type);
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

function updateToolbarDropIndicator(clientY) {
    const container = document.getElementById('blocksContainer');
    const blocks = [...container.querySelectorAll('.block')];
    blocks.forEach(b => b.classList.remove('drop-above', 'drop-below'));
    container.classList.remove('toolbar-drop-end');
    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
            if (clientY < rect.top + rect.height / 2) block.classList.add('drop-above');
            else block.classList.add('drop-below');
            return;
        }
    }
    if (blocks.length) {
        const lastRect = blocks[blocks.length - 1].getBoundingClientRect();
        if (clientY > lastRect.bottom) container.classList.add('toolbar-drop-end');
        const firstRect = blocks[0].getBoundingClientRect();
        if (clientY < firstRect.top) blocks[0].classList.add('drop-above');
    }
}

function resolveToolbarDropIdx() {
    const container = document.getElementById('blocksContainer');
    const blocks = [...container.querySelectorAll('.block')];
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].classList.contains('drop-above')) return i;
        if (blocks[i].classList.contains('drop-below')) return i + 1;
    }
    if (container.classList.contains('toolbar-drop-end')) return blocks.length;
    return null;
}

function clearToolbarDropIndicators() {
    document.querySelectorAll('.block').forEach(b => b.classList.remove('drop-above', 'drop-below'));
    document.getElementById('blocksContainer').classList.remove('toolbar-drop-end');
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
    _insertBlock(tab, block);
}

function _insertBlock(tab, block) {
    if (_toolbarInsertIdx !== null) {
        tab.content.splice(_toolbarInsertIdx, 0, block);
        _toolbarInsertIdx = null;
    } else {
        tab.content.push(block);
    }
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
    const h = Math.max(100, preview.offsetHeight);
    edit.style.height = h + 'px';
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

let allRevisions = [];

function buildNumberLine(revisions, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const count = revisions.length;
    if (count === 0) { el.innerHTML = ''; return; }
    const maxShow = Math.min(count, 20);
    // LTR: oldest first
    const shown = revisions.slice(-maxShow).reverse();
    const parts = [];
    for (let i = 0; i < shown.length; i++) {
        const r = shown[i];
        const d = new Date(r.revised_at);
        const label = d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
        parts.push(`<div class="number-line-node" title="${r.revised_at}">
            <div class="number-line-dot"></div>
            <div class="number-line-label">${label}</div>
        </div>`);
        if (i < shown.length - 1) {
            const next = new Date(shown[i + 1].revised_at);
            const gap = Math.max(1, Math.round((next - d) / 86400000));
            parts.push(`<div class="number-line-connector"><span class="number-line-gap">${gap}d</span></div>`);
        }
    }
    el.innerHTML = `<div class="number-line">${
        count > maxShow ? `<div class="number-line-more">+${count - maxShow}</div><div class="number-line-connector"></div>` : ''
    }${parts.join('')}</div>`;
}

async function loadRevisions() {
    const resp = await fetch(`/api/problems/${PROBLEM_ID}/revisions`);
    allRevisions = await resp.json();
    const dotsEl = document.getElementById('revisionDots');
    const maxDots = Math.min(allRevisions.length, 10);
    dotsEl.innerHTML = Array(maxDots).fill('<div class="revision-dot"></div>').join('');

    const lastInfo = document.getElementById('lastRevisedInfo');
    if (lastInfo && allRevisions.length > 0) {
        const last = allRevisions[0];
        const d = new Date(last.revised_at);
        const ago = daysSince(d);
        lastInfo.textContent = `Last revised: ${d.toLocaleDateString()} (${ago})`;
    }
}

function daysSince(d) {
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return '1 day ago';
    return `${diff} days ago`;
}

function showRevisedPopup() {
    document.getElementById('revisedModal').classList.remove('hidden');
    document.getElementById('revisedConfirmation').classList.add('hidden');
    buildNumberLine(allRevisions, 'revisionNumberLine');
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

    const resp = await fetch(`/api/problems/${PROBLEM_ID}/revise`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({remind_days: days}),
    });

    const countEl = document.getElementById('revisionCount');
    countEl.textContent = parseInt(countEl.textContent) + 1;

    const confirm = document.getElementById('revisedConfirmation');
    if (days && days > 0) {
        confirm.textContent = `You will be reminded to solve this in ${days} days again`;
        confirm.classList.remove('hidden');
        setTimeout(() => confirm.classList.add('hidden'), 5000);
    }

    setTimeout(() => closeRevisedPopup(), days ? 1500 : 300);
    loadRevisions();
}

async function confirmRevisedNoRemind() {
    await fetch(`/api/problems/${PROBLEM_ID}/revise`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({remind_days: 0}),
    });

    const countEl = document.getElementById('revisionCount');
    countEl.textContent = parseInt(countEl.textContent) + 1;

    const confirm = document.getElementById('revisedConfirmation');
    confirm.textContent = 'Revised! No reminder set.';
    confirm.classList.remove('hidden');
    setTimeout(() => { confirm.classList.add('hidden'); closeRevisedPopup(); }, 1500);
    loadRevisions();
}

function showRevisionHistory() {
    document.getElementById('revisionHistoryModal').classList.remove('hidden');
    buildNumberLine(allRevisions, 'historyNumberLine');
    const list = document.getElementById('revisionHistoryList');
    if (allRevisions.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">No revisions yet</div>';
        return;
    }
    list.innerHTML = allRevisions.map((r, i) => {
        const d = new Date(r.revised_at);
        const num = allRevisions.length - i;
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--success);font-weight:600;font-family:var(--font-mono);min-width:28px;font-size:12px">#${num}</span>
            <span style="font-size:13px">${d.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'})}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:auto">${daysSince(d)}</span>
        </div>`;
    }).join('');
}

function closeRevisionHistory() {
    document.getElementById('revisionHistoryModal').classList.add('hidden');
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
    if (!confirm('Move this problem to trash? It will be permanently deleted after 7 days.')) return;
    await fetch(`/api/problems/${PROBLEM_ID}`, {method: 'DELETE'});
    window.location = '/';
}

async function recoverProblem() {
    await fetch(`/api/problems/${PROBLEM_ID}/restore`, {method: 'POST'});
    location.reload();
}

async function permDeleteFromView() {
    if (!confirm('Permanently delete this problem? This cannot be undone.')) return;
    await fetch(`/api/problems/${PROBLEM_ID}?permanent=1`, {method: 'DELETE'});
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
    _insertBlock(tab, {type: 'image', src, caption: ''});
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
    _insertBlock(tab, block);
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

// ── Clipboard paste for images ───────────────────────────

function initClipboardPaste() {
    document.addEventListener('paste', (e) => {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' ||
            active.isContentEditable)) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        let imageFile = null;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                imageFile = item.getAsFile();
                break;
            }
        }

        if (imageFile) {
            e.preventDefault();
            uploadImageFile(imageFile);
        } else if (items.length > 0) {
            let hasNonText = false;
            for (const item of items) {
                if (!item.type.startsWith('text/')) { hasNonText = true; break; }
            }
            if (hasNonText) {
                showPasteWarning();
            }
        }
    });
}

let pasteWarningTimeout = null;
function showPasteWarning() {
    let el = document.getElementById('pasteWarning');
    if (!el) {
        el = document.createElement('div');
        el.id = 'pasteWarning';
        el.className = 'paste-warning';
        document.body.appendChild(el);
    }
    el.textContent = 'Clipboard content is not an image';
    el.classList.remove('hidden');
    clearTimeout(pasteWarningTimeout);
    pasteWarningTimeout = setTimeout(() => el.classList.add('hidden'), 3000);
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
        if (listResp.status === 401) { setStatus('Log in to LeetCode from the home page Settings first.', 'var(--hard)'); return; }
        const list = await listResp.json();
        const subs = list.submissions || [];
        const accepted = subs.find(s => s.statusDisplay === 'Accepted') || subs[0];
        if (!accepted) { setStatus('No submissions found for this problem.', 'var(--hard)'); return; }

        const codeResp = await fetch(`/api/leetcode/submission/${accepted.id}`);
        const detail = await codeResp.json();
        if (!detail.code) { setStatus('Could not retrieve the submission code.', 'var(--hard)'); return; }

        const lang = (detail.lang && detail.lang.name) || accepted.lang;
        const block = {type: 'code', language: mapLcLang(lang), content: detail.code};

        const tab = tabs.find(t => t.id === activeTabId);
        if (!tab) { setStatus('No active tab to import into.', 'var(--hard)'); return; }
        _insertBlock(tab, block);

        if (accepted.timestamp) {
            const solvedIso = new Date(accepted.timestamp * 1000).toISOString();
            fetch(`/api/problems/${PROBLEM_ID}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({created_at: solvedIso, imported: 0}),
            });
        }
        setStatus('Imported code block into current tab.', 'var(--success)');
    } catch {
        setStatus('Failed to reach LeetCode.', 'var(--hard)');
    }
}
