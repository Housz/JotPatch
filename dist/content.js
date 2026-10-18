"use strict";
var JP;
(function (JP) {
    // A precise page URL (including meaningful query parameters) is the Phase 0 scope.
    // Fragment-only navigations are not distinguished unless they contain a hash route.
    function pageKey(href) {
        const url = new URL(href);
        for (const key of [...url.searchParams.keys()]) {
            if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid)$/i.test(key)) {
                url.searchParams.delete(key);
            }
        }
        url.searchParams.sort();
        const hashRoute = /^#(?:\/|!)/.test(url.hash) ? url.hash : '';
        return `${url.origin}${url.pathname}${url.search}${hashRoute}`;
    }
    JP.pageKey = pageKey;
})(JP || (JP = {}));
var JP;
(function (JP) {
    const EXCLUDED = 'script, style, noscript, textarea, select, option, input, button, svg, template, [contenteditable], [hidden], [aria-hidden="true"], [data-jotpatch-exclude]';
    const CONTEXT = 48;
    const MAX_QUOTE = 1600;
    const MAX_INDEX_CHARS = 2_000_000;
    /** Stable-enough Stage 0 linear text index. Never traverses the extension Shadow DOM. */
    function buildTextIndex(root = document.body) {
        const nodes = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const text = node;
                if (!text.data || !text.parentElement || text.parentElement.closest(EXCLUDED)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let text = '';
        let truncated = false;
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (text.length + node.length > MAX_INDEX_CHARS) {
                truncated = true;
                break;
            }
            const start = text.length;
            text += node.data;
            nodes.push({ node, start, end: text.length });
        }
        return { text, nodes, truncated };
    }
    JP.buildTextIndex = buildTextIndex;
    function boundaryOffset(index, node, offset) {
        if (node.nodeType === Node.TEXT_NODE) {
            const item = index.nodes.find((entry) => entry.node === node);
            if (!item)
                return null;
            return item.start + Math.max(0, Math.min(offset, item.end - item.start));
        }
        // Browsers frequently put selection boundaries on an element rather than
        // its first/last Text child (for example, selecting a whole paragraph).
        try {
            const point = document.createRange();
            point.setStart(node, offset);
            point.collapse(true);
            for (const entry of index.nodes) {
                if (point.comparePoint(entry.node, 0) > 0)
                    return entry.start;
            }
            return index.text.length;
        }
        catch {
            return null;
        }
    }
    function captureSelection(range, index) {
        if (range.collapsed)
            return null;
        const start = boundaryOffset(index, range.startContainer, range.startOffset);
        const end = boundaryOffset(index, range.endContainer, range.endOffset);
        if (start === null || end === null || end <= start || end - start > MAX_QUOTE)
            return null;
        const exact = index.text.slice(start, end);
        if (!exact.trim())
            return null;
        return {
            version: 1, type: 'text', exact,
            prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
            suffix: index.text.slice(end, end + CONTEXT), start, end
        };
    }
    JP.captureSelection = captureSelection;
    function toPoint(index, offset, isEnd) {
        for (const entry of index.nodes) {
            if (offset < entry.end || (isEnd && offset === entry.end)) {
                return { node: entry.node, offset: offset - entry.start };
            }
        }
        const last = index.nodes[index.nodes.length - 1];
        if (last && offset === last.end)
            return { node: last.node, offset: last.node.length };
        return null;
    }
    function makeRange(index, start, end) {
        const a = toPoint(index, start, false);
        const b = toPoint(index, end, true);
        if (!a || !b)
            return null;
        try {
            const range = document.createRange();
            range.setStart(a.node, a.offset);
            range.setEnd(b.node, b.offset);
            return range;
        }
        catch {
            return null;
        }
    }
    function commonSuffix(a, b) {
        let n = 0;
        while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n])
            n++;
        return n;
    }
    function commonPrefix(a, b) {
        let n = 0;
        while (n < a.length && n < b.length && a[n] === b[n])
            n++;
        return n;
    }
    /** Prefer verified quote + context; never trust the old character offset alone. */
    function resolveAnchor(anchor, index) {
        if (!anchor.exact || anchor.exact.length > MAX_QUOTE)
            return null;
        const candidates = [];
        let from = 0;
        // Bound pathological cases such as repeated single-character selections.
        while (candidates.length < 201) {
            const start = index.text.indexOf(anchor.exact, from);
            if (start < 0)
                break;
            const end = start + anchor.exact.length;
            const before = index.text.slice(Math.max(0, start - anchor.prefix.length), start);
            const after = index.text.slice(end, end + anchor.suffix.length);
            const context = commonSuffix(before, anchor.prefix) + commonPrefix(after, anchor.suffix);
            const distance = Math.abs(start - anchor.start);
            candidates.push({ start, context, score: context * 4 - Math.min(12, distance / 1000) });
            from = start + 1;
        }
        if (!candidates.length || candidates.length > 200)
            return null;
        candidates.sort((a, b) => b.score - a.score);
        const winner = candidates[0];
        const expected = anchor.prefix.length + anchor.suffix.length;
        // A low-context match can be a different occurrence left behind after deletion.
        // Strict enough to avoid silently relinking a removed quote to another
        // identical passage. At least one side of the saved context should survive.
        if (expected >= 12 && winner.context < Math.ceil(expected * 0.35))
            return null;
        if (candidates.length > 1 && winner.score - candidates[1].score < 2)
            return null;
        const range = makeRange(index, winner.start, winner.start + anchor.exact.length);
        if (!range)
            return null;
        return {
            range, start: winner.start, end: winner.start + anchor.exact.length,
            confidence: winner.start === anchor.start ? 'exact-position' : 'quote-context'
        };
    }
    JP.resolveAnchor = resolveAnchor;
})(JP || (JP = {}));
(function (JP) {
    /** Context-menu fallback only when the selected quotation occurs exactly once.
     *  Never fabricate an anchor for repeated text when the live Range is lost. */
    function uniqueQuoteRange(exact, index) {
        if (!exact.trim() || exact.length > 1600)
            return null;
        const first = index.text.indexOf(exact);
        if (first === -1 || index.text.indexOf(exact, first + 1) !== -1)
            return null;
        let start = null;
        let end = null;
        const targetEnd = first + exact.length;
        for (const item of index.nodes) {
            if (!start && item.start <= first && item.end > first)
                start = { node: item.node, offset: first - item.start };
            if (item.start < targetEnd && item.end >= targetEnd) {
                end = { node: item.node, offset: targetEnd - item.start };
                break;
            }
        }
        if (!start || !end)
            return null;
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
    }
    JP.uniqueQuoteRange = uniqueQuoteRange;
})(JP || (JP = {}));
var JP;
(function (JP) {
    const PREFIX = 'jotpatch:note:v1:';
    const PREFERENCES_KEY = 'jotpatch:preferences:v1';
    const COLORS = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
    const DEFAULTS = { color: 'yellow', width: 256, height: 202, offsetX: 0, offsetY: 0 };
    function appearance(note) {
        const style = note.appearance || {};
        return {
            color: COLORS.includes(style.color) ? style.color : DEFAULTS.color,
            width: Math.min(560, Math.max(180, Number(style.width) || DEFAULTS.width)),
            height: Math.min(620, Math.max(132, Number(style.height) || DEFAULTS.height)),
            offsetX: Number.isFinite(style.offsetX) ? style.offsetX : DEFAULTS.offsetX,
            offsetY: Number.isFinite(style.offsetY) ? style.offsetY : DEFAULTS.offsetY
        };
    }
    JP.appearance = appearance;
    class NoteRepository {
        static key(id) { return PREFIX + id; }
        async list(page) {
            const stored = await chrome.storage.local.get(null);
            const output = [];
            const staleDeletes = [];
            for (const [key, value] of Object.entries(stored)) {
                if (!key.startsWith(PREFIX) || !this.isNote(value) || value.pageKey !== page)
                    continue;
                if (value.deletedAt) {
                    if (Date.now() - value.deletedAt > 30_000)
                        staleDeletes.push(key);
                    continue;
                }
                output.push(value);
            }
            // A tombstone protects against stale page instances resurrecting a deletion.
            if (staleDeletes.length)
                void chrome.storage.local.remove(staleDeletes).catch(() => undefined);
            return output.sort((a, b) => a.createdAt - b.createdAt);
        }
        async get(id) {
            const value = (await chrome.storage.local.get(NoteRepository.key(id)))[NoteRepository.key(id)];
            return this.isNote(value) ? value : null;
        }
        async put(note) {
            await chrome.storage.local.set({ [NoteRepository.key(note.id)]: note });
        }
        async markDeleted(note) {
            await this.put({ ...note, deletedAt: Date.now(), updatedAt: Date.now(), revision: (note.revision || 0) + 1 });
        }
        async remove(id) {
            await chrome.storage.local.remove(NoteRepository.key(id));
        }
        noteFromChange(key, newValue) {
            return key.startsWith(PREFIX) && this.isNote(newValue) ? newValue : null;
        }
        async preferences() {
            const saved = (await chrome.storage.local.get(PREFERENCES_KEY))[PREFERENCES_KEY];
            const setting = saved && typeof saved === 'object' ? saved.selectionTrigger : null;
            return { selectionTrigger: setting === 'alt' || setting === 'off' ? setting : 'always' };
        }
        isNote(value) {
            if (!value || typeof value !== 'object')
                return false;
            const x = value;
            return x.schemaVersion === 1 && typeof x.id === 'string' && typeof x.pageKey === 'string' &&
                typeof x.text === 'string' && (!x.anchor || typeof x.anchor.exact === 'string') &&
                typeof x.createdAt === 'number' && typeof x.updatedAt === 'number';
        }
    }
    JP.NoteRepository = NoteRepository;
})(JP || (JP = {}));
var JP;
(function (JP) {
    JP.PAPER_STYLES = `
    :host{all:initial;font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#37342e}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    button{font:inherit;border:0;cursor:pointer} button:focus-visible,textarea:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .launcher{position:fixed;top:14px;right:42px;display:flex;gap:3px;align-items:center;padding:3px;
      background:#fffdf8f0;border:1px solid #e8e3d8;border-radius:20px;box-shadow:0 4px 16px #0002;pointer-events:auto}
    .launcher button{width:29px;height:29px;border-radius:50%;background:transparent;color:#5f5b51;font-size:17px}
    .launcher button:hover{background:#eee9df} .launcher button#jp-new{font-size:21px;line-height:26px}
    .bubble{position:fixed;z-index:20;pointer-events:auto;transform:translateY(-100%)}
    .bubble button{width:31px;height:31px;border-radius:50%;background:#fff8df;color:#7a612a;box-shadow:0 2px 12px #0003;
      border:1px solid #e7d59e;font-size:16px;line-height:30px;padding:0;text-align:center}
    .bubble button:hover{background:#ffe7a1;transform:scale(1.06)}
    .rail{position:fixed;right:7px;top:20%;height:60%;width:26px;border-radius:16px;background:#fffdf9dc;
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail-head{position:absolute;top:3px;left:2px;width:20px;height:20px;border-radius:50%;font-size:11px;
      background:#f0ece2;color:#615a4b;padding:0}
    .rail-track{position:absolute;top:28px;bottom:12px;left:3px;right:3px}
    .rail-pin{position:absolute;left:4px;width:12px;height:12px;border:1px solid #0002;border-radius:50%;
      box-shadow:0 1px 4px #0002;transform:translateY(-50%);padding:0}
    .rail-pin.missing{background:#aaa!important;border-style:dashed}
    .rail-pin:hover,.marker:hover{outline:2px solid #7562a4;outline-offset:2px}
    .list{position:fixed;right:40px;top:20%;width:255px;max-height:63vh;overflow:auto;pointer-events:auto;
      background:#fffefaf7;border:1px solid #eae5da;border-radius:9px;box-shadow:0 8px 26px #0002;padding:6px}
    .list-header{display:flex;justify-content:space-between;align-items:center;padding:7px 7px 10px;font-weight:600}
    .list-header button{background:transparent;color:#777;margin:0 3px;font-size:16px}
    .entry{width:100%;background:transparent;padding:9px 7px;display:flex;align-items:flex-start;gap:8px;
      border-top:1px solid #ece9e0;color:#34312e;text-align:left}
    .entry:hover{background:#f7f2e8}.entry .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin-top:5px}
    .entry strong{display:block;font-weight:550;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .entry small{display:block;color:#8b8477;font-size:11px}
    .marker{position:fixed;z-index:4;width:19px;height:19px;pointer-events:auto;border-radius:50%;padding:0;
      box-shadow:0 2px 7px #0003;color:#755d24;font-size:11px;border:1px solid #fff9}
    .paper{--paper:#fff1b8;position:fixed;z-index:8;background:var(--paper);border:1px solid #00000010;
      border-radius:5px;box-shadow:0 5px 18px #0002;pointer-events:auto;min-width:180px;min-height:132px;overflow:hidden}
    .paper:focus-within{box-shadow:0 6px 24px #0003}.paper:hover{box-shadow:0 6px 21px #0003}
    .note-editor,.note-preview{display:block;width:100%;height:100%;border:0;outline:none!important;resize:none;
      background:transparent;color:#393329;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;
      padding:30px 13px 26px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
    .note-editor::placeholder{color:#8d8270aa}.note-editor{caret-color:#534529}
    .note-preview{cursor:text}.note-preview p{margin:0 0 .25em}.note-preview ul,.note-preview ol{margin:0 0 .25em;padding-left:22px}
    .note-preview li{padding:0}.note-preview strong{font-weight:700}.note-preview em{font-style:italic}
    .note-tools{position:absolute;top:4px;left:4px;right:4px;display:flex;align-items:center;justify-content:space-between;
      opacity:.12;transition:opacity .12s ease;pointer-events:none}
    .paper:hover .note-tools,.paper:focus-within .note-tools{opacity:1;pointer-events:auto}
    .tool-group{display:flex;gap:1px;align-items:center}.note-tools button,.note-actions button{padding:0;width:23px;height:23px;
      border-radius:5px;background:transparent;color:#625743;font-size:13px;display:inline-flex;justify-content:center;align-items:center}
    .note-tools button:hover,.note-actions button:hover{background:#00000013}
    .drag-handle{cursor:grab;touch-action:none;user-select:none}.drag-handle:active{cursor:grabbing}
    .note-actions{position:absolute;bottom:3px;left:9px;right:18px;display:flex;align-items:center;gap:2px;
      opacity:0;transition:opacity .12s ease;pointer-events:none}
    .paper:hover .note-actions,.paper:focus-within .note-actions{opacity:.82;pointer-events:auto}
    .note-actions button{width:21px;height:20px;font-size:12px}.note-actions .spacer{flex:1}
    .resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;
      touch-action:none;opacity:.15;background:linear-gradient(135deg,transparent 55%,#736a5666 55%,#736a5666 60%,transparent 60%)}
    .paper:hover .resize-handle,.paper:focus-within .resize-handle{opacity:.75}
    .note-menu{position:absolute;right:5px;top:29px;width:190px;padding:7px;background:#fffcf4;border:1px solid #e2d9c4;
      border-radius:8px;box-shadow:0 7px 21px #0003;z-index:4}
    .colors{display:flex;gap:5px;padding:6px 4px 10px}.colors button{width:22px;height:22px;border-radius:50%;border:1px solid #0002;padding:0}
    .colors button[aria-pressed=true]{outline:2px solid #7567a1;outline-offset:2px}
    .menu-action{display:block;text-align:left;width:100%;padding:7px;border-radius:5px;background:transparent;color:#4b463b}
    .menu-action:hover{background:#eee8d8}.menu-action.danger{color:#9b4440}
    .save-indicator{position:absolute;bottom:7px;right:28px;font-size:11px;opacity:0;color:#625847;pointer-events:none}
    .paper[data-save=error] .save-indicator,.paper[data-save=conflict] .save-indicator{opacity:1;color:#9b4141}
    .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;pointer-events:auto;
      background:#34302c;color:#fff;border-radius:8px;padding:9px 12px;box-shadow:0 3px 14px #0003;
      display:flex;gap:12px;align-items:center;max-width:min(440px,92vw);font-size:12px}
    .toast button{background:transparent;color:#ffe1a0;font-weight:600;padding:4px;border-radius:4px}
  `;
})(JP || (JP = {}));
var JP;
(function (JP) {
    // Paper is the editor. No title bar, quote box, footer or permanent toolbar.
    const COLOR_HEX = {
        yellow: '#FFF1B8', pink: '#FBE1E9', green: '#DFF1DD',
        blue: '#DAECFF', purple: '#EAE2FA', gray: '#F0EFEC'
    };
    const COLOR_ORDER = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
    const PREFERENCE_KEY = 'jotpatch:preferences:v1';
    function el(tag, className) {
        const item = document.createElement(tag);
        if (className)
            item.className = className;
        return item;
    }
    function visibleRect(range) {
        for (const rect of Array.from(range.getClientRects()))
            if (rect.width > 0 && rect.height > 0)
                return rect;
        const rect = range.getBoundingClientRect();
        return rect.height ? rect : null;
    }
    function id() {
        if (typeof crypto.randomUUID === 'function')
            return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    function clamp(x, lo, hi) { return Math.max(lo, Math.min(Math.max(lo, hi), x)); }
    class JotPatchApp {
        repo = new JP.NoteRepository();
        page = JP.pageKey(location.href);
        notes = [];
        matches = new Map();
        index = null;
        host;
        shadow;
        observer;
        pendingRange = null;
        openIds = new Set();
        cards = new Map();
        visible = true;
        launcherOpen = false;
        listOpen = false;
        selectionTrigger = 'always';
        refreshTimer = 0;
        scrollScheduled = false;
        loadRequest = 0;
        toastTimer = 0;
        zOrder = 8;
        writeTimers = new Map();
        writeChains = new Map();
        knownRevisions = new Map();
        dirty = new Set();
        conflicts = new Set();
        ownWrites = new Set();
        deletedUndo = null;
        async start() {
            this.mount();
            this.setupEvents();
            void this.loadPreferences();
            await this.loadPage();
            this.observer = new MutationObserver(() => this.scheduleRefresh());
            this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            // SPA navigation without injecting into page-owned history functions.
            window.setInterval(() => this.checkPageRoute(), 1400);
        }
        toggle() {
            this.visible = !this.visible;
            this.host.hidden = !this.visible;
            if (this.visible) {
                this.launcherOpen = true;
                this.renderLauncher();
                this.scheduleRefresh();
            }
        }
        openLauncher() {
            this.visible = true;
            this.host.hidden = false;
            this.launcherOpen = true;
            this.renderLauncher();
            this.scheduleRefresh();
        }
        toggleLauncher() {
            if (!this.visible) {
                this.openLauncher();
                return;
            }
            this.launcherOpen = !this.launcherOpen;
            this.renderLauncher();
        }
        mount() {
            this.host = el('div');
            this.host.id = 'jotpatch-root';
            this.host.setAttribute('data-jotpatch-exclude', '');
            this.host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
            this.shadow = this.host.attachShadow({ mode: 'open' });
            this.shadow.innerHTML = `
        <style>${JP.PAPER_STYLES}</style>
        <div class="launcher" id="jp-launcher" hidden aria-label="JotPatch 快捷操作">
          <button id="jp-new" aria-label="新建本页便签" title="新建本页便签" type="button">+</button>
          <button id="jp-settings" aria-label="设置" title="设置" type="button">⚙</button>
          <button id="jp-hide" aria-label="隐藏 JotPatch" title="隐藏便签" type="button">−</button>
        </div>
        <div class="bubble" id="jp-bubble" hidden><button id="jp-bubble-pin" aria-label="将便签钉在选中文字旁" title="贴便签" type="button">📌</button></div>
        <nav id="jp-rail" class="rail" aria-label="本页便签导航" hidden>
          <button id="jp-list-toggle" class="rail-head" title="本页便签列表" type="button">0</button>
          <div class="rail-track" id="jp-rail-track"></div>
        </nav>
        <aside id="jp-list" class="list" aria-label="本页便签列表" hidden></aside>
        <div id="jp-markers"></div>
        <div id="jp-cards"></div>
        <div id="jp-toast" class="toast" role="status" aria-live="polite" hidden><span id="jp-toast-text"></span><button id="jp-undo" type="button" hidden>撤销</button></div>`;
            (document.body || document.documentElement).appendChild(this.host);
        }
        $(selector) {
            const node = this.shadow.querySelector(selector);
            if (!node)
                throw new Error(`Missing JotPatch UI: ${selector}`);
            return node;
        }
        setupEvents() {
            this.$('#jp-new').addEventListener('click', () => void this.createPageNote());
            this.$('#jp-hide').addEventListener('click', () => this.toggle());
            this.$('#jp-settings').addEventListener('click', () => this.openSettings());
            this.$('#jp-bubble-pin').addEventListener('pointerdown', e => e.preventDefault());
            this.$('#jp-bubble-pin').addEventListener('click', () => void this.createFromSelection());
            this.$('#jp-list-toggle').addEventListener('click', () => {
                this.listOpen = !this.listOpen;
                this.renderList();
            });
            this.$('#jp-undo').addEventListener('click', () => void this.undoDeletion());
            document.addEventListener('mouseup', e => this.maybeOfferSelection(e.target, e.altKey));
            document.addEventListener('keyup', e => {
                if (e.key.startsWith('Arrow') || e.key === 'Shift')
                    this.maybeOfferSelection(e.target, e.altKey);
            });
            document.addEventListener('contextmenu', e => this.rememberSelection(e.target));
            window.addEventListener('scroll', () => this.schedulePosition(), true);
            window.addEventListener('resize', () => this.schedulePosition());
            window.addEventListener('hashchange', () => this.checkPageRoute());
            window.addEventListener('popstate', () => this.checkPageRoute());
            chrome.runtime.onMessage.addListener((message, _sender, respond) => {
                if (message.type === 'JP_PING') {
                    respond({ ready: true });
                    return false;
                }
                if (message.type === 'JP_TOGGLE_UI') {
                    this.toggle();
                    respond({ ok: true });
                    return false;
                }
                if (message.type === 'JP_OPEN_LAUNCHER') {
                    this.openLauncher();
                    respond({ ok: true });
                    return false;
                }
                if (message.type === 'JP_TOGGLE_LAUNCHER') {
                    this.toggleLauncher();
                    respond({ ok: true });
                    return false;
                }
                if (message.type === 'JP_CREATE_FROM_CONTEXT') {
                    this.openLauncher();
                    void this.createFromContext(message.selectionText || '').then(ok => respond({ ok }), () => respond({ ok: false }));
                    return true;
                }
                return false;
            });
            chrome.storage.onChanged?.addListener((changes, area) => {
                if (area !== 'local')
                    return;
                if (changes[PREFERENCE_KEY]) {
                    const trigger = changes[PREFERENCE_KEY].newValue?.selectionTrigger;
                    this.selectionTrigger = trigger === 'alt' || trigger === 'off' ? trigger : 'always';
                    this.$('#jp-bubble').hidden = true;
                }
                for (const [key, change] of Object.entries(changes)) {
                    const fresh = this.repo.noteFromChange(key, change.newValue);
                    if (fresh && !this.ownWrites.has(fresh.id) && fresh.pageKey === this.page)
                        this.syncExternalNote(fresh);
                }
            });
        }
        async loadPreferences() {
            try {
                this.selectionTrigger = (await this.repo.preferences()).selectionTrigger;
            }
            catch {
                this.selectionTrigger = 'always';
            }
        }
        openSettings() {
            void chrome.runtime.sendMessage({ type: 'JP_OPEN_SITE_SETUP' }).catch(() => this.toast('请从扩展管理页打开 JotPatch 设置。'));
        }
        renderLauncher() { this.$('#jp-launcher').hidden = !this.launcherOpen; }
        checkPageRoute() {
            const next = JP.pageKey(location.href);
            if (next === this.page)
                return;
            for (const id of this.openIds)
                void this.saveNow(id);
            this.page = next;
            this.pendingRange = null;
            this.$('#jp-bubble').hidden = true;
            this.openIds.clear();
            this.cards.clear();
            this.$('#jp-cards').replaceChildren();
            this.listOpen = false;
            void this.loadPage();
        }
        async loadPage() {
            const request = ++this.loadRequest;
            const page = this.page;
            try {
                const notes = await this.repo.list(page);
                if (request !== this.loadRequest || page !== this.page)
                    return;
                this.notes = notes;
                for (const note of notes)
                    this.knownRevisions.set(note.id, note.revision || 0);
                this.refreshAnchors();
            }
            catch (error) {
                console.warn('JotPatch load failed', error);
                this.toast('便签读取失败，请检查扩展存储');
            }
        }
        rememberSelection(target) {
            if (target instanceof Node && this.host.contains(target))
                return null;
            const selection = document.getSelection();
            if (!selection || selection.isCollapsed || !selection.rangeCount)
                return null;
            const range = selection.getRangeAt(0);
            if (!range.toString().trim() || range.toString().length > 1600 || this.host.contains(range.commonAncestorContainer))
                return null;
            this.pendingRange = range.cloneRange();
            return this.pendingRange;
        }
        maybeOfferSelection(target, alt) {
            const bubble = this.$('#jp-bubble');
            bubble.hidden = true;
            if (!this.visible || this.selectionTrigger === 'off' || (this.selectionTrigger === 'alt' && !alt))
                return;
            const range = this.rememberSelection(target);
            if (!range)
                return;
            const rect = visibleRect(range);
            if (!rect)
                return;
            bubble.hidden = false;
            bubble.style.left = `${clamp(rect.right - 17, 8, window.innerWidth - 40)}px`;
            bubble.style.top = `${clamp(rect.top - 6, 40, window.innerHeight - 8)}px`;
        }
        async createFromContext(selectionText) {
            const current = document.getSelection();
            const live = current?.rangeCount && !current.isCollapsed ? current.getRangeAt(0) : null;
            let range = this.pendingRange || live;
            if (range && selectionText && range.toString().trim() !== selectionText.trim())
                range = null;
            if (!range) {
                const index = JP.buildTextIndex();
                range = JP.uniqueQuoteRange(selectionText, index);
            }
            if (!range) {
                this.toast('无法可靠定位选区。请在网页中重新选中原文后再试。');
                return false;
            }
            return this.createFromSelection(range);
        }
        async createFromSelection(givenRange) {
            const range = givenRange || this.pendingRange || document.getSelection()?.getRangeAt(0);
            if (!range) {
                this.toast('请选中网页文字');
                return false;
            }
            const index = JP.buildTextIndex();
            const anchor = JP.captureSelection(range, index);
            if (!anchor) {
                this.toast('请选择 1–1600 字的普通网页文字');
                return false;
            }
            return this.createNote(anchor);
        }
        async createPageNote() { return this.createNote(); }
        async createNote(anchor) {
            const now = Date.now();
            const note = {
                schemaVersion: 1, id: id(), pageKey: this.page, sourceUrl: location.href,
                sourceTitle: document.title, anchor, text: '',
                appearance: { color: 'yellow', width: 256, height: 202, offsetX: 0, offsetY: 0 },
                createdAt: now, updatedAt: now, revision: 0
            };
            try {
                this.ownWrites.add(note.id);
                await this.repo.put(note);
                this.knownRevisions.set(note.id, 0);
                this.notes.push(note);
                this.pendingRange = null;
                this.$('#jp-bubble').hidden = true;
                document.getSelection()?.removeAllRanges();
                this.launcherOpen = false;
                this.renderLauncher();
                this.refreshAnchors();
                this.showCard(note.id, true);
                return true;
            }
            catch (error) {
                console.warn('JotPatch creation failed', error);
                this.toast('保存失败，未创建便签');
                return false;
            }
            finally {
                this.ownWrites.delete(note.id);
            }
        }
        refreshAnchors() {
            if (!document.body)
                return;
            this.index = JP.buildTextIndex();
            this.matches.clear();
            for (const note of this.notes)
                if (note.anchor) {
                    const match = JP.resolveAnchor(note.anchor, this.index);
                    if (match)
                        this.matches.set(note.id, match);
                }
            this.paintHighlights();
            this.renderDock();
            this.renderMarkers();
            this.schedulePosition();
        }
        scheduleRefresh() {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = window.setTimeout(() => this.refreshAnchors(), 650);
        }
        paintHighlights() {
            const highlights = CSS.highlights;
            const HighlightCtor = window.Highlight;
            if (!highlights || !HighlightCtor)
                return;
            const ranges = [...this.matches.values()].map(m => m.range);
            if (ranges.length)
                highlights.set('jotpatch-anchored-text', new HighlightCtor(...ranges));
            else
                highlights.delete('jotpatch-anchored-text');
        }
        sortedNotes() {
            return [...this.notes].sort((a, b) => (this.matches.get(a.id)?.start ?? (a.anchor ? Infinity : -1)) -
                (this.matches.get(b.id)?.start ?? (b.anchor ? Infinity : -1)) || a.createdAt - b.createdAt);
        }
        renderDock() {
            const rail = this.$('#jp-rail');
            rail.hidden = !this.notes.length;
            this.$('#jp-list-toggle').textContent = String(this.notes.length);
            const track = this.$('#jp-rail-track');
            track.replaceChildren();
            const sorted = this.sortedNotes();
            const textLength = this.index?.text.length || 1;
            const placed = [];
            sorted.forEach((note, i) => {
                const match = this.matches.get(note.id);
                let pos = match ? match.start / textLength * 100 : (note.anchor ? 90 + i % 4 * 2 : 3 + i * 3);
                pos = clamp(pos, 2, 98);
                while (placed.some(p => Math.abs(p - pos) < 3.4) && pos < 96)
                    pos += 3.4;
                placed.push(pos);
                const button = el('button', `rail-pin${note.anchor && !match ? ' missing' : ''}`);
                button.type = 'button';
                button.style.top = `${pos}%`;
                button.style.background = note.anchor && !match ? '#aaa' : COLOR_HEX[JP.appearance(note).color];
                button.title = note.text.trim().slice(0, 70) || (note.anchor?.exact.slice(0, 50) || '本页便签');
                button.setAttribute('aria-label', `跳转便签：${button.title}`);
                button.addEventListener('click', () => this.goTo(note.id));
                track.appendChild(button);
            });
            this.renderList();
        }
        renderList() {
            const list = this.$('#jp-list');
            list.hidden = !this.listOpen || !this.notes.length;
            if (list.hidden)
                return;
            list.replaceChildren();
            const head = el('div', 'list-header');
            const title = el('span');
            title.textContent = `本页便签 · ${this.notes.length}`;
            const close = el('button');
            close.type = 'button';
            close.textContent = '×';
            close.title = '关闭列表';
            close.addEventListener('click', () => { this.listOpen = false; this.renderList(); });
            head.append(title, close);
            list.appendChild(head);
            for (const note of this.sortedNotes()) {
                const button = el('button', 'entry');
                button.type = 'button';
                const dot = el('span', 'dot');
                dot.style.background = COLOR_HEX[JP.appearance(note).color];
                const content = el('span');
                const label = el('strong');
                label.textContent = note.text.trim().split('\n')[0] || (note.anchor?.exact.slice(0, 45) || '空白便签');
                const sub = el('small');
                sub.textContent = !note.anchor ? '本页' : this.matches.has(note.id) ? '已关联原文' : '原文暂时未找到';
                content.append(label, sub);
                button.append(dot, content);
                button.addEventListener('click', () => this.goTo(note.id));
                list.appendChild(button);
            }
        }
        renderMarkers() {
            const target = this.$('#jp-markers');
            target.replaceChildren();
            for (const note of this.notes) {
                if (!note.anchor)
                    continue;
                const button = el('button', 'marker');
                button.type = 'button';
                button.dataset.noteId = note.id;
                button.style.background = COLOR_HEX[JP.appearance(note).color];
                button.textContent = '✎';
                button.title = note.text.trim().slice(0, 70) || note.anchor.exact.slice(0, 70);
                button.setAttribute('aria-label', `打开便签：${button.title}`);
                button.addEventListener('click', () => this.showCard(note.id));
                target.appendChild(button);
            }
            this.positionMarkers();
        }
        schedulePosition() {
            if (this.scrollScheduled)
                return;
            this.scrollScheduled = true;
            requestAnimationFrame(() => {
                this.scrollScheduled = false;
                this.positionMarkers();
                for (const id of this.openIds)
                    this.positionCard(id);
            });
        }
        positionMarkers() {
            for (const marker of Array.from(this.shadow.querySelectorAll('.marker'))) {
                const range = this.matches.get(marker.dataset.noteId || '')?.range;
                const rect = range && visibleRect(range);
                if (!rect || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
                    marker.hidden = true;
                    continue;
                }
                marker.hidden = false;
                marker.style.left = `${clamp(rect.right + 7, 5, innerWidth - 24)}px`;
                marker.style.top = `${clamp(rect.top, 5, innerHeight - 24)}px`;
            }
        }
        goTo(noteId, show = true) {
            const match = this.matches.get(noteId);
            if (match) {
                const node = match.range.startContainer;
                const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.schedulePosition();
            }
            else if (this.notes.find(n => n.id === noteId)?.anchor)
                this.toast('原文暂时未找到，便签仍已保存');
            if (show)
                this.showCard(noteId);
        }
        showCard(noteId, focus = false) {
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            let paper = this.cards.get(noteId);
            if (!paper) {
                paper = this.makePaper(note);
                this.cards.set(noteId, paper);
                this.$('#jp-cards').appendChild(paper);
            }
            this.openIds.add(noteId);
            paper.style.zIndex = String(++this.zOrder);
            this.positionCard(noteId);
            if (focus)
                paper.querySelector('.note-editor')?.focus({ preventScroll: true });
        }
        closeCard(noteId) {
            void this.saveNow(noteId);
            this.openIds.delete(noteId);
            this.cards.get(noteId)?.remove();
            this.cards.delete(noteId);
        }
        makePaper(note) {
            const paper = el('section', 'paper');
            paper.dataset.noteId = note.id;
            paper.setAttribute('aria-label', 'JotPatch 便签');
            const style = JP.appearance(note);
            paper.style.setProperty('--paper', COLOR_HEX[style.color]);
            paper.style.width = `${style.width}px`;
            paper.style.height = `${style.height}px`;
            paper.innerHTML = `
        <textarea class="note-editor" aria-label="便签内容" placeholder="写点什么…" spellcheck="true"></textarea>
        <div class="note-preview" aria-label="便签预览，点击编辑" tabindex="0" hidden></div>
        <div class="note-tools">
          <div class="tool-group"><button class="drag-handle" title="拖动便签位置" aria-label="拖动便签位置" type="button">⠿</button></div>
          <div class="tool-group">
            <button class="jump" title="跳转到原文" aria-label="跳转到原文" type="button">↗</button>
            <button class="menu-trigger" title="更多操作" aria-label="更多操作" type="button">···</button>
            <button class="close" title="收起便签" aria-label="收起便签" type="button">×</button>
          </div>
        </div>
        <div class="note-actions">
          <button class="bold" title="加粗 (Ctrl/⌘+B)" aria-label="加粗" type="button"><b>B</b></button>
          <button class="italic" title="斜体 (Ctrl/⌘+I)" aria-label="斜体" type="button"><i>I</i></button>
          <button class="bullet" title="项目列表" aria-label="项目列表" type="button">≡</button>
          <button class="number" title="编号列表" aria-label="编号列表" type="button">1.</button>
          <span class="spacer"></span><button class="copy" title="复制便签" aria-label="复制便签" type="button">⧉</button>
        </div>
        <div class="note-menu" hidden>
          <div class="colors" role="group" aria-label="便签颜色"></div>
          <button class="menu-action copy-menu" type="button">复制内容</button>
          <button class="menu-action delete-menu danger" type="button">删除便签</button>
        </div>
        <span class="save-indicator" aria-live="polite"></span>
        <div class="resize-handle" role="separator" aria-label="拖动调整便签大小" title="拖动调整便签大小"></div>`;
            const editor = paper.querySelector('.note-editor');
            editor.value = note.text;
            editor.addEventListener('input', () => {
                note.text = editor.value;
                note.updatedAt = Date.now();
                this.dirty.add(note.id);
                this.scheduleSave(note.id);
                this.renderList();
            });
            editor.addEventListener('focus', () => {
                paper.querySelector('.note-preview').hidden = true;
                editor.hidden = false;
            });
            editor.addEventListener('blur', () => {
                this.updatePreview(paper, note);
                void this.saveNow(note.id);
            });
            paper.querySelector('.note-preview').addEventListener('click', () => {
                paper.querySelector('.note-preview').hidden = true;
                editor.hidden = false;
                editor.focus({ preventScroll: true });
            });
            paper.querySelector('.note-preview').addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    paper.querySelector('.note-preview').hidden = true;
                    editor.hidden = false;
                    editor.focus({ preventScroll: true });
                }
            });
            editor.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                    const lower = e.key.toLowerCase();
                    if (lower === 'b' || lower === 'i') {
                        e.preventDefault();
                        this.format(editor, lower === 'b' ? 'bold' : 'italic');
                    }
                    if (e.shiftKey && e.key === '7') {
                        e.preventDefault();
                        this.format(editor, 'number');
                    }
                    if (e.shiftKey && e.key === '8') {
                        e.preventDefault();
                        this.format(editor, 'bullet');
                    }
                }
            });
            paper.addEventListener('pointerdown', () => { paper.style.zIndex = String(++this.zOrder); });
            for (const name of ['bold', 'italic', 'bullet', 'number']) {
                const btn = paper.querySelector(`.${name}`);
                btn.addEventListener('pointerdown', e => e.preventDefault());
                btn.addEventListener('click', () => this.format(editor, name));
            }
            paper.querySelector('.copy').addEventListener('click', () => void this.copyNote(note.id));
            paper.querySelector('.jump').addEventListener('click', () => this.goTo(note.id, false));
            paper.querySelector('.close').addEventListener('click', () => this.closeCard(note.id));
            const menu = paper.querySelector('.note-menu');
            paper.querySelector('.menu-trigger').addEventListener('click', () => { menu.hidden = !menu.hidden; });
            paper.querySelector('.copy-menu').addEventListener('click', () => { menu.hidden = true; void this.copyNote(note.id); });
            paper.querySelector('.delete-menu').addEventListener('click', () => { menu.hidden = true; void this.deleteNote(note.id); });
            const colors = paper.querySelector('.colors');
            COLOR_ORDER.forEach(color => {
                const btn = el('button');
                btn.type = 'button';
                btn.title = color;
                btn.style.background = COLOR_HEX[color];
                btn.setAttribute('aria-label', `颜色：${color}`);
                btn.setAttribute('aria-pressed', String(color === style.color));
                btn.addEventListener('click', () => {
                    note.appearance = { ...JP.appearance(note), color };
                    paper.style.setProperty('--paper', COLOR_HEX[color]);
                    colors.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
                    this.touchNote(note);
                    this.renderDock();
                    this.renderMarkers();
                });
                colors.appendChild(btn);
            });
            this.installDrag(paper.querySelector('.drag-handle'), note, 'move');
            this.installDrag(paper.querySelector('.resize-handle'), note, 'resize');
            this.updatePreview(paper, note);
            return paper;
        }
        updatePreview(paper, note) {
            const editor = paper.querySelector('.note-editor');
            const preview = paper.querySelector('.note-preview');
            if (editor === paper.getRootNode().activeElement)
                return;
            // Markdown is a small supported subset, parsed into safe DOM nodes.
            // Text from webpages is never fed into innerHTML.
            const hasFormat = /(?:\*\*[^\n*]+\*\*|\*[^\n*]+\*|^\s*(?:- |\d+\. ))/m.test(note.text);
            if (!hasFormat) {
                preview.hidden = true;
                editor.hidden = false;
                return;
            }
            preview.replaceChildren();
            const appendInline = (parent, line) => {
                const tokens = line.split(/(\*\*[^\n*]+\*\*|\*[^\n*]+\*)/g);
                for (const token of tokens) {
                    let child = null;
                    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
                        child = el('strong');
                        child.textContent = token.slice(2, -2);
                    }
                    else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
                        child = el('em');
                        child.textContent = token.slice(1, -1);
                    }
                    if (child)
                        parent.appendChild(child);
                    else
                        parent.appendChild(document.createTextNode(token));
                }
            };
            let list = null;
            let listType = '';
            for (const line of note.text.split('\n')) {
                const bullet = line.match(/^\s*- (.*)$/), number = line.match(/^\s*\d+\. (.*)$/);
                const type = bullet ? 'ul' : number ? 'ol' : '';
                if (type) {
                    if (!list || listType !== type) {
                        list = el(type === 'ul' ? 'ul' : 'ol');
                        preview.appendChild(list);
                        listType = type;
                    }
                    const li = el('li');
                    appendInline(li, (bullet || number)[1]);
                    list.appendChild(li);
                }
                else {
                    list = null;
                    listType = '';
                    const para = el('p');
                    appendInline(para, line || '\u00a0');
                    preview.appendChild(para);
                }
            }
            editor.hidden = true;
            preview.hidden = false;
        }
        format(editor, type) {
            if (editor.readOnly)
                return;
            editor.focus({ preventScroll: true });
            const start = editor.selectionStart, end = editor.selectionEnd, value = editor.value;
            if (type === 'bold' || type === 'italic') {
                const marker = type === 'bold' ? '**' : '*';
                editor.setRangeText(marker + value.slice(start, end) + marker, start, end, 'select');
                editor.setSelectionRange(start + marker.length, end + marker.length);
            }
            else {
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                let lineEnd = value.indexOf('\n', end);
                if (lineEnd === -1)
                    lineEnd = value.length;
                const lines = value.slice(lineStart, lineEnd).split('\n');
                const replacement = lines.map((line, i) => `${type === 'bullet' ? '- ' : `${i + 1}. `}${line}`).join('\n');
                editor.setRangeText(replacement, lineStart, lineEnd, 'end');
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        installDrag(handle, note, mode) {
            handle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0)
                    return;
                event.preventDefault();
                event.stopPropagation();
                handle.setPointerCapture(event.pointerId);
                const initial = JP.appearance(note), startX = event.clientX, startY = event.clientY;
                const move = (e) => {
                    if (e.pointerId !== event.pointerId)
                        return;
                    const dx = e.clientX - startX, dy = e.clientY - startY;
                    const updated = mode === 'move'
                        ? { ...initial, offsetX: initial.offsetX + dx, offsetY: initial.offsetY + dy }
                        : { ...initial, width: clamp(initial.width + dx, 180, Math.min(560, innerWidth - 15)),
                            height: clamp(initial.height + dy, 132, Math.min(620, innerHeight - 15)) };
                    note.appearance = updated;
                    const card = this.cards.get(note.id);
                    if (card) {
                        card.style.width = `${updated.width}px`;
                        card.style.height = `${updated.height}px`;
                    }
                    this.positionCard(note.id);
                };
                const finish = (e) => {
                    if (e.pointerId !== event.pointerId)
                        return;
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', finish);
                    handle.removeEventListener('pointercancel', finish);
                    this.touchNote(note);
                };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', finish);
                handle.addEventListener('pointercancel', finish);
            });
        }
        positionCard(noteId) {
            const card = this.cards.get(noteId), note = this.notes.find(n => n.id === noteId);
            if (!card || !note || !this.openIds.has(noteId))
                return;
            const dimensions = JP.appearance(note);
            const match = this.matches.get(noteId);
            const rect = match && visibleRect(match.range);
            if (note.anchor && match && (!rect || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth)) {
                card.hidden = true;
                return;
            }
            card.hidden = false;
            const width = Math.min(dimensions.width, Math.max(180, innerWidth - 14));
            const height = Math.min(dimensions.height, Math.max(132, innerHeight - 14));
            card.style.width = `${width}px`;
            card.style.height = `${height}px`;
            let x = innerWidth - width - 56, y = 74 + this.notes.indexOf(note) * 14;
            if (rect) {
                // Prefer the margins of the containing paragraph instead of floating
                // over the *rest of the same selected sentence*. If neither side fits,
                // place the card after the paragraph (or above it if no lower room).
                const parent = match.range.startContainer.parentElement;
                const block = parent?.closest('p,li,blockquote,pre,h1,h2,h3,h4,article') || parent;
                const blockRect = block?.getBoundingClientRect() || rect;
                if (innerWidth - blockRect.right >= width + 20) {
                    x = blockRect.right + 12;
                    y = rect.top;
                }
                else if (blockRect.left >= width + 20) {
                    x = blockRect.left - width - 12;
                    y = rect.top;
                }
                else {
                    x = clamp(rect.right - width / 2, 8, innerWidth - width - 8);
                    y = blockRect.bottom + 11;
                    if (y + height > innerHeight - 8)
                        y = blockRect.top - height - 11;
                }
            }
            x = clamp(x + dimensions.offsetX, 8, innerWidth - width - 8);
            y = clamp(y + dimensions.offsetY, 8, innerHeight - height - 8);
            card.style.left = `${x}px`;
            card.style.top = `${y}px`;
        }
        touchNote(note) { note.updatedAt = Date.now(); this.dirty.add(note.id); this.scheduleSave(note.id); }
        scheduleSave(noteId) {
            clearTimeout(this.writeTimers.get(noteId));
            this.writeTimers.set(noteId, window.setTimeout(() => void this.saveNow(noteId), 380));
        }
        async saveNow(noteId) {
            clearTimeout(this.writeTimers.get(noteId));
            this.writeTimers.delete(noteId);
            if (!this.dirty.has(noteId) || this.conflicts.has(noteId))
                return;
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            const snapshot = { ...note, appearance: note.appearance ? { ...note.appearance } : undefined };
            const prior = this.writeChains.get(noteId) || Promise.resolve();
            const next = prior.catch(() => undefined).then(async () => {
                const persisted = await this.repo.get(noteId);
                const revision = this.knownRevisions.get(noteId) || 0;
                if (persisted?.deletedAt || (persisted && (persisted.revision || 0) > revision)) {
                    this.conflicts.add(noteId);
                    throw new Error('CONFLICT');
                }
                snapshot.revision = revision + 1;
                this.ownWrites.add(noteId);
                try {
                    await this.repo.put(snapshot);
                    this.knownRevisions.set(noteId, snapshot.revision);
                    note.revision = snapshot.revision;
                    if (note.updatedAt === snapshot.updatedAt)
                        this.dirty.delete(noteId);
                }
                finally {
                    this.ownWrites.delete(noteId);
                }
            });
            this.writeChains.set(noteId, next);
            try {
                await next;
                this.saveStatus(noteId, '');
            }
            catch (error) {
                if (this.conflicts.has(noteId)) {
                    this.saveStatus(noteId, 'conflict', '冲突，请复制备份');
                    this.toast('此便签在其他标签页有更新；已暂停本页保存，请复制当前内容备份');
                }
                else {
                    this.saveStatus(noteId, 'error', '保存失败');
                    this.toast('保存失败，请复制便签内容备份');
                }
            }
        }
        saveStatus(noteId, state, label = '') {
            const paper = this.cards.get(noteId);
            if (!paper)
                return;
            paper.dataset.save = state;
            const indicator = paper.querySelector('.save-indicator');
            if (indicator)
                indicator.textContent = label;
        }
        syncExternalNote(fresh) {
            const old = this.notes.find(n => n.id === fresh.id);
            if (fresh.deletedAt) {
                if (!old)
                    return;
                if (this.dirty.has(old.id)) {
                    this.conflicts.add(old.id);
                    this.saveStatus(old.id, 'conflict', '其他页面已删除');
                    return;
                }
                this.notes = this.notes.filter(n => n.id !== fresh.id);
                this.closeCard(fresh.id);
                this.refreshAnchors();
                return;
            }
            if (!old) {
                this.notes.push(fresh);
                this.knownRevisions.set(fresh.id, fresh.revision || 0);
                this.refreshAnchors();
                return;
            }
            if ((fresh.revision || 0) <= (this.knownRevisions.get(fresh.id) || 0))
                return;
            if (this.dirty.has(fresh.id)) {
                this.conflicts.add(fresh.id);
                this.saveStatus(fresh.id, 'conflict', '冲突，请复制备份');
                return;
            }
            Object.assign(old, fresh);
            this.knownRevisions.set(fresh.id, fresh.revision || 0);
            const paper = this.cards.get(fresh.id);
            if (paper) {
                const editor = paper.querySelector('.note-editor');
                if (editor)
                    editor.value = fresh.text;
                this.updatePreview(paper, old);
                paper.style.setProperty('--paper', COLOR_HEX[JP.appearance(fresh).color]);
                paper.style.width = `${JP.appearance(fresh).width}px`;
                paper.style.height = `${JP.appearance(fresh).height}px`;
            }
            this.refreshAnchors();
        }
        async copyNote(noteId) {
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            try {
                await navigator.clipboard.writeText(note.text);
                this.toast('便签内容已复制');
            }
            catch {
                this.toast('复制失败，请选中正文后手动复制');
            }
        }
        async deleteNote(noteId) {
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            await this.saveNow(noteId);
            if (this.conflicts.has(noteId))
                return;
            try {
                await this.writeChains.get(noteId)?.catch(() => undefined);
                this.ownWrites.add(noteId);
                try {
                    await this.repo.markDeleted(note);
                }
                finally {
                    this.ownWrites.delete(noteId);
                }
                this.notes = this.notes.filter(n => n.id !== noteId);
                this.openIds.delete(noteId);
                this.cards.get(noteId)?.remove();
                this.cards.delete(noteId);
                this.dirty.delete(noteId);
                this.refreshAnchors();
                if (this.deletedUndo)
                    clearTimeout(this.deletedUndo.timer);
                const timer = window.setTimeout(() => { this.deletedUndo = null; this.hideToast(); }, 8000);
                this.deletedUndo = { note, timer };
                this.toast('便签已删除', true, 8000);
            }
            catch {
                this.toast('删除失败，请重试');
            }
        }
        async undoDeletion() {
            const deleted = this.deletedUndo;
            if (!deleted)
                return;
            clearTimeout(deleted.timer);
            this.deletedUndo = null;
            const note = { ...deleted.note, deletedAt: undefined, updatedAt: Date.now(), revision: (deleted.note.revision || 0) + 2 };
            try {
                this.ownWrites.add(note.id);
                try {
                    await this.repo.put(note);
                }
                finally {
                    this.ownWrites.delete(note.id);
                }
                this.notes.push(note);
                this.knownRevisions.set(note.id, note.revision || 0);
                this.refreshAnchors();
                this.showCard(note.id);
                this.toast('已恢复便签');
            }
            catch {
                this.toast('恢复失败，请重试');
                this.deletedUndo = deleted;
            }
        }
        hideToast() { this.$('#jp-toast').hidden = true; }
        toast(message, undo = false, duration = 3000) {
            clearTimeout(this.toastTimer);
            const toast = this.$('#jp-toast');
            this.$('#jp-toast-text').textContent = message;
            this.$('#jp-undo').hidden = !undo;
            toast.hidden = false;
            this.toastTimer = window.setTimeout(() => this.hideToast(), duration);
        }
    }
    JP.JotPatchApp = JotPatchApp;
})(JP || (JP = {}));
var JP;
(function (JP) {
    const owner = window;
    // Repeated injection (e.g. from right-click menu) never hides existing notes.
    if (!owner.__jotpatchStage0) {
        const app = new JP.JotPatchApp();
        owner.__jotpatchStage0 = app;
        void app.start();
    }
})(JP || (JP = {}));
