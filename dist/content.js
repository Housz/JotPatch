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
    const CHATGPT = {
        site: 'chatgpt',
        selectors: [
            'article[data-turn="user"]', '[data-turn="user"]',
            '[data-message-author-role="user"]', '[data-user-message-bubble]',
            '[data-testid="user-message"]'
        ].join(','),
        canonical(node) {
            return node.closest('article[data-turn="user"], article[data-testid^="conversation-turn-"], [data-turn-key]') || node;
        },
        prompt(node, wrapper) {
            // The wrapper can contain *both* user and assistant content. Scroll to
            // the prompt bubble itself, not the wrapper midpoint.
            const bubble = wrapper.querySelector('[data-user-message-bubble], [data-testid="user-message"]');
            if (bubble && (bubble.contains(node) || node.contains(bubble)))
                return bubble;
            if (node.matches('[data-user-message-bubble], [data-testid="user-message"]'))
                return node;
            return node.querySelector('[data-user-message-bubble], .user-message-bubble-color, .whitespace-pre-wrap') || node;
        }
    };
    const GEMINI = {
        site: 'gemini',
        selectors: 'user-query, [data-test-id="user-query"], [data-testid="user-query"]',
        canonical(node) { return node.closest('user-query') || node; },
        prompt(node, wrapper) {
            return wrapper.querySelector('.query-text, .user-query-content, .query-content, [data-test-id="query-text"], .query-text-line, .text-query') || node;
        }
    };
    function conversationSite(url = new URL(location.href)) {
        const host = url.hostname.toLowerCase();
        if (host === 'chatgpt.com' || host === 'chat.openai.com')
            return 'chatgpt';
        if (host === 'gemini.google.com')
            return 'gemini';
        return null;
    }
    JP.conversationSite = conversationSite;
    function compactText(node) {
        return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    }
    function usable(node) {
        return node.isConnected && !node.closest('nav, aside, [role="dialog"], [aria-hidden="true"], [data-jotpatch-exclude]') &&
            node.getClientRects().length > 0;
    }
    function sourceId(node) {
        const candidates = [node, node.querySelector('[data-message-id], [data-turn-id], [data-turn-key]')];
        for (const candidate of candidates) {
            if (!candidate)
                continue;
            for (const key of ['data-turn-key', 'data-turn-id', 'data-message-id']) {
                const value = candidate.getAttribute(key);
                if (value && value.length <= 200)
                    return `${key}:${value}`;
            }
        }
        const identifier = node.id;
        // Stable-looking public HTML IDs are a fallback for Gemini user-query.
        // Do not cache arbitrary ephemeral React-generated IDs.
        if (identifier && identifier.length <= 160 && /(?:turn|message|query|conversation)/i.test(identifier))
            return `id:${identifier}`;
        return null;
    }
    function nativeRail() {
        const node = document.querySelector('[data-testid="conversation-timeline"], [data-testid="conversation-navigation"], [aria-label="Conversation navigation"], [aria-label="对话导航"]');
        return !!node && node.getClientRects().length > 0;
    }
    function conversationScrollRoot(element) {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
            const style = getComputedStyle(ancestor);
            if (/(auto|scroll)/.test(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 15)
                return ancestor;
            ancestor = ancestor.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }
    JP.conversationScrollRoot = conversationScrollRoot;
    function conversationScrollHint(element) {
        const root = conversationScrollRoot(element);
        if (root === document.scrollingElement)
            return root.scrollTop + element.getBoundingClientRect().top;
        return root.scrollTop + element.getBoundingClientRect().top - root.getBoundingClientRect().top;
    }
    JP.conversationScrollHint = conversationScrollHint;
    function navigateToPrompt(element) {
        const root = conversationScrollRoot(element);
        const top = element.getBoundingClientRect().top;
        const rootTop = root === document.scrollingElement ? 0 : root.getBoundingClientRect().top;
        // Align the precise user message bubble near the TOP, not the answer midpoint.
        const desired = Math.max(0, root.scrollTop + top - rootTop - 86);
        root.scrollTo({ top: desired, behavior: 'auto' });
    }
    JP.navigateToPrompt = navigateToPrompt;
    function collectConversation(url = new URL(location.href)) {
        const site = conversationSite(url);
        if (!site || !document.body)
            return { site, turns: [], nativeRailPresent: false };
        const adapter = site === 'chatgpt' ? CHATGPT : GEMINI;
        const seen = new Set();
        const turns = [];
        for (const candidate of Array.from(document.querySelectorAll(adapter.selectors))) {
            const wrapper = adapter.canonical(candidate);
            if (seen.has(wrapper))
                continue;
            const prompt = adapter.prompt(candidate, wrapper);
            if (!usable(prompt))
                continue;
            seen.add(wrapper);
            const stableId = sourceId(wrapper) || sourceId(candidate) || sourceId(prompt) || undefined;
            turns.push({ id: stableId || `ordinal:${turns.length}`, order: turns.length,
                preview: compactText(prompt) || '非文本提问', element: prompt, stableId,
                scrollHint: conversationScrollHint(prompt) });
            if (turns.length >= 1200)
                break;
        }
        const used = new Set();
        for (const turn of turns) {
            if (used.has(turn.id)) {
                turn.stableId = undefined;
                turn.id = `ordinal:${turn.order}`;
            }
            used.add(turn.id);
        }
        return { site, turns, nativeRailPresent: site === 'chatgpt' && nativeRail() };
    }
    JP.collectConversation = collectConversation;
    function turnForRange(range, turns) {
        if (!turns.length)
            return null;
        let previous = null;
        const point = range.startContainer;
        for (const turn of turns) {
            if (!turn.element || !turn.element.isConnected)
                continue;
            if (turn.element.contains(point))
                return turn;
            const relation = turn.element.compareDocumentPosition(point);
            if (relation & Node.DOCUMENT_POSITION_DISCONNECTED)
                continue;
            if (relation & Node.DOCUMENT_POSITION_FOLLOWING)
                previous = turn;
            else
                break;
        }
        return previous;
    }
    JP.turnForRange = turnForRange;
})(JP || (JP = {}));
var JP;
(function (JP) {
    /** Minimal, safe Markdown <> rich text boundary: bold, italic, bullets and ordered lists only.
     * No HTML content is accepted from the clipboard or serialized to storage. */
    function appendInlineMarkdown(parent, value) {
        const pieces = value.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
        for (const piece of pieces) {
            if (!piece)
                continue;
            if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
                const tag = document.createElement('strong');
                tag.textContent = piece.slice(2, -2);
                parent.appendChild(tag);
            }
            else if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
                const tag = document.createElement('em');
                tag.textContent = piece.slice(1, -1);
                parent.appendChild(tag);
            }
            else
                parent.appendChild(document.createTextNode(piece));
        }
    }
    function renderMarkdown(editor, markdown) {
        const fragment = document.createDocumentFragment();
        let list = null;
        let kind = '';
        for (const line of markdown.split('\n')) {
            const bullet = line.match(/^\s*[-+] (.*)$/);
            const numbered = line.match(/^\s*\d+\. (.*)$/);
            const next = bullet ? 'ul' : numbered ? 'ol' : '';
            if (next) {
                if (!list || kind !== next) {
                    list = document.createElement(next);
                    fragment.appendChild(list);
                    kind = next;
                }
                const li = document.createElement('li');
                appendInlineMarkdown(li, (bullet || numbered)[1]);
                if (!li.childNodes.length)
                    li.appendChild(document.createElement('br'));
                list.appendChild(li);
            }
            else {
                list = null;
                kind = '';
                const p = document.createElement('p');
                appendInlineMarkdown(p, line);
                if (!p.childNodes.length)
                    p.appendChild(document.createElement('br'));
                fragment.appendChild(p);
            }
        }
        editor.replaceChildren(fragment);
    }
    JP.renderMarkdown = renderMarkdown;
    function richInline(node) {
        if (node.nodeType === Node.TEXT_NODE)
            return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE)
            return '';
        const element = node;
        if (element.tagName === 'BR')
            return '\n';
        const text = Array.from(element.childNodes, richInline).join('');
        if (!text.trim())
            return text;
        if (element.matches('strong,b') || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600)
            return `**${text}**`;
        if (element.matches('em,i') || element.style.fontStyle === 'italic')
            return `*${text}*`;
        return text;
    }
    /** Serializes only the four supported formats. Nested HTML from paste is never retained. */
    function markdownFromEditor(editor) {
        const lines = [];
        let loose = '';
        const flush = () => { if (loose) {
            lines.push(loose);
            loose = '';
        } };
        const visit = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                loose += node.textContent || '';
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE)
                return;
            const item = node;
            if (item.matches('ul,ol')) {
                flush();
                const ordered = item.tagName === 'OL';
                let order = Number(item.getAttribute('start')) || 1;
                for (const li of Array.from(item.children).filter(x => x.tagName === 'LI')) {
                    const inner = Array.from(li.childNodes, richInline).join('').replace(/\n+$/, '');
                    lines.push(`${ordered ? `${order++}.` : '-'} ${inner}`);
                }
            }
            else if (item.matches('p,div')) {
                // Chromium execCommand can nest UL/OL inside P. Walk nested blocks
                // instead of flattening the list into plain italic/bold text.
                const children = Array.from(item.childNodes);
                if (children.some(x => x instanceof Element && x.matches('ul,ol,p,div'))) {
                    flush();
                    children.forEach(visit);
                    flush();
                }
                else {
                    flush();
                    lines.push(children.map(richInline).join('').replace(/\n$/, ''));
                }
            }
            else if (item.tagName === 'BR') {
                flush();
                lines.push('');
            }
            else
                loose += richInline(item);
        };
        Array.from(editor.childNodes).forEach(visit);
        flush();
        return lines.join('\n').replace(/\n{3,}$/, '\n\n');
    }
    JP.markdownFromEditor = markdownFromEditor;
})(JP || (JP = {}));
var JP;
(function (JP) {
    /** Passive, in-memory navigation history. Never scrolls the host page. */
    class ConversationIndex {
        known = new Map();
        sequence = [];
        reset() { this.known.clear(); this.sequence = []; }
        combine(snapshot) {
            // Scan whatever ChatGPT/Gemini actually mounted. A detached prompt must
            // never be retained as a live Element in our cache.
            const liveById = new Map(snapshot.turns.map(turn => [turn.id, turn]));
            const stable = snapshot.turns.filter(turn => !!turn.stableId);
            const stableIds = stable.map(turn => turn.stableId);
            for (const turn of stable)
                this.known.set(turn.stableId, { ...turn, element: null });
            // Insert newly discovered messages relative to adjacent *overlapping*
            // stable IDs, so adding older DOM nodes does not scramble known order.
            // Disjoint virtualized windows use their approximate scroll hints only
            // as a fallback; their precise global ordinal is not claimed.
            for (let index = 0; index < stableIds.length; index++) {
                const id = stableIds[index];
                if (this.sequence.includes(id))
                    continue;
                const previous = stableIds.slice(0, index).reverse().find(key => this.sequence.includes(key));
                const next = stableIds.slice(index + 1).find(key => this.sequence.includes(key));
                if (previous)
                    this.sequence.splice(this.sequence.indexOf(previous) + 1, 0, id);
                else if (next)
                    this.sequence.splice(this.sequence.indexOf(next), 0, id);
                else {
                    const hint = this.known.get(id)?.scrollHint;
                    const at = this.sequence.findIndex(key => (this.known.get(key)?.scrollHint ?? Infinity) > (hint ?? Infinity));
                    this.sequence.splice(at < 0 ? this.sequence.length : at, 0, id);
                }
            }
            const result = [];
            for (const key of this.sequence) {
                const current = stable.find(turn => turn.stableId === key);
                const record = current || this.known.get(key);
                if (record)
                    result.push({ ...record, element: current?.element || null });
            }
            // An unlabeled turn cannot safely persist across virtualized unmounts.
            // Include it only while in the live DOM, in approximately its position.
            for (const turn of snapshot.turns.filter(turn => !turn.stableId)) {
                const at = result.findIndex(existing => (existing.scrollHint ?? Infinity) > (turn.scrollHint ?? Infinity));
                result.splice(at < 0 ? result.length : at, 0, { ...turn });
            }
            result.forEach((turn, order) => { turn.order = order; });
            return { ...snapshot, turns: result };
        }
        discoveredCount() { return this.known.size; }
    }
    JP.ConversationIndex = ConversationIndex;
})(JP || (JP = {}));
var JP;
(function (JP) {
    const TURN_WEIGHT = 14;
    const NOTE_WEIGHT = 15;
    const MIN_INDIVIDUAL_PITCH = 12;
    // Product threshold, independent of conversation length. Four notes within a
    // single turn are enough to earn a multi-color overview and hover expansion.
    JP.OVERVIEW_NOTE_THRESHOLD = 4;
    /** Pure layout: one stable overview, never reflowed by hovering. */
    function layoutConversationRail(groups, requestedHeight) {
        const height = Math.max(50, Number.isFinite(requestedHeight) ? requestedHeight : 400);
        const pad = 5;
        const usable = Math.max(1, height - 2 * pad);
        const positions = new Map();
        const regions = [];
        const compactGroups = new Set();
        if (!groups.length)
            return { positions, regions, compactGroups, dense: false, height };
        const uncompressed = groups.map(g => TURN_WEIGHT + g.noteIds.length * NOTE_WEIGHT);
        const required = uncompressed.reduce((sum, weight) => sum + weight, 0);
        // Decide local compression from *real pixel budgets*, not just total notes
        // or number of turns. A 5-note/10-turn conversation should also show the
        // overview, while one or two comfortably separated notes remain direct.
        groups.forEach((group, index) => {
            const count = group.noteIds.length;
            const nominalSpan = uncompressed[index] / required * usable;
            if (count >= JP.OVERVIEW_NOTE_THRESHOLD ||
                (count >= 2 && nominalSpan / (count + 1) < MIN_INDIVIDUAL_PITCH)) {
                compactGroups.add(group.turnId);
            }
        });
        // A compact group needs *one* summary slot, not N full-height slots.
        // Otherwise an 8-note group creates excessive blank space in the rail.
        const weights = groups.map(group => compactGroups.has(group.turnId)
            ? TURN_WEIGHT + 12 + Math.min(group.noteIds.length, 5) * 2
            : TURN_WEIGHT + group.noteIds.length * NOTE_WEIGHT);
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let cursor = pad;
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
            const group = groups[groupIndex];
            const span = weights[groupIndex] / total * usable;
            regions.push({ turnId: group.turnId, start: cursor, end: cursor + span });
            positions.set(`turn:${group.turnId}`, cursor + Math.min(3, span * .17));
            const count = group.noteIds.length;
            const inset = Math.min(6, span * .23);
            const noteSpan = Math.max(0, span - inset);
            for (let i = 0; i < count; i++) {
                const fraction = Math.max(0, Math.min(1, group.fractions[i] ?? (i + .5) / count));
                const slot = (i + 1) / (count + 1) * .76 + fraction * .24;
                positions.set(`note:${group.noteIds[i]}`, cursor + inset + noteSpan * slot);
            }
            if (compactGroups.has(group.turnId))
                positions.set(`overview:${group.turnId}`, cursor + inset + noteSpan * .58);
            cursor += span;
        }
        return { positions, regions, compactGroups, dense: required > usable || compactGroups.size > 0, height };
    }
    JP.layoutConversationRail = layoutConversationRail;
    /**
     * Page-only fallback, e.g. an AI page whose DOM currently has <3 mounted
     * turns. A dense *note-only* rail must still show a visible multi-color
     * overview and the same hover lens, rather than endless overlapping dots.
     */
    function groupPageRailPoints(points, height) {
        if (!points.length)
            return [];
        const safeHeight = Math.max(100, height);
        const crowded = points.length >= 14 && safeHeight / points.length < 34;
        const bin = crowded ? Math.min(52, Math.max(25, safeHeight / 12)) : 18;
        const buckets = new Map();
        for (const point of points) {
            const y = Math.max(0, Math.min(1, point.fraction)) * safeHeight;
            const slot = Math.floor(Math.min(safeHeight - 0.001, y) / bin);
            const bucket = buckets.get(slot) || [];
            bucket.push(point);
            buckets.set(slot, bucket);
        }
        return [...buckets.entries()].sort(([a], [b]) => a - b).map(([slot, entries]) => {
            const start = slot * bin, end = Math.min(safeHeight, (slot + 1) * bin);
            return { id: `page-region-${slot}`, noteIds: entries.map(e => e.noteId),
                center: entries.reduce((sum, e) => sum + Math.max(0, Math.min(1, e.fraction)) * safeHeight, 0) / entries.length,
                start, end };
        });
    }
    JP.groupPageRailPoints = groupPageRailPoints;
    function groupCrowdedTurnNotes(groups, layout) {
        const noteCount = groups.reduce((sum, g) => sum + g.noteIds.length, 0);
        if (noteCount < 14 || layout.height / noteCount >= 28)
            return [];
        const bin = Math.min(52, Math.max(32, layout.height / 12));
        const bins = new Map();
        for (const group of groups) {
            if (layout.compactGroups.has(group.turnId))
                continue;
            for (const id of group.noteIds) {
                const y = layout.positions.get(`note:${id}`);
                if (y == null)
                    continue;
                const slot = Math.floor(Math.min(layout.height - .001, Math.max(0, y)) / bin);
                const bucket = bins.get(slot) || [];
                bucket.push({ id, y });
                bins.set(slot, bucket);
            }
        }
        return [...bins.entries()].sort(([a], [b]) => a - b).flatMap(([slot, items]) => {
            if (items.length < 2)
                return [];
            items.sort((a, b) => a.y - b.y);
            return [{ id: `cross-region-${slot}`, noteIds: items.map(x => x.id),
                    center: items.reduce((sum, x) => sum + x.y, 0) / items.length,
                    start: slot * bin, end: Math.min(layout.height, (slot + 1) * bin) }];
        });
    }
    JP.groupCrowdedTurnNotes = groupCrowdedTurnNotes;
})(JP || (JP = {}));
var JP;
(function (JP) {
    const PREFIX = 'jotpatch:note:v1:';
    const PREFERENCES_KEY = 'jotpatch:preferences:v1';
    const COLORS = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
    const DEFAULTS = { color: 'yellow', fontSize: 'md', width: 256, height: 202, offsetX: 0, offsetY: 0 };
    function appearance(note) {
        const style = note.appearance || {};
        return {
            color: COLORS.includes(style.color) ? style.color : DEFAULTS.color,
            fontSize: style.fontSize === 'sm' || style.fontSize === 'lg' ? style.fontSize : 'md',
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
            const prefs = saved && typeof saved === 'object' ? saved : {};
            return {
                selectionTrigger: prefs.selectionTrigger === 'alt' || prefs.selectionTrigger === 'off' ? prefs.selectionTrigger : 'always',
                conversationNavigation: prefs.conversationNavigation !== false
            };
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
    button{font:inherit;border:0;cursor:pointer} button:focus-visible,[contenteditable]:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .launcher{position:fixed;top:14px;right:42px;display:flex;gap:3px;align-items:center;padding:3px;
      background:#fffdf8f0;border:1px solid #e8e3d8;border-radius:20px;box-shadow:0 4px 16px #0002;pointer-events:auto}
    .launcher button{width:29px;height:29px;border-radius:50%;background:transparent;color:#5f5b51;font-size:17px}
    .launcher button:hover{background:#eee9df} .launcher button#jp-new{font-size:21px;line-height:26px}
    .bubble{position:fixed;z-index:20;pointer-events:auto;transform:translateY(-100%)}
    .bubble button{width:31px;height:31px;border-radius:50%;background:#fff8df;color:#7a612a;box-shadow:0 2px 12px #0003;
      border:1px solid #e7d59e;font-size:16px;line-height:30px;padding:0;text-align:center}
    .bubble button:hover{background:#ffe7a1;transform:scale(1.06)}
    .rail{position:fixed;right:7px;top:50%;transform:translateY(-50%);height:68vh;max-height:730px;
      min-height:220px;width:27px;border-radius:16px;background:#fffdf9d9;
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail.with-conversation{width:33px}
    .rail.native-nav{right:42px}
    .rail-head{position:absolute;top:5px;left:50%;transform:translateX(-50%);width:23px;height:23px;
      border-radius:50%;font-size:14px;background:#f0ece2;color:#615a4b;padding:0;display:grid;place-items:center}
    .rail-head:hover,.rail-loose:hover{background:#e7e1d5}
    .rail-track{position:absolute;top:33px;bottom:16px;left:2px;right:2px}
    .rail.with-conversation .rail-track{bottom:25px;left:2px;right:2px}
    .rail-loose{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);height:18px;min-width:20px;
      padding:0 3px;background:#efe9df;border-radius:10px;color:#6d6659;font-size:11px}
    .rail-turn{position:absolute;right:2px;width:14px;height:3px;min-height:2px;padding:0;
      background:#c3c7cc;border-radius:8px;transform:translateY(-50%);
      transition:top .17s ease,width .12s ease,background .12s ease;z-index:1}
    .rail-turn:hover,.rail-turn:focus-visible{width:20px;background:#818894;z-index:6}
    .rail-turn[aria-current="location"]{width:19px;background:#717883}
    .rail.with-conversation .rail-pin{left:2px;width:13px;height:7px;z-index:3;border-radius:9px}
    /* Dense lens lives beside the rail. The overview never jumps on hover. */
    .rail-track.focused .rail-pin,.rail-track.focused .rail-turn{transition:none}
    /* An actual compact overview: several colored micro-stripes in one slot.
       The larger transparent hit area belongs to the whole summary, not one
       tiny stripe; the hover lens reveals each note as an individual target. */
    .rail-overview{position:absolute;left:1px;width:17px;height:11px;z-index:5;
      transform:translateY(-50%);display:flex;align-items:center;gap:1px;padding:2px;
      border:1px solid #0002;border-radius:5px;background:#fffdf8e8;
      box-shadow:0 1px 5px #0002;cursor:zoom-in;pointer-events:auto}
    .rail-overview-stripe{display:block;flex:1;min-width:1px;height:6px;
      border-radius:1px;box-shadow:inset 0 0 0 .2px #0002}
    .rail-overview:hover,.rail-overview:focus-visible{outline:2px solid #7562a4;
      outline-offset:2px;border-color:#9583be;z-index:9}
    .rail-track.dense .rail-overview[data-tight="true"]{height:7px;padding:1px}
    .rail-track.dense .rail-overview[data-tight="true"] .rail-overview-stripe{height:4px}
    .rail-lens{position:fixed;width:min(204px,64vw);max-height:min(320px,68vh);overflow:auto;
      pointer-events:auto;z-index:35;padding:5px;background:#fffdf9f7;
      border:1px solid #e5ddd1;border-radius:10px;box-shadow:0 8px 25px #0003}
    .rail-lens button{width:100%;height:28px;display:flex;align-items:center;gap:8px;
      background:transparent;color:#555049;padding:3px 7px;border-radius:6px;text-align:left;
      white-space:nowrap;overflow:hidden;font-size:12px}
    .rail-lens button:hover,.rail-lens button:focus-visible{background:#f1ede5}
    .rail-lens-turn{font-size:12px;line-height:1.35;color:#565047;font-weight:600;
      border-bottom:1px solid #ede9e1;padding:8px 7px;white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis}
    .rail-lens-turn[role="button"]{cursor:pointer}
    .rail-lens-turn[role="button"]:hover{background:#f1ede5}
    .rail-lens-dot{flex:0 0 12px;height:8px;border-radius:5px;border:1px solid #0002}
    .rail-lens-dot.missing{border:1px dashed #716b66;opacity:.85}
    .rail-lens-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .rail-pin{position:absolute;left:5px;width:11px;height:10px;border:1px solid #0002;border-radius:50%;
      box-shadow:0 1px 4px #0002;transform:translateY(-50%);padding:0;
      transition:top .17s ease,width .1s ease;cursor:pointer}
    .rail-pin.missing{border:1px dashed #716b66;opacity:.85}
    .rail-pin:hover,.rail-pin:focus-visible,.marker:hover{outline:2px solid #7562a4;outline-offset:2px;z-index:8}
    .turn-preview{position:fixed;max-width:252px;min-width:140px;z-index:40;pointer-events:none;
      border-radius:8px;padding:9px 11px;background:#fffefcf7;border:1px solid #e6e3dc;
      box-shadow:0 4px 18px #0002;font-size:12px;color:#37342e;overflow-wrap:anywhere}
    .turn-preview small{display:block;font-size:10px;color:#8d877d;margin-bottom:3px}
    .turn-preview span{display:block;line-height:1.5;max-height:6em;overflow:hidden;white-space:pre-line}
    .list{position:fixed;right:43px;top:19%;width:min(298px,78vw);max-height:69vh;overflow:auto;pointer-events:auto;
      background:#fffefaf7;border:1px solid #eae5da;border-radius:9px;box-shadow:0 8px 26px #0002;padding:6px}
    .list-header{display:flex;justify-content:space-between;align-items:center;padding:7px 7px 10px;font-weight:600}
    .list-header button{background:transparent;color:#777;margin:0 3px;font-size:16px}
    .list-caption{padding:3px 7px 8px;font-size:10px;color:#99938b}
    .entry{width:100%;background:transparent;padding:7px 7px;display:flex;align-items:center;gap:8px;
      border-top:1px solid #ece9e0;color:#34312e;text-align:left}
    .entry:hover{background:#f7f2e8}
    .entry .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin:0 1px}
    .list-section{font-size:11px;color:#827d74;letter-spacing:.025em;padding:8px 8px 3px}
    .turn-entry{gap:8px;font-size:12px;font-weight:520}
    .turn-entry span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .turn-order{color:#8e928f;flex:0 0 21px;font-variant-numeric:tabular-nums;text-align:right}
    .note-entry{min-height:29px;border-top:0;font-size:12px}
    .note-entry.nested{padding:5px 7px 5px 40px}
    .note-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1}
    .entry-pin{font-size:12px;color:#9a8551;flex:none}
    .entry-pin.unresolved{color:#aaa;text-decoration:underline dotted}
    @media (prefers-reduced-motion:reduce){.rail-turn,.rail-pin{transition:none!important}}
    .marker{position:fixed;z-index:4;width:19px;height:19px;pointer-events:auto;border-radius:50%;padding:0;
      box-shadow:0 2px 7px #0003;color:#755d24;font-size:11px;border:1px solid #fff9}
    .rail-note-cluster{width:16px!important;height:16px!important;left:-2px!important;
      font-size:10px;font-weight:650;color:#413626;text-align:center;line-height:14px}
    .note-popover{position:fixed;right:47px;width:min(235px,75vw);max-height:48vh;overflow-y:auto;
      padding:6px;pointer-events:auto;background:#fffefa;border-radius:9px;border:1px solid #e7dfcf;
      box-shadow:0 7px 22px #0002;z-index:40}
    .cluster-title{font-size:11px;padding:7px 9px;color:#89816f}
    .cluster-item{display:flex;gap:8px;align-items:center;width:100%;padding:9px 7px;border-radius:5px;
      background:transparent;text-align:left;font-size:12px;color:#37332c}
    .cluster-item:hover{background:#f4f1e9}
    .cluster-item span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cluster-item .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%}
    .paper{--paper:#fff1b8;--jp-font-size:14px;position:fixed;z-index:8;display:flex;flex-direction:column;
      background:var(--paper);border:1px solid #0000000d;border-radius:4px;box-shadow:0 5px 18px #0002;
      pointer-events:auto;min-width:180px;min-height:132px;overflow:hidden}
    .paper:focus-within{box-shadow:0 6px 24px #0003}.paper:hover{box-shadow:0 6px 21px #0003}
    .paper-head,.paper-foot{width:100%;display:flex;align-items:center;flex:0 0 28px;
      padding:2px 5px;user-select:none;border-color:transparent;transition:background .13s ease}
    .paper-head{justify-content:space-between;cursor:grab;touch-action:none}
    .paper-head:active{cursor:grabbing}
    .paper-foot{justify-content:flex-start;gap:2px;flex:0 0 27px}
    .paper:hover .paper-head,.paper:focus-within .paper-head{background:#00000006;border-bottom:1px solid #0000000b}
    .paper:hover .paper-foot,.paper:focus-within .paper-foot{background:#00000006;border-top:1px solid #0000000b}
    .paper-grab{flex:1;min-width:8px;pointer-events:none}
    .paper-pin{flex:0 0 22px;display:grid;place-items:center;color:#947235!important;
      opacity:.85!important;pointer-events:auto!important;cursor:pointer}
    .paper-pin[hidden]{display:none!important}
    .paper-pin:hover{background:#00000012!important;color:#60491c!important}
    .paper-head-actions{display:flex;gap:1px;opacity:0;pointer-events:auto;transition:opacity .14s ease}
    .paper-foot>button,.paper-foot>.save-indicator{opacity:0;pointer-events:auto;transition:opacity .14s ease}
    .paper:hover .paper-head-actions,.paper:focus-within .paper-head-actions,
    .paper:hover .paper-foot>button,.paper:focus-within .paper-foot>button,
    .paper[data-save=conflict] .save-indicator,.paper[data-save=error] .save-indicator{
      opacity:.9;pointer-events:auto}
    .paper-head button,.paper-foot button{padding:0;width:25px;height:22px;border-radius:4px;background:transparent;
      color:#625743;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
    .paper-head button:hover,.paper-foot button:hover{background:#00000014}
    .paper-foot-spacer{flex:1}
    .note-editor{display:block;min-height:0;flex:1;width:100%;border:0;outline:none!important;
      background:transparent;color:#393329;position:relative;font:var(--jp-font-size)/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;
      padding:7px 12px 8px;overflow-y:auto;overflow-x:hidden;white-space:pre-wrap;overflow-wrap:anywhere;
      caret-color:#534529;user-select:text}
    .note-editor[data-empty="true"]::before{content:attr(data-placeholder);position:absolute;top:7px;left:12px;
      pointer-events:none;color:#8c806c86}
    .note-editor p,.note-editor div{margin:0;min-height:1.5em}
    .note-editor ul,.note-editor ol{margin:0 0 3px;padding-left:21px}
    .note-editor li{margin:0;min-height:1.5em}
    .note-editor b,.note-editor strong{font-weight:700}.note-editor i,.note-editor em{font-style:italic}
    .resize-handle{position:absolute;bottom:0;right:0;width:15px;height:15px;cursor:nwse-resize;
      touch-action:none;opacity:.12;background:linear-gradient(135deg,transparent 54%,#736a5666 55%,#736a5666 61%,transparent 62%)}
    .paper:hover .resize-handle,.paper:focus-within .resize-handle{opacity:.75}
    .note-menu{position:absolute;right:5px;top:29px;width:183px;padding:8px;background:#fffcf4;
      border:1px solid #e2d9c4;border-radius:8px;box-shadow:0 7px 21px #0003;z-index:8}
    .note-mode{color:#847a65;font-size:11px;padding:4px 5px 8px;margin-bottom:4px;
      border-bottom:1px solid #ece4d6}
    .colors{display:flex;gap:5px;padding:6px 4px 9px}.colors button{width:21px;height:21px;border-radius:50%;border:1px solid #0002;padding:0}
    .colors button[aria-pressed=true]{outline:2px solid #7567a1;outline-offset:2px}
    .font-label{font-size:11px;color:#857b68;margin:4px 4px 7px}
    .font-choices{display:flex;gap:4px;margin:0 3px 9px}
    .font-size{flex:1;background:transparent;border:1px solid #ded6c7;border-radius:5px;padding:5px;color:#595044}
    .font-size[aria-pressed=true]{background:#e6decf;border-color:#c8b9a2}
    .menu-action{display:block;text-align:left;width:100%;padding:7px;border-radius:5px;background:transparent;color:#4b463b}
    .menu-action:hover{background:#eee8d8}.menu-action.danger{color:#9b4440}
    .save-indicator{font-size:10px;color:#9b4141;pointer-events:none}
    .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;pointer-events:auto;
      background:#34302c;color:#fff;border-radius:8px;padding:9px 12px;box-shadow:0 3px 14px #0003;
      display:flex;gap:12px;align-items:center;max-width:min(440px,92vw);font-size:12px}
    .toast button{background:transparent;color:#ffe1a0;font-weight:600;padding:4px;border-radius:4px}
  `;
})(JP || (JP = {}));
var JP;
(function (JP) {
    // Lightweight paper notes and a passive, shared conversation/notes timeline.
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
        // Only a direct user action may open a paper with an unresolved text anchor.
        explicitlyDetachedIds = new Set();
        cards = new Map();
        visible = true;
        launcherOpen = false;
        listOpen = false;
        selectionTrigger = 'always';
        conversationNavigation = true;
        conversation = { site: null, turns: [], nativeRailPresent: false };
        conversationTimer = 0;
        conversationIndex = new JP.ConversationIndex();
        conversationScrollRootRef = null;
        railGroups = [];
        railSupplementalGroups = [];
        railLayoutBase = null;
        railFocus = null;
        railDismissTimer = 0;
        railLayoutHeight = 0;
        activeTurnId = null;
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
        unpinUndo = null;
        async start() {
            this.mount();
            this.setupEvents();
            await this.loadPreferences();
            await this.loadPage();
            this.refreshConversation();
            this.observer = new MutationObserver((records) => {
                // Ignore our own Shadow DOM host mutations. Otherwise rebuilding the
                // Dock repeatedly schedules another expensive conversation scan.
                const external = records.filter(record => !this.host.contains(record.target));
                if (!external.length)
                    return;
                this.scheduleRefresh();
                if (external.some(record => record.type === 'childList' || record.type === 'attributes'))
                    this.scheduleConversationScan();
            });
            this.observer.observe(document.body, { subtree: true, childList: true, characterData: true,
                attributes: true, attributeFilter: ['data-turn-key', 'data-turn-id', 'data-message-id', 'data-turn', 'data-message-author-role'] });
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
        <nav id="jp-rail" class="rail" aria-label="网页对话与便签导航" hidden>
          <button id="jp-list-toggle" class="rail-head" title="打开本页导航列表" aria-label="打开本页导航列表" type="button">≡</button>
          <div class="rail-track" id="jp-rail-track"></div>
          <button id="jp-loose-toggle" class="rail-loose" title="本页悬浮或待定位便签" aria-label="查看本页悬浮和待定位便签" type="button" hidden>▤</button>
        </nav>
        <aside id="jp-rail-lens" class="rail-lens" aria-label="密集轮次的便签展开" hidden></aside>
        <div id="jp-turn-preview" class="turn-preview" role="tooltip" hidden></div>
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
            this.$('#jp-undo').addEventListener('click', () => void this.undoLastAction());
            this.$('#jp-loose-toggle').addEventListener('click', () => {
                this.listOpen = true;
                this.renderList();
            });
            const track = this.$('#jp-rail-track');
            track.addEventListener('pointermove', event => {
                const layout = this.railLayoutBase;
                if (!layout?.compactGroups.size)
                    return;
                // Hovering the *colored summary itself* is always authoritative. This
                // also works when a 6px-dense overview overlaps neighboring hit areas.
                const target = event.target.closest('.rail-overview');
                if (target?.dataset.railGroup) {
                    this.setRailFocus(target.dataset.railGroup);
                    return;
                }
                // For compressed 100+ turn rails, the track is more usable as a hit
                // surface than individually targeting a miniature 2px strip.
                const y = event.clientY - track.getBoundingClientRect().top;
                const region = layout.regions.find(r => y >= r.start && y < r.end);
                if (region && layout.compactGroups.has(region.turnId))
                    this.setRailFocus(region.turnId);
            });
            track.addEventListener('pointerleave', () => this.scheduleRailDismiss());
            const lens = this.$('#jp-rail-lens');
            lens.addEventListener('pointerenter', () => this.cancelRailDismiss());
            lens.addEventListener('pointerleave', () => this.scheduleRailDismiss());
            lens.addEventListener('focusin', () => this.cancelRailDismiss());
            lens.addEventListener('focusout', event => {
                const next = event.relatedTarget;
                if (!next || !lens.contains(next))
                    this.scheduleRailDismiss();
            });
            track.addEventListener('keydown', event => {
                const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
                if (!keys.includes(event.key))
                    return;
                const buttons = Array.from(track.querySelectorAll('button'));
                const at = buttons.indexOf(this.shadow.activeElement);
                if (at < 0)
                    return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                    clamp(at + (event.key === 'ArrowDown' ? 1 : -1), 0, buttons.length - 1);
                buttons[next]?.focus({ preventScroll: true });
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape')
                    for (const card of this.cards.values()) {
                        const menu = card.querySelector('.note-menu');
                        if (menu)
                            menu.hidden = true;
                        card.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false');
                    }
            });
            document.addEventListener('pointerdown', event => {
                const path = event.composedPath();
                for (const card of this.cards.values()) {
                    const menu = card.querySelector('.note-menu');
                    if (menu && !path.includes(menu) && !path.includes(card.querySelector('.menu-trigger'))) {
                        menu.hidden = true;
                        card.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false');
                    }
                }
            }, true);
            document.addEventListener('mouseup', e => this.maybeOfferSelection(e.target, e.altKey));
            document.addEventListener('keyup', e => {
                if (e.key.startsWith('Arrow') || e.key === 'Shift')
                    this.maybeOfferSelection(e.target, e.altKey);
            });
            document.addEventListener('contextmenu', e => this.rememberSelection(e.target));
            window.addEventListener('scroll', () => {
                this.schedulePosition();
                // React virtualized lists may reuse DOM nodes without a childList
                // mutation; natural user scrolling may still reveal a new prompt.
                if (this.conversationNavigation && JP.conversationSite())
                    this.scheduleConversationScan();
            }, true);
            window.addEventListener('resize', () => { this.clearRailLens(); this.schedulePosition(); });
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
                    const preferences = changes[PREFERENCE_KEY].newValue;
                    const trigger = preferences?.selectionTrigger;
                    this.selectionTrigger = trigger === 'alt' || trigger === 'off' ? trigger : 'always';
                    this.conversationNavigation = preferences?.conversationNavigation !== false;
                    this.$('#jp-bubble').hidden = true;
                    this.refreshConversation();
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
                const prefs = await this.repo.preferences();
                this.selectionTrigger = prefs.selectionTrigger;
                this.conversationNavigation = prefs.conversationNavigation;
            }
            catch {
                this.selectionTrigger = 'always';
                this.conversationNavigation = true;
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
            if (this.unpinUndo)
                clearTimeout(this.unpinUndo.timer);
            this.unpinUndo = null;
            this.openIds.clear();
            this.explicitlyDetachedIds.clear();
            this.cards.clear();
            this.$('#jp-cards').replaceChildren();
            this.listOpen = false;
            this.railFocus = null;
            this.railGroups = [];
            this.railSupplementalGroups = [];
            this.railLayoutBase = null;
            this.conversationIndex.reset();
            this.conversationScrollRootRef = null;
            this.conversation = { site: JP.conversationSite(), turns: [], nativeRailPresent: false };
            this.hideTurnPreview();
            void this.loadPage().then(() => this.scheduleConversationScan(true));
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
            if (target instanceof Node && (this.host.contains(target) || target.getRootNode() === this.shadow))
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
            return this.createNote(anchor, range);
        }
        async createPageNote() { return this.createNote(); }
        async createNote(anchor, sourceRange) {
            const now = Date.now();
            const linked = anchor && sourceRange ? JP.turnForRange(sourceRange, this.conversation.turns.filter(t => t.element?.isConnected)) : null;
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
            this.associateNotesToTurns();
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
        /** Scan only known AI sites. A leading-edge throttle handles streaming DOM changes. */
        scheduleConversationScan(immediate = false) {
            if (!this.conversationNavigation || !JP.conversationSite())
                return;
            if (immediate)
                clearTimeout(this.conversationTimer);
            else if (this.conversationTimer)
                return;
            this.conversationTimer = window.setTimeout(() => {
                this.conversationTimer = 0;
                this.refreshConversation();
            }, immediate ? 60 : 800);
        }
        refreshConversation() {
            clearTimeout(this.conversationTimer);
            this.conversationTimer = 0;
            const snapshot = this.conversationNavigation ? JP.collectConversation() :
                { site: JP.conversationSite(), turns: [], nativeRailPresent: false };
            this.conversation = this.conversationNavigation ? this.conversationIndex.combine(snapshot) : snapshot;
            const activeSource = this.conversation.turns.find(t => t.element?.isConnected)?.element;
            if (activeSource)
                this.conversationScrollRootRef = JP.conversationScrollRoot(activeSource);
            this.hideTurnPreview();
            this.associateNotesToTurns();
            this.renderDock();
            this.schedulePosition();
        }
        hideTurnPreview() { this.$('#jp-turn-preview').hidden = true; }
        showTurnPreview(turn, button) {
            const preview = this.$('#jp-turn-preview');
            preview.replaceChildren();
            const label = el('small');
            label.textContent = `已发现第 ${turn.order + 1} / ${this.conversation.turns.length} 轮${turn.element ? '' : ' · 暂未挂载'}`;
            const summary = el('span');
            summary.textContent = turn.preview;
            preview.append(label, summary);
            const rect = button.getBoundingClientRect();
            const railRect = this.$('#jp-rail').getBoundingClientRect();
            preview.style.right = `${Math.max(44, innerWidth - railRect.left + 9)}px`;
            preview.style.top = `${clamp(rect.top - 13, 8, innerHeight - 96)}px`;
            preview.hidden = false;
        }
        async jumpToTurn(turn) {
            this.hideTurnPreview();
            // Always re-resolve the current prompt before navigating: a stale React
            // wrapper or cached element may have been recycled by the host app.
            const live = JP.collectConversation().turns.find(t => t.id === turn.id);
            if (live?.element) {
                JP.navigateToPrompt(live.element);
                this.activeTurnId = turn.id;
                this.schedulePosition();
                return;
            }
            if (!turn.stableId || !Number.isFinite(turn.scrollHint)) {
                this.toast('该轮原文尚未加载，继续滚动网页后重试');
                return;
            }
            const source = this.conversation.turns.find(t => t.element?.isConnected)?.element;
            const root = source ? JP.conversationScrollRoot(source) :
                (this.conversationScrollRootRef?.isConnected ? this.conversationScrollRootRef : document.scrollingElement);
            if (!root) {
                this.toast('无法确定会话滚动区域');
                return;
            }
            const hint = turn.scrollHint;
            const directions = [0, -0.7, 0.7, -1.4, 1.4];
            for (const delta of directions) {
                root.scrollTo({ top: Math.max(0, hint + delta * root.clientHeight), behavior: 'auto' });
                await new Promise(resolve => window.setTimeout(resolve, 180));
                if (!this.visible || !this.conversationNavigation)
                    return;
                const match = JP.collectConversation().turns.find(t => t.id === turn.id);
                if (match?.element) {
                    JP.navigateToPrompt(match.element);
                    this.refreshConversation();
                    this.schedulePosition();
                    return;
                }
            }
            this.toast('这一轮未能重新加载，已停止跳转；可手动滚动到附近再试');
            this.refreshConversation();
        }
        updateActiveTurn() {
            if (!this.conversationNavigation || this.conversation.nativeRailPresent)
                return;
            const turns = this.conversation.turns.filter(t => !!t.element?.isConnected);
            if (!turns.length)
                return;
            const threshold = innerHeight * .32;
            // Elements may be mounted in a virtualized window; compare only live
            // prompt rectangles instead of assuming the full conversation is mounted.
            let active = turns[0];
            for (const turn of turns) {
                if (turn.element.getBoundingClientRect().top > threshold)
                    break;
                active = turn;
            }
            if (active.id === this.activeTurnId)
                return;
            this.activeTurnId = active.id;
            for (const button of this.shadow.querySelectorAll('.rail-turn')) {
                if (button.dataset.turnId === active.id)
                    button.setAttribute('aria-current', 'location');
                else
                    button.removeAttribute('aria-current');
            }
        }
        /** A tiny preview is shared by turn bars and individual colored notes. */
        showNotePreview(note, button) {
            const preview = this.$('#jp-turn-preview');
            preview.replaceChildren();
            const label = el('small');
            label.textContent = note.anchor ? (this.liveMatch(note) ? '📌 原文便签' : '📌 原文暂未加载') : '本页悬浮便签';
            const content = el('span');
            content.textContent = note.text.trim().slice(0, 210) || '空白便签';
            preview.append(label, content);
            const rect = button.getBoundingClientRect();
            const railRect = this.$('#jp-rail').getBoundingClientRect();
            preview.style.right = `${Math.max(44, innerWidth - railRect.left + 9)}px`;
            preview.style.top = `${clamp(rect.top - 13, 8, innerHeight - 96)}px`;
            preview.hidden = false;
        }
        associateNotesToTurns() {
            const live = this.conversation.turns.filter(turn => turn.element?.isConnected);
            if (!live.length)
                return;
            for (const note of this.notes) {
                if (!note.anchor)
                    continue;
                const match = this.liveMatch(note);
                if (!match)
                    continue;
                const turn = JP.turnForRange(match.range, live);
                if (turn?.stableId && turn.stableId !== note.conversationTurnId && !this.conflicts.has(note.id)) {
                    note.conversationTurnId = turn.stableId;
                    this.touchNote(note);
                }
            }
        }
        renderDock() {
            const rail = this.$('#jp-rail');
            const turns = this.conversationNavigation ? this.conversation.turns : [];
            const showTurns = turns.length >= 3 && !this.conversation.nativeRailPresent;
            rail.hidden = !this.notes.length && !showTurns;
            rail.classList.toggle('with-conversation', showTurns);
            rail.classList.toggle('native-nav', this.conversation.nativeRailPresent);
            const toggle = this.$('#jp-list-toggle');
            toggle.textContent = showTurns ? '≡' : String(this.notes.length);
            toggle.title = showTurns ? `已发现 ${turns.length} 轮 · ${this.notes.length} 张便签` : `本页 ${this.notes.length} 张便签`;
            const track = this.$('#jp-rail-track');
            this.clearRailLens();
            track.replaceChildren();
            this.railGroups = [];
            this.railSupplementalGroups = [];
            this.railLayoutBase = null;
            const live = turns.filter(turn => turn.element?.isConnected);
            const perTurn = new Map();
            const loose = [];
            for (const note of this.sortedNotes()) {
                const match = note.anchor ? this.liveMatch(note) : null;
                const turn = showTurns && note.anchor && match ? JP.turnForRange(match.range, live) : null;
                const turnId = turn?.id || (note.anchor ? note.conversationTurnId : null);
                if (!showTurns || !turnId || !turns.some(t => t.id === turnId)) {
                    loose.push(note);
                    continue;
                }
                const group = perTurn.get(turnId) || [];
                group.push(note);
                perTurn.set(turnId, group);
            }
            if (showTurns) {
                if (this.railFocus && !turns.some(t => t.id === this.railFocus))
                    this.railFocus = null;
                const ordered = new Map();
                for (const turn of turns) {
                    const notes = (perTurn.get(turn.id) || []).sort((a, b) => (this.matches.get(a.id)?.start ?? a.anchor?.start ?? Infinity) -
                        (this.matches.get(b.id)?.start ?? b.anchor?.start ?? Infinity) || a.createdAt - b.createdAt);
                    const offsets = notes.map(n => this.matches.get(n.id)?.start ?? n.anchor?.start).filter((x) => typeof x === 'number');
                    const lowest = offsets.length ? Math.min(...offsets) : 0;
                    const highest = offsets.length ? Math.max(...offsets) : 0;
                    const fractions = notes.map((note, index) => {
                        const start = this.matches.get(note.id)?.start ?? note.anchor?.start;
                        return start == null ? .5 : highest > lowest ? (start - lowest) / (highest - lowest) : (.5 + (index - (notes.length - 1) / 2) * .08);
                    });
                    this.railGroups.push({ turnId: turn.id, noteIds: notes.map(n => n.id), fractions });
                    ordered.set(turn.id, notes);
                }
                const height = track.clientHeight || Math.max(170, innerHeight * .68 - 65);
                const plan = JP.layoutConversationRail(this.railGroups, height);
                const crossGroups = JP.groupCrowdedTurnNotes(this.railGroups, plan);
                const hiddenInCrossGroups = new Set(crossGroups.flatMap(group => group.noteIds));
                for (const turn of turns) {
                    const notes = ordered.get(turn.id) || [];
                    const bar = el('button', 'rail-turn');
                    bar.type = 'button';
                    bar.dataset.turnId = turn.id;
                    bar.dataset.railKey = `turn:${turn.id}`;
                    bar.dataset.railGroup = turn.id;
                    bar.title = `已发现第 ${turn.order + 1} 轮：${turn.preview}`;
                    bar.setAttribute('aria-label', bar.title);
                    bar.addEventListener('click', () => void this.jumpToTurn(turn));
                    bar.addEventListener('pointerenter', () => {
                        if (plan.compactGroups.has(turn.id))
                            this.setRailFocus(turn.id);
                        else
                            this.showTurnPreview(turn, bar);
                    });
                    bar.addEventListener('pointerleave', () => this.hideTurnPreview());
                    bar.addEventListener('focus', () => {
                        if (plan.compactGroups.has(turn.id))
                            this.setRailFocus(turn.id);
                        else
                            this.showTurnPreview(turn, bar);
                    });
                    bar.addEventListener('blur', () => this.hideTurnPreview());
                    track.appendChild(bar);
                    if (plan.compactGroups.has(turn.id))
                        this.addRailOverview(track, notes, turn.id);
                    else
                        for (const note of notes) {
                            if (!hiddenInCrossGroups.has(note.id))
                                this.addRailNote(track, note, turn.id);
                        }
                }
                this.applyRailLayout();
                // Cross-turn overviews share the SAME time axis but do not replace
                // gray prompt bars. Store only their lens lookup & pixel centers.
                const actual = this.railLayoutBase;
                const noteMap = new Map(this.notes.map(note => [note.id, note]));
                for (const group of crossGroups) {
                    const notes = group.noteIds.map(id => noteMap.get(id)).filter((note) => !!note);
                    this.railSupplementalGroups.push({ turnId: group.id, noteIds: group.noteIds, fractions: [] });
                    actual.compactGroups.add(group.id);
                    actual.positions.set(`overview:${group.id}`, group.center);
                    actual.regions.push({ turnId: group.id, start: group.start, end: group.end });
                    const marker = this.addRailOverview(track, notes, group.id);
                    marker.style.top = `${group.center}px`;
                }
            }
            else {
                // When a site reveals fewer than three turns (or none at all), the
                // note-only rail STILL compresses dozens of nearby notes. Otherwise
                // users can create 30 notes and never see an overview or hover lens.
                this.renderPageNoteRail(track);
            }
            const extras = showTurns ? loose : [];
            const bottom = this.$('#jp-loose-toggle');
            bottom.hidden = !showTurns || extras.length === 0;
            if (!bottom.hidden) {
                bottom.textContent = `${extras.length}`;
                bottom.title = `${extras.length} 张本页悬浮或待定位便签`;
            }
            this.activeTurnId = null;
            this.updateActiveTurn();
            this.renderList();
        }
        /** A visible multi-color overview, not N overlapping yellow dots.
         *  Same-color notes still render as multiple separated stripes. */
        addRailOverview(track, notes, groupId) {
            const button = el('button', 'rail-overview');
            button.type = 'button';
            button.dataset.railGroup = groupId;
            button.dataset.railKey = `overview:${groupId}`;
            button.dataset.noteCount = String(notes.length);
            button.title = `${notes.length} 张便签 · 悬停展开逐条查看`;
            button.setAttribute('aria-label', `${notes.length} 张便签，悬停展开并逐条跳转`);
            const samples = Math.min(6, notes.length);
            for (let i = 0; i < samples; i++) {
                const source = notes[Math.floor(i * notes.length / samples)];
                const strip = el('span', 'rail-overview-stripe');
                strip.style.background = COLOR_HEX[JP.appearance(source).color];
                strip.setAttribute('aria-hidden', 'true');
                button.appendChild(strip);
            }
            button.addEventListener('pointerenter', () => this.setRailFocus(groupId));
            button.addEventListener('focus', () => this.setRailFocus(groupId));
            button.addEventListener('click', () => this.setRailFocus(groupId));
            track.appendChild(button);
            return button;
        }
        /** Note-only fallback uses stable document-position bins when crowded. */
        renderPageNoteRail(track) {
            const sorted = this.sortedNotes();
            const textLength = Math.max(1, this.index?.text.length || 1);
            const height = track.clientHeight || Math.max(170, innerHeight * .68 - 65);
            this.railLayoutHeight = height;
            const notesById = new Map(sorted.map(note => [note.id, note]));
            const points = sorted.map((note, i) => {
                const match = this.liveMatch(note);
                const fraction = match ? match.start / textLength :
                    note.anchor ? .90 + (i % 4) * .02 : .03 + i * .025;
                return { noteId: note.id, fraction: clamp(fraction, .02, .98) };
            });
            const groups = JP.groupPageRailPoints(points, height);
            const fractions = new Map(points.map(point => [point.noteId, point.fraction]));
            const positions = new Map(), regions = [], compactGroups = new Set();
            for (const group of groups) {
                const shouldCompact = group.noteIds.length >= JP.OVERVIEW_NOTE_THRESHOLD ||
                    (group.noteIds.length >= 2 && points.length >= 14 && height / points.length < 34);
                if (shouldCompact) {
                    compactGroups.add(group.id);
                    this.railGroups.push({ turnId: group.id, noteIds: group.noteIds, fractions: [] });
                    regions.push({ turnId: group.id, start: group.start, end: group.end });
                    const notes = group.noteIds.map(id => notesById.get(id)).filter((n) => !!n);
                    const button = this.addRailOverview(track, notes, group.id);
                    button.style.top = `${group.center}px`;
                    positions.set(`overview:${group.id}`, group.center);
                }
                else {
                    for (const id of group.noteIds) {
                        const note = notesById.get(id);
                        if (!note)
                            continue;
                        const button = this.addRailNote(track, note);
                        button.style.top = `${clamp(fractions.get(id) ?? .5, .02, .98) * 100}%`;
                    }
                }
            }
            this.railLayoutBase = { positions, regions, compactGroups, dense: compactGroups.size > 0, height };
            track.classList.toggle('dense', compactGroups.size > 0);
        }
        addRailNote(track, note, groupId) {
            const button = el('button', `rail-pin${note.anchor && !this.liveMatch(note) ? ' missing' : ''}`);
            button.type = 'button';
            button.dataset.noteId = note.id;
            button.dataset.railKey = `note:${note.id}`;
            if (groupId)
                button.dataset.railGroup = groupId;
            // An unmounted/virtualized quote does NOT change the user's note color.
            // Dashed border conveys that its source cannot currently be located.
            button.style.background = COLOR_HEX[JP.appearance(note).color];
            button.title = (note.anchor && !this.liveMatch(note) ? '原文暂未加载 · ' : '') + (note.text.trim().slice(0, 90) || note.anchor?.exact.slice(0, 70) || '本页便签');
            button.setAttribute('aria-label', `跳转便签：${button.title}`);
            button.addEventListener('click', () => this.goTo(note.id));
            button.addEventListener('pointerenter', () => {
                if (groupId && this.railLayoutBase?.compactGroups.has(groupId))
                    this.setRailFocus(groupId);
                else
                    this.showNotePreview(note, button);
            });
            button.addEventListener('pointerleave', () => this.hideTurnPreview());
            button.addEventListener('focus', () => { if (groupId)
                this.setRailFocus(groupId); this.showNotePreview(note, button); });
            button.addEventListener('blur', () => this.hideTurnPreview());
            track.appendChild(button);
            return button;
        }
        applyRailLayout() {
            if (!this.railGroups.length)
                return;
            const track = this.$('#jp-rail-track');
            const height = track.clientHeight || Math.max(170, innerHeight * .68 - 65);
            this.railLayoutHeight = height;
            // The overview NEVER reflows on hover. In the old implementation the
            // entire timeline shifted, creating target jitter and invisible lenses.
            const layout = JP.layoutConversationRail(this.railGroups, height);
            this.railLayoutBase = layout;
            for (const button of track.querySelectorAll('[data-rail-key]')) {
                const point = layout.positions.get(button.dataset.railKey || '');
                if (point != null)
                    button.style.top = `${point}px`;
            }
            track.classList.toggle('dense', layout.dense);
            track.classList.remove('focused');
        }
        cancelRailDismiss() {
            clearTimeout(this.railDismissTimer);
            this.railDismissTimer = 0;
        }
        scheduleRailDismiss() {
            this.cancelRailDismiss();
            // Small gap between the track and lens should not make it disappear.
            this.railDismissTimer = window.setTimeout(() => this.clearRailLens(), 320);
        }
        clearRailLens() {
            this.cancelRailDismiss();
            this.railFocus = null;
            const lens = this.shadow.querySelector('#jp-rail-lens');
            if (lens) {
                lens.hidden = true;
                lens.replaceChildren();
            }
            this.shadow.querySelector('#jp-rail-track')?.classList.remove('focused');
        }
        setRailFocus(turnId) {
            if (!turnId || !this.railLayoutBase?.compactGroups.has(turnId)) {
                this.clearRailLens();
                return;
            }
            this.cancelRailDismiss();
            if (this.railFocus === turnId && !this.$('#jp-rail-lens').hidden)
                return;
            this.railFocus = turnId;
            this.showRailLens(turnId);
        }
        /** Stable hover lens. It leaves the overview unchanged and requires no
         *  preliminary click before selecting a note or a question. */
        showRailLens(turnId) {
            const layout = this.railLayoutBase;
            const group = this.railGroups.find(g => g.turnId === turnId) ||
                this.railSupplementalGroups.find(g => g.turnId === turnId);
            const turn = this.conversation.turns.find(t => t.id === turnId);
            const lens = this.$('#jp-rail-lens');
            if (!layout || !layout.compactGroups.has(turnId) || !group) {
                this.clearRailLens();
                return;
            }
            this.hideTurnPreview();
            lens.replaceChildren();
            const title = el('div', 'rail-lens-turn');
            title.textContent = turn ? `${turn.order + 1} · ${turn.preview}` : `附近 ${group.noteIds.length} 张便签`;
            title.title = title.textContent;
            if (turn) {
                title.setAttribute('role', 'button');
                title.setAttribute('tabindex', '0');
                title.addEventListener('click', () => { this.clearRailLens(); void this.jumpToTurn(turn); });
                title.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        this.clearRailLens();
                        void this.jumpToTurn(turn);
                    }
                });
            }
            lens.appendChild(title);
            for (const noteId of group.noteIds) {
                const note = this.notes.find(n => n.id === noteId);
                if (!note)
                    continue;
                const item = el('button', 'rail-lens-note');
                item.type = 'button';
                item.dataset.noteId = note.id;
                item.title = note.text.trim() || note.anchor?.exact || '空白便签';
                item.setAttribute('aria-label', `跳转便签：${item.title}`);
                const dot = el('span', `rail-lens-dot${note.anchor && !this.liveMatch(note) ? ' missing' : ''}`);
                dot.style.background = COLOR_HEX[JP.appearance(note).color];
                const label = el('span', 'rail-lens-label');
                label.textContent = note.text.trim().split('\n')[0] || note.anchor?.exact.slice(0, 65) || '空白便签';
                item.append(dot, label);
                item.addEventListener('click', () => { this.clearRailLens(); this.goTo(noteId); });
                lens.appendChild(item);
            }
            const railRect = this.$('#jp-rail').getBoundingClientRect();
            const trackRect = this.$('#jp-rail-track').getBoundingClientRect();
            const region = layout.regions.find(r => r.turnId === turnId);
            const center = trackRect.top + (region ? (region.start + region.end) / 2 : 0);
            const desiredHeight = Math.min(320, 32 + group.noteIds.length * 29);
            lens.style.right = `${Math.max(40, innerWidth - railRect.left + 7)}px`;
            lens.style.top = `${clamp(center - desiredHeight / 2, 8, innerHeight - desiredHeight - 8)}px`;
            lens.hidden = false;
            this.$('#jp-rail-track').classList.add('focused');
        }
        renderList() {
            const list = this.$('#jp-list');
            const turns = this.conversationNavigation && !this.conversation.nativeRailPresent ? this.conversation.turns : [];
            list.hidden = !this.listOpen || (!this.notes.length && turns.length < 3);
            if (list.hidden)
                return;
            list.replaceChildren();
            const head = el('div', 'list-header');
            const title = el('span');
            title.textContent = turns.length >= 3
                ? `已发现 ${turns.length} 轮 · ${this.notes.length} 张便签` : `本页便签 · ${this.notes.length}`;
            const close = el('button');
            close.type = 'button';
            close.textContent = '×';
            close.title = '关闭列表';
            close.addEventListener('click', () => { this.listOpen = false; this.renderList(); });
            head.append(title, close);
            list.appendChild(head);
            const hasTurns = turns.length >= 3;
            const live = turns.filter(t => t.element?.isConnected);
            const mapped = new Set();
            if (hasTurns) {
                const heading = el('div', 'list-caption');
                heading.textContent = '按对话顺序排列 · 不自动滚动扫描历史';
                list.appendChild(heading);
                for (const turn of turns) {
                    const button = el('button', 'entry turn-entry');
                    button.type = 'button';
                    const number = el('span', 'turn-order');
                    number.textContent = String(turn.order + 1);
                    const label = el('span');
                    label.textContent = turn.preview;
                    button.append(number, label);
                    button.addEventListener('click', () => { this.listOpen = false; this.renderList(); void this.jumpToTurn(turn); });
                    list.appendChild(button);
                    for (const note of this.sortedNotes()) {
                        if (!note.anchor)
                            continue;
                        const matched = this.liveMatch(note);
                        const linked = (matched ? JP.turnForRange(matched.range, live)?.id : undefined) || note.conversationTurnId;
                        if (linked !== turn.id)
                            continue;
                        mapped.add(note.id);
                        this.addListNote(list, note, true);
                    }
                }
            }
            const others = this.sortedNotes().filter(note => !mapped.has(note.id));
            if (others.length) {
                const heading = el('div', 'list-section');
                heading.textContent = hasTurns ? '本页悬浮 / 待定位便签' : '本页便签';
                list.appendChild(heading);
                for (const note of others)
                    this.addListNote(list, note, false);
            }
        }
        addListNote(list, note, nested) {
            const button = el('button', `entry note-entry${nested ? ' nested' : ''}`);
            button.type = 'button';
            const dot = el('span', 'dot');
            dot.style.background = COLOR_HEX[JP.appearance(note).color];
            const label = el('span', 'note-name');
            label.textContent = note.text.trim().split('\n')[0] || note.anchor?.exact.slice(0, 65) || '空白便签';
            button.append(dot, label);
            if (note.anchor) {
                const symbol = el('span', 'entry-pin');
                symbol.textContent = '📌';
                symbol.title = this.liveMatch(note) ? '已钉在原文' : '原文暂未加载';
                symbol.classList.toggle('unresolved', !this.liveMatch(note));
                symbol.setAttribute('aria-label', symbol.title);
                button.appendChild(symbol);
            }
            button.addEventListener('click', () => { this.listOpen = false; this.renderList(); this.goTo(note.id); });
            list.appendChild(button);
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
                const track = this.$('#jp-rail-track');
                if (this.railGroups.length && track.clientHeight !== this.railLayoutHeight)
                    this.renderDock();
                for (const id of this.openIds)
                    this.positionCard(id);
                this.updateActiveTurn();
            });
        }
        /** A virtualized conversation may detach a Range before MutationObserver reindexes it.
         *  Never treat a stale or missing text match as a screen-positioned page note. */
        liveMatch(note) {
            if (!note.anchor)
                return null;
            const match = this.matches.get(note.id);
            if (!match)
                return null;
            const { range } = match;
            if (!range.startContainer.isConnected || !range.endContainer.isConnected)
                return null;
            // Fast identity check for the common case: the whole quote is in one
            // text node. React sometimes rewrites an existing Text node in place.
            if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE &&
                range.startContainer.data.slice(range.startOffset, range.endOffset) !== note.anchor.exact)
                return null;
            return match;
        }
        positionMarkers() {
            const notesById = new Map(this.notes.map(note => [note.id, note]));
            for (const marker of Array.from(this.shadow.querySelectorAll('.marker'))) {
                const note = notesById.get(marker.dataset.noteId || '');
                const range = note && this.liveMatch(note)?.range;
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
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            const match = this.liveMatch(note);
            if (match) {
                const node = match.range.startContainer;
                const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.schedulePosition();
            }
            else if (note.anchor)
                this.toast('原文暂时未找到，便签仍已保存');
            // An explicit Dock/list click is allowed to open an orphaned note for
            // editing. Passive DOM mutations and scrolls are NEVER allowed to do so.
            if (show)
                this.showCard(noteId, false, !!note.anchor && !match);
        }
        showCard(noteId, focus = false, openDetached = false) {
            const note = this.notes.find(n => n.id === noteId);
            if (!note)
                return;
            if (openDetached)
                this.explicitlyDetachedIds.add(noteId);
            else
                this.explicitlyDetachedIds.delete(noteId);
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
            this.explicitlyDetachedIds.delete(noteId);
            this.cards.get(noteId)?.remove();
            this.cards.delete(noteId);
        }
        makePaper(note) {
            const paper = el('section', 'paper');
            paper.dataset.noteId = note.id;
            paper.setAttribute('aria-label', 'JotPatch 便签');
            const style = JP.appearance(note);
            paper.style.setProperty('--paper', COLOR_HEX[style.color]);
            paper.style.setProperty('--jp-font-size', this.fontPixels(style.fontSize));
            paper.style.width = `${style.width}px`;
            paper.style.height = `${style.height}px`;
            // Fixed header and footer take actual layout space; no controls overlap text.
            paper.innerHTML = `
        <header class="paper-head drag-region" title="拖动整条顶栏移动便签" aria-label="拖动便签位置">
          <button class="paper-pin" type="button" aria-label="解除原文锚定" title="已钉在原文 · 点击解除锚定" ${note.anchor ? '' : 'hidden'}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 1-3 4v3l-3 2-2-6-6-2 2-3h3l4-3z"/><path d="m9 15-6 6"/></svg>
          </button>
          <span class="paper-grab" aria-hidden="true"></span>
          <div class="paper-head-actions">
            <button class="copy" title="复制 Markdown 源码" aria-label="复制 Markdown 源码" type="button">⧉</button>
            <button class="jump" title="返回原文" aria-label="返回原文" type="button">↗</button>
            <button class="menu-trigger" title="更多操作" aria-label="更多操作" type="button" aria-expanded="false">···</button>
            <button class="close" title="收起便签" aria-label="收起便签" type="button">×</button>
          </div>
        </header>
        <div class="note-editor" contenteditable="true" role="textbox" aria-multiline="true"
          aria-label="便签内容" spellcheck="true" data-placeholder="写点什么…"></div>
        <footer class="paper-foot">
          <button class="bold" title="加粗 (Ctrl/⌘+B)" aria-label="加粗" type="button"><b>B</b></button>
          <button class="italic" title="斜体 (Ctrl/⌘+I)" aria-label="斜体" type="button"><i>I</i></button>
          <button class="bullet" title="项目列表" aria-label="项目列表" type="button">≡</button>
          <button class="number" title="编号列表" aria-label="编号列表" type="button">1.</button>
          <span class="paper-foot-spacer"></span>
          <span class="save-indicator" aria-live="polite"></span>
        </footer>
        <div class="note-menu" hidden>
          <div class="note-mode">${note.anchor ? '📌 贴在原文' : '◌ 本页悬浮'}</div>
          <div class="colors" role="group" aria-label="便签颜色"></div>
          <div class="font-label">字号</div>
          <div class="font-choices" role="group" aria-label="字号">
            <button class="font-size" data-font="sm" type="button">小</button>
            <button class="font-size" data-font="md" type="button">中</button>
            <button class="font-size" data-font="lg" type="button">大</button>
          </div>
          <button class="menu-action delete-menu danger" type="button">删除便签</button>
        </div>
        <div class="resize-handle" role="separator" aria-label="拖动调整便签大小" title="拖动调整便签大小"></div>`;
            const editor = paper.querySelector('.note-editor');
            JP.renderMarkdown(editor, note.text);
            const changed = () => {
                note.text = JP.markdownFromEditor(editor);
                editor.dataset.empty = String(!note.text.trim());
                this.touchNote(note);
                this.renderList();
            };
            editor.dataset.empty = String(!note.text.trim());
            editor.addEventListener('input', changed);
            editor.addEventListener('blur', () => void this.saveNow(note.id));
            editor.addEventListener('paste', event => {
                // Paste plain text only. HTML from source websites must not enter our
                // editable DOM or storage, even if the clipboard contains rich HTML.
                event.preventDefault();
                document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
            });
            editor.addEventListener('keydown', (event) => {
                if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                    const key = event.key.toLowerCase();
                    if (key === 'b' || key === 'i') {
                        event.preventDefault();
                        this.format(editor, key === 'b' ? 'bold' : 'italic');
                    }
                    else if (event.shiftKey && event.key === '7') {
                        event.preventDefault();
                        this.format(editor, 'number');
                    }
                    else if (event.shiftKey && event.key === '8') {
                        event.preventDefault();
                        this.format(editor, 'bullet');
                    }
                }
            });
            paper.addEventListener('pointerdown', () => { paper.style.zIndex = String(++this.zOrder); });
            paper.addEventListener('focusin', () => { paper.style.zIndex = String(++this.zOrder); });
            paper.addEventListener('wheel', (event) => {
                // Cancel browser zoom only while the pointer is inside a note.
                if (!event.ctrlKey || !event.cancelable)
                    return;
                event.preventDefault();
                event.stopPropagation();
                const steps = ['sm', 'md', 'lg'];
                const current = JP.appearance(note).fontSize;
                const direction = event.deltaY < 0 ? 1 : -1;
                const next = steps[clamp(steps.indexOf(current) + direction, 0, steps.length - 1)];
                this.setFontSize(note, paper, next);
            }, { passive: false });
            for (const name of ['bold', 'italic', 'bullet', 'number']) {
                const button = paper.querySelector(`.${name}`);
                button.addEventListener('pointerdown', event => event.preventDefault());
                button.addEventListener('click', () => this.format(editor, name));
            }
            paper.querySelector('.paper-pin').addEventListener('click', () => this.unpinNote(note.id));
            paper.querySelector('.copy').addEventListener('click', () => void this.copyNote(note.id));
            paper.querySelector('.jump').addEventListener('click', () => this.goTo(note.id, false));
            paper.querySelector('.close').addEventListener('click', () => this.closeCard(note.id));
            const menu = paper.querySelector('.note-menu');
            const menuTrigger = paper.querySelector('.menu-trigger');
            menuTrigger.addEventListener('click', () => {
                for (const other of this.cards.values())
                    if (other !== paper) {
                        const otherMenu = other.querySelector('.note-menu');
                        if (otherMenu)
                            otherMenu.hidden = true;
                    }
                menu.hidden = !menu.hidden;
                menuTrigger.setAttribute('aria-expanded', String(!menu.hidden));
            });
            paper.querySelector('.delete-menu').addEventListener('click', () => { menu.hidden = true; void this.deleteNote(note.id); });
            for (const button of paper.querySelectorAll('.font-size')) {
                button.setAttribute('aria-pressed', String(button.dataset.font === style.fontSize));
                button.addEventListener('click', () => this.setFontSize(note, paper, button.dataset.font));
            }
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
                    colors.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === btn)));
                    this.touchNote(note);
                    this.renderDock();
                    this.renderMarkers();
                });
                colors.appendChild(btn);
            });
            this.installDrag(paper.querySelector('.drag-region'), note, 'move');
            this.installDrag(paper.querySelector('.resize-handle'), note, 'resize');
            return paper;
        }
        fontPixels(size) {
            return size === 'sm' ? '12px' : size === 'lg' ? '17px' : '14px';
        }
        setFontSize(note, paper, size) {
            if (!['sm', 'md', 'lg'].includes(size) || JP.appearance(note).fontSize === size)
                return;
            note.appearance = { ...JP.appearance(note), fontSize: size };
            paper.style.setProperty('--jp-font-size', this.fontPixels(size));
            for (const button of paper.querySelectorAll('.font-size')) {
                button.setAttribute('aria-pressed', String(button.dataset.font === size));
            }
            this.touchNote(note);
        }
        format(editor, type) {
            editor.focus({ preventScroll: true });
            // Chromium's native edit commands preserve browser selection and undo;
            // only generated safe HTML is persisted as canonical Markdown.
            const command = { bold: 'bold', italic: 'italic', bullet: 'insertUnorderedList', number: 'insertOrderedList' }[type];
            const changed = document.execCommand(command, false);
            if (changed)
                editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        installDrag(handle, note, mode) {
            handle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0)
                    return;
                // Entire fixed header is draggable, but its buttons remain clickable.
                if (mode === 'move' && event.target.closest('button'))
                    return;
                event.preventDefault();
                event.stopPropagation();
                handle.setPointerCapture(event.pointerId);
                const initial = JP.appearance(note), startX = event.clientX, startY = event.clientY;
                const paper = this.cards.get(note.id) || handle.closest('.paper');
                const startRect = paper?.getBoundingClientRect();
                const move = (e) => {
                    if (e.pointerId !== event.pointerId)
                        return;
                    const dx = e.clientX - startX, dy = e.clientY - startY;
                    let updated = mode === 'move'
                        ? { ...initial, offsetX: initial.offsetX + dx, offsetY: initial.offsetY + dy }
                        : { ...initial,
                            width: clamp(initial.width + dx, 180, Math.min(560, innerWidth - 15 - (startRect?.left || 0))),
                            height: clamp(initial.height + dy, 132, Math.min(620, innerHeight - 15 - (startRect?.top || 0))) };
                    note.appearance = updated;
                    if (paper) {
                        paper.style.width = `${updated.width}px`;
                        paper.style.height = `${updated.height}px`;
                    }
                    this.positionCard(note.id);
                    if (mode === 'resize' && startRect && paper) {
                        // When the chosen source-relative placement reflows with width,
                        // compensate offsets to keep the actual TOP-LEFT corner fixed.
                        const adjusted = paper.getBoundingClientRect();
                        updated = { ...updated, offsetX: updated.offsetX + startRect.left - adjusted.left,
                            offsetY: updated.offsetY + startRect.top - adjusted.top };
                        note.appearance = updated;
                        this.positionCard(note.id);
                    }
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
        concealCard(card) {
            if (card.hidden)
                return;
            // Prevent an editor detached by React virtualization from retaining an
            // invisible keyboard focus, and flush pending input through blur/save.
            const active = this.shadow.activeElement;
            if (active instanceof HTMLElement && card.contains(active))
                active.blur();
            card.hidden = true;
        }
        positionCard(noteId) {
            const card = this.cards.get(noteId), note = this.notes.find(n => n.id === noteId);
            if (!card || !note || !this.openIds.has(noteId))
                return;
            const dimensions = JP.appearance(note);
            const match = this.liveMatch(note);
            const rect = match && visibleRect(match.range);
            if (note.anchor) {
                if (!match || !rect) {
                    // A missing DOM anchor is NOT a page-level note. Never use the
                    // fallback viewport position unless the user explicitly opened it.
                    if (!this.explicitlyDetachedIds.has(noteId)) {
                        this.concealCard(card);
                        return;
                    }
                }
                else {
                    this.explicitlyDetachedIds.delete(noteId);
                    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
                        this.concealCard(card);
                        return;
                    }
                }
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
                this.updatePinIcon(paper, fresh);
                const editor = paper.querySelector('.note-editor');
                if (editor) {
                    JP.renderMarkdown(editor, fresh.text);
                    editor.dataset.empty = String(!fresh.text.trim());
                }
                paper.style.setProperty('--paper', COLOR_HEX[JP.appearance(fresh).color]);
                paper.style.setProperty('--jp-font-size', this.fontPixels(JP.appearance(fresh).fontSize));
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
                this.unpinUndo = null;
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
        updatePinIcon(paper, note) {
            const pin = paper.querySelector('.paper-pin');
            if (pin)
                pin.hidden = !note.anchor;
            const mode = paper.querySelector('.note-mode');
            if (mode)
                mode.textContent = note.anchor ? '📌 贴在原文' : '◌ 本页悬浮';
        }
        /** One-way transition: text-pinned -> page-floating, never the reverse. */
        unpinNote(noteId) {
            const note = this.notes.find(n => n.id === noteId);
            if (!note?.anchor)
                return;
            const paper = this.cards.get(noteId);
            const rect = paper?.getBoundingClientRect();
            const style = JP.appearance(note);
            if (this.unpinUndo)
                clearTimeout(this.unpinUndo.timer);
            const timer = window.setTimeout(() => { this.unpinUndo = null; }, 8100);
            this.unpinUndo = { noteId, anchor: { ...note.anchor }, turnId: note.conversationTurnId, oldAppearance: { ...style }, pageKey: this.page, timer };
            if (this.deletedUndo) {
                clearTimeout(this.deletedUndo.timer);
                this.deletedUndo = null;
            }
            note.anchor = undefined;
            note.conversationTurnId = undefined;
            this.explicitlyDetachedIds.delete(noteId);
            // Preserve the top-left screen position instead of teleporting the paper
            // to the generic free-note default on the first unpin.
            if (rect) {
                const baseY = 74 + this.notes.indexOf(note) * 14;
                note.appearance = { ...style, offsetX: rect.left - (innerWidth - style.width - 56), offsetY: rect.top - baseY };
            }
            if (paper)
                this.updatePinIcon(paper, note);
            this.touchNote(note);
            this.refreshAnchors();
            this.toast('已改为本页悬浮便签', true, 8000);
        }
        async undoLastAction() {
            if (this.unpinUndo) {
                const undo = this.unpinUndo;
                clearTimeout(undo.timer);
                this.unpinUndo = null;
                if (undo.pageKey !== this.page)
                    return;
                const note = this.notes.find(n => n.id === undo.noteId);
                if (!note)
                    return;
                note.anchor = undo.anchor;
                note.conversationTurnId = undo.turnId;
                note.appearance = { ...undo.oldAppearance };
                const paper = this.cards.get(note.id);
                if (paper)
                    this.updatePinIcon(paper, note);
                this.touchNote(note);
                this.refreshAnchors();
                this.toast('已恢复原文锚定');
                return;
            }
            await this.undoDeletion();
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
