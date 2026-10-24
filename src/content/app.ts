namespace JP {
  const NOTE_COLORS = ['#F5C84B', '#B9A3EE', '#9FD7A4', '#F5A8C5'];

  const STYLE = `
    :host { all: initial; font: 13px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #292821; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button { font: inherit; cursor: pointer; border: 0; }
    .toolbar { position: fixed; top: 16px; right: 46px; min-width: 236px; padding: 10px;
      border-radius: 13px; box-shadow: 0 8px 25px #0002; border: 1px solid #e6dbb6; background: #fff9e6;
      pointer-events: auto; }
    .toolbar-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; font-weight:700; }
    .toolbar-head span { color:#6d613e; font-size:11px; font-weight:400; }
    .toolbar-actions { display:flex; gap:6px; flex-wrap: wrap; }
    .primary { background:#7059c1; color:white; border-radius:8px; padding:7px 10px; }
    .secondary { background:#eee9d7; color:#433a30; border-radius:8px; padding:7px 10px; }
    .toolbar small { display:block; color:#736c5c; padding-top:7px; line-height:1.35; }
    .bubble { position:fixed; transform:translateY(-100%); pointer-events:auto; z-index:5; }
    .bubble button { background:#302b3f; color:white; padding:7px 12px; border-radius:9px;
      box-shadow:0 4px 14px #0003; white-space:nowrap; }
    .rail {position:fixed; top:20%; right:8px; height:60%; width:30px; border:1px solid #e6dfcd;
      border-radius:17px; background:#fffdf7ed; box-shadow:0 3px 12px #0001; pointer-events:auto;}
    .rail-head {position:absolute; top:4px; left:3px; width:22px; height:22px; border-radius:50%; background:#eee8d8;
      color:#473c2b; padding:0; font-size:12px;}
    .rail-track {position:absolute; top:30px; bottom:12px; left:4px; right:4px;}
    .rail-pin {position:absolute; left:4px; width:14px; height:14px; border:1px solid #725c37;
      border-radius:50%; box-shadow:0 1px 4px #0003; transform:translateY(-50%); padding:0;}
    .rail-pin.missing {background:#b3b3b3 !important; border-style:dashed;}
    .list {position:fixed; right:42px; top:20%; width:278px; max-height:65vh; overflow-y:auto;
      pointer-events:auto; background:#fffdf5; border:1px solid #e6dfcd; border-radius:12px;
      box-shadow:0 7px 24px #0002; padding:9px;}
    .list-title {display:flex;justify-content:space-between;padding:5px 7px 9px;font-weight:700;}
    .list button.entry {width:100%;display:flex;text-align:left;gap:9px;align-items:flex-start;
      background:transparent;padding:9px 6px;border-top:1px solid #eee9da;color:#282721;}
    .list button.entry:hover {background:#f5efdd;}
    .swatch {display:inline-block;flex:0 0 9px;width:9px;height:9px;border-radius:50%;margin-top:5px;}
    .entry-title {display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:218px;font-weight:600;}
    .entry-subtitle {display:block;color:#797466;font-size:11px;}
    .marker {position:fixed;width:24px;height:24px;border-radius:50%;border:2px solid #fff;
      color:#333;box-shadow:0 1px 7px #0005; pointer-events:auto; z-index:3; padding:0; font-weight:bold;}
    .marker:hover, .rail-pin:hover {outline:2px solid #7059c1;outline-offset:2px;}
    .card {position:fixed;width:310px;max-width:calc(100vw - 20px);min-height:200px;
      background:#fff0b7; border:1px solid #dfcd95; border-radius:13px; padding:12px;
      pointer-events:auto; box-shadow:0 10px 30px #0003; z-index:4;}
    .card-head {display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;}
    .card-head strong {overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:205px;}
    .card-head button {background:transparent;color:#554827;font-size:17px;padding:0 4px;}
    .quote {color:#64562e;max-height:46px;overflow:auto;font-size:11px;border-left:3px solid #bca15c;
      padding:3px 8px;margin-bottom:10px;background:#ffffff44;overflow-wrap:anywhere;}
    .card textarea {font:13px/1.5 system-ui, sans-serif; background:#fff9dc;border:1px solid #dccb93;
      border-radius:7px; width:100%;min-height:95px;resize:vertical;padding:8px;color:#29251a;}
    .card-foot {display:flex;gap:7px;align-items:center;justify-content:space-between;margin-top:8px;}
    .card-foot button {background:#f1d992;border-radius:6px;color:#4e4126;padding:5px 8px;}
    .card-foot .delete {color:#9e352d;background:#fbe6d5;}
    .save-state {flex:1;text-align:right;font-size:11px;color:#6d603b;}
    .toast {position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#2f2c34;
      color:white;padding:9px 14px;border-radius:10px;box-shadow:0 5px 16px #0002;
      z-index:7;pointer-events:none;max-width:min(400px,90vw);text-align:center;}
    :focus-visible {outline:2px solid #7158ba;outline-offset:2px;}
  `;

  // Static shell. Parsed with DOMParser in mount(); no page or note content is
  // ever interpolated here, and note text only reaches the DOM via textContent.
  const MARKUP = `
        <section class="toolbar" aria-label="JotPatch 工具条">
          <div class="toolbar-head">📒 JotPatch <span>阶段 0 · 内容锚定</span></div>
          <div class="toolbar-actions">
            <button id="jp-pin" class="primary" type="button">📌 贴住选中文字</button>
            <button id="jp-restore" class="secondary" type="button">自动恢复设置</button>
          </div>
          <small>先选中网页文字，再点击旁边的「贴便签」。点击插件图标可隐藏/显示。</small>
        </section>
        <div id="jp-bubble" class="bubble" hidden><button type="button" id="jp-bubble-pin">📌 贴便签</button></div>
        <nav id="jp-rail" class="rail" aria-label="本页便签导航" hidden>
          <button id="jp-list-toggle" class="rail-head" title="查看本页便签" aria-label="查看本页便签">0</button>
          <div id="jp-rail-track" class="rail-track"></div>
        </nav>
        <aside id="jp-list" class="list" aria-label="本页便签列表" hidden></aside>
        <div id="jp-markers"></div>
        <section id="jp-card" class="card" aria-label="便签编辑" hidden>
          <div class="card-head"><strong id="jp-card-title">便签</strong><button id="jp-card-close" type="button" aria-label="收起便签">×</button></div>
          <div class="quote" id="jp-quote"></div>
          <textarea id="jp-editor" aria-label="便签内容" placeholder="写下你的想法…"></textarea>
          <div class="card-foot">
            <button id="jp-jump" type="button">↗ 原文</button>
            <button id="jp-copy" type="button">复制</button>
            <button id="jp-delete" class="delete" type="button">删除</button>
            <span id="jp-save-state" class="save-state"></span>
          </div>
        </section>
        <div id="jp-toast" class="toast" role="status" aria-live="polite" hidden></div>`;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const result = document.createElement(tag);
    if (className) result.className = className;
    return result;
  }

  function safeRect(range: Range): DOMRect | null {
    // The first rect stays next to the beginning of a multiline selection.
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) return rect;
    }
    const fallback = range.getBoundingClientRect();
    return fallback.height ? fallback : null;
  }

  function createNoteId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  export class JotPatchApp {
    private repository = new NoteRepository();
    private page = pageKey(location.href);
    private notes: Note[] = [];
    private matches = new Map<string, Match>();
    private index: TextIndex | null = null;
    private host!: HTMLDivElement;
    private shadow!: ShadowRoot;
    private pendingRange: Range | null = null;
    private openId: string | null = null;
    private visible = true;
    private listOpen = false;
    private refreshTimer = 0;
    private scrollScheduled = false;
    private loadRequest = 0;
    private writeTimers = new Map<string, number>();
    private writeChains = new Map<string, Promise<void>>();
    private observer!: MutationObserver;
    private toastTimer = 0;

    async start(): Promise<void> {
      this.mount();
      this.setupEvents();
      await this.loadPage();
      this.observer = new MutationObserver(() => this.scheduleRefresh());
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      // Active only on pages where the extension was invoked or authorized.
      window.setInterval(() => this.checkPageRoute(), 1400);
    }

    toggle(): void {
      this.visible = !this.visible;
      this.host.hidden = !this.visible;
      if (this.visible) this.scheduleRefresh();
    }

    private mount(): void {
      this.host = el('div');
      this.host.id = 'jotpatch-root';
      this.host.setAttribute('data-jotpatch-exclude', '');
      this.host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      // Parse the static shell with DOMParser and assign the stylesheet through
      // textContent: nothing from the page or a note is interpolated into markup.
      // (A <style> inside a parsed string would land in the document head; Gecko
      // and Chromium both agree on that, so the style element is built explicitly.)
      const shell = new DOMParser().parseFromString(MARKUP, 'text/html');
      const style = document.createElement('style');
      style.textContent = STYLE;
      this.shadow.append(style, ...Array.from(shell.body.childNodes));
      (document.body || document.documentElement).appendChild(this.host);
    }

    private $<T extends HTMLElement>(selector: string): T {
      const item = this.shadow.querySelector<T>(selector);
      if (!item) throw new Error(`Missing JotPatch UI: ${selector}`);
      return item;
    }

    private setupEvents(): void {
      this.$<HTMLButtonElement>('#jp-pin').addEventListener('click', () => void this.createFromSelection());
      this.$<HTMLButtonElement>('#jp-bubble-pin').addEventListener('pointerdown', (event) => event.preventDefault());
      this.$<HTMLButtonElement>('#jp-bubble-pin').addEventListener('click', () => void this.createFromSelection());
      this.$<HTMLButtonElement>('#jp-restore').addEventListener('click', () => {
        void JP.api.runtime.sendMessage({ type: 'JP_OPEN_SITE_SETUP' }).catch(() => {
          this.toast('无法打开授权页面，请从插件详情进入选项。');
        });
      });
      this.$<HTMLButtonElement>('#jp-list-toggle').addEventListener('click', () => {
        this.listOpen = !this.listOpen;
        this.renderList();
      });
      this.$<HTMLButtonElement>('#jp-card-close').addEventListener('click', () => this.closeCard());
      this.$<HTMLButtonElement>('#jp-jump').addEventListener('click', () => {
        if (this.openId) this.goTo(this.openId, false);
      });
      this.$<HTMLButtonElement>('#jp-copy').addEventListener('click', () => void this.copyNote());
      this.$<HTMLButtonElement>('#jp-delete').addEventListener('click', () => void this.deleteNote());
      this.$<HTMLTextAreaElement>('#jp-editor').addEventListener('input', (event) => {
        const note = this.notes.find((n) => n.id === this.openId);
        if (!note) return;
        note.text = (event.target as HTMLTextAreaElement).value;
        note.updatedAt = Date.now();
        this.$<HTMLElement>('#jp-save-state').textContent = '等待保存…';
        this.scheduleSave(note.id);
      });
      this.$<HTMLTextAreaElement>('#jp-editor').addEventListener('blur', () => {
        if (this.openId) void this.saveNow(this.openId);
      });
      document.addEventListener('mouseup', (event) => this.maybeOfferSelection(event.target));
      document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift' || event.key.startsWith('Arrow')) this.maybeOfferSelection(event.target);
      });
      window.addEventListener('scroll', () => this.schedulePosition(), true);
      window.addEventListener('resize', () => this.schedulePosition());
      window.addEventListener('hashchange', () => this.checkPageRoute());
      window.addEventListener('popstate', () => this.checkPageRoute());
    }

    private checkPageRoute(): void {
      const next = pageKey(location.href);
      if (next === this.page) return;
      if (this.openId) void this.saveNow(this.openId);
      this.page = next;
      this.openId = null;
      this.pendingRange = null;
      this.$<HTMLElement>('#jp-card').hidden = true;
      this.$<HTMLElement>('#jp-bubble').hidden = true;
      this.listOpen = false;
      void this.loadPage();
    }

    private async loadPage(): Promise<void> {
      const request = ++this.loadRequest;
      const page = this.page;
      try {
        const notes = await this.repository.list(page);
        if (request !== this.loadRequest || page !== this.page) return;
        this.notes = notes;
        this.refreshAnchors();
      } catch (error) {
        console.warn('JotPatch failed to load notes', error);
        this.toast('读取便签失败，请检查扩展存储。');
      }
    }

    private maybeOfferSelection(target: EventTarget | null): void {
      if (!this.visible || (target instanceof Node && this.host.contains(target))) return;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        this.$<HTMLElement>('#jp-bubble').hidden = true;
        return;
      }
      const range = selection.getRangeAt(0);
      if (!range.toString().trim() || range.toString().length > 1600) return;
      if (this.host.contains(range.commonAncestorContainer)) return;
      const rect = safeRect(range);
      if (!rect) return;
      this.pendingRange = range.cloneRange();
      const bubble = this.$<HTMLElement>('#jp-bubble');
      bubble.hidden = false;
      bubble.style.left = `${Math.max(8, Math.min(window.innerWidth - 105, rect.right - 30))}px`;
      bubble.style.top = `${Math.max(45, rect.top - 6)}px`;
    }

    private async createFromSelection(): Promise<void> {
      const range = this.pendingRange || document.getSelection()?.getRangeAt(0);
      if (!range) { this.toast('请先选中网页中的一段文字。'); return; }
      const index = buildTextIndex();
      const anchor = captureSelection(range, index);
      if (!anchor) {
        this.toast('不能锚定这个选区：请选中 1–1600 字的普通网页文字。');
        return;
      }
      const timestamp = Date.now();
      const note: Note = {
        schemaVersion: 1, id: createNoteId(), pageKey: this.page,
        sourceUrl: location.href, sourceTitle: document.title, anchor,
        text: '', createdAt: timestamp, updatedAt: timestamp
      };
      try {
        await this.repository.put(note);
        this.notes.push(note);
        this.$<HTMLElement>('#jp-bubble').hidden = true;
        this.pendingRange = null;
        document.getSelection()?.removeAllRanges();
        this.refreshAnchors();
        this.showCard(note.id);
        this.toast('已贴到原文。刷新后可以从 Dock 找回。');
      } catch (error) {
        console.warn('JotPatch failed to save', error);
        this.toast('保存失败，未创建便签。');
      }
    }

    private refreshAnchors(): void {
      if (!document.body) return;
      this.index = buildTextIndex();
      this.matches.clear();
      for (const note of this.notes) {
        const match = resolveAnchor(note.anchor, this.index);
        if (match) this.matches.set(note.id, match);
      }
      this.paintHighlights();
      this.renderDock();
      this.renderMarkers();
      this.positionCard();
    }

    private scheduleRefresh(): void {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refreshAnchors(), 650);
    }

    private paintHighlights(): void {
      const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
      if (!highlights || !HighlightCtor) return;
      const ranges = [...this.matches.values()].map((match) => match.range);
      if (ranges.length) highlights.set('jotpatch-anchored-text', new HighlightCtor(...ranges));
      else highlights.delete('jotpatch-anchored-text');
    }

    private renderDock(): void {
      const rail = this.$<HTMLElement>('#jp-rail');
      rail.hidden = !this.notes.length;
      this.$<HTMLButtonElement>('#jp-list-toggle').textContent = String(this.notes.length);
      const track = this.$<HTMLElement>('#jp-rail-track');
      track.replaceChildren();
      if (!this.notes.length) { this.listOpen = false; this.renderList(); return; }
      const sorted = [...this.notes].sort((a, b) =>
        (this.matches.get(a.id)?.start ?? Infinity) - (this.matches.get(b.id)?.start ?? Infinity));
      const usable = this.index?.text.length || 1;
      const placed: number[] = [];
      sorted.forEach((note, index) => {
        const match = this.matches.get(note.id);
        let at = match ? (match.start / usable) * 100 : 92 + (index % 3) * 2;
        at = Math.max(2, Math.min(98, at));
        // Avoid completely overlapping dots; the expanded list is the exact fallback.
        while (placed.some((previous) => Math.abs(previous - at) < 3.5) && at <= 96) at += 3.5;
        placed.push(at);
        const button = el('button', `rail-pin${match ? '' : ' missing'}`);
        button.type = 'button';
        button.style.background = match ? NOTE_COLORS[index % NOTE_COLORS.length] : '#aaa';
        button.style.top = `${at}%`;
        button.title = `${match ? '跳到' : '失效锚点：'} ${note.text.trim().slice(0, 50) || note.anchor.exact.slice(0, 45)}`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', () => this.goTo(note.id));
        track.appendChild(button);
      });
      this.renderList();
    }

    private renderList(): void {
      const list = this.$<HTMLElement>('#jp-list');
      list.hidden = !this.listOpen || !this.notes.length;
      if (list.hidden) return;
      list.replaceChildren();
      const header = el('div', 'list-title');
      header.textContent = `本页便签 · ${this.notes.length}`;
      const close = el('button');
      close.textContent = '×'; close.title = '关闭列表';
      close.addEventListener('click', () => { this.listOpen = false; this.renderList(); });
      header.appendChild(close);
      list.appendChild(header);
      const sorted = [...this.notes].sort((a, b) =>
        (this.matches.get(a.id)?.start ?? Infinity) - (this.matches.get(b.id)?.start ?? Infinity));
      sorted.forEach((note, i) => {
        const button = el('button', 'entry'); button.type = 'button';
        const swatch = el('span', 'swatch'); swatch.style.background = NOTE_COLORS[i % NOTE_COLORS.length];
        const description = el('span');
        const title = el('span', 'entry-title');
        title.textContent = note.text.trim().split('\n')[0] || note.anchor.exact.trim().slice(0, 44);
        const subtitle = el('span', 'entry-subtitle');
        subtitle.textContent = this.matches.has(note.id) ? `原文：${note.anchor.exact.trim().slice(0, 30)}` : '⚠ 原文暂时未找到 · 便签已保存';
        description.append(title, subtitle);
        button.append(swatch, description);
        button.addEventListener('click', () => this.goTo(note.id));
        list.appendChild(button);
      });
    }

    private renderMarkers(): void {
      const container = this.$<HTMLElement>('#jp-markers');
      container.replaceChildren();
      this.notes.forEach((note, i) => {
        const button = el('button', 'marker');
        button.type = 'button';
        button.dataset.noteId = note.id;
        button.style.background = NOTE_COLORS[i % NOTE_COLORS.length];
        button.textContent = '✎';
        button.title = note.text.trim().slice(0, 70) || note.anchor.exact.slice(0, 70);
        button.setAttribute('aria-label', `打开便签：${button.title}`);
        button.addEventListener('click', () => this.showCard(note.id));
        container.appendChild(button);
      });
      this.positionMarkers();
    }

    private schedulePosition(): void {
      if (this.scrollScheduled) return;
      this.scrollScheduled = true;
      window.requestAnimationFrame(() => {
        this.scrollScheduled = false;
        this.positionMarkers();
        this.positionCard();
      });
    }

    private positionMarkers(): void {
      for (const marker of Array.from(this.shadow.querySelectorAll<HTMLButtonElement>('.marker'))) {
        const match = this.matches.get(marker.dataset.noteId || '');
        const rect = match && safeRect(match.range);
        if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
          marker.hidden = true;
          continue;
        }
        marker.hidden = false;
        marker.style.left = `${Math.max(5, Math.min(window.innerWidth - 29, rect.right + 7))}px`;
        marker.style.top = `${Math.max(6, Math.min(window.innerHeight - 29, rect.top))}px`;
      }
    }

    private goTo(id: string, show = true): void {
      const match = this.matches.get(id);
      if (match) {
        const node = match.range.startContainer;
        const target = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.schedulePosition();
      } else {
        this.toast('原文暂时未找到。便签仍可编辑，不会错误地贴到其他段落。');
      }
      if (show) this.showCard(id);
    }

    private showCard(id: string): void {
      const note = this.notes.find((item) => item.id === id);
      if (!note) return;
      if (this.openId && this.openId !== id) void this.saveNow(this.openId);
      this.openId = id;
      this.$<HTMLElement>('#jp-card').hidden = false;
      this.$<HTMLElement>('#jp-card-title').textContent = this.matches.has(id) ? '📌 原文便签' : '⚠ 待定位的便签';
      this.$<HTMLElement>('#jp-quote').textContent = `“${note.anchor.exact.slice(0, 180)}”`;
      this.$<HTMLTextAreaElement>('#jp-editor').value = note.text;
      this.$<HTMLElement>('#jp-save-state').textContent = '已保存';
      this.positionCard();
      this.$<HTMLTextAreaElement>('#jp-editor').focus({ preventScroll: true });
    }

    private positionCard(): void {
      const card = this.$<HTMLElement>('#jp-card');
      if (!this.openId) return;
      const match = this.matches.get(this.openId);
      const rect = match && safeRect(match.range);
      const width = Math.min(310, window.innerWidth - 20);
      if (rect && (rect.bottom < 0 || rect.top > window.innerHeight)) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      if (rect) {
        let x = rect.right + 36;
        if (x + width > window.innerWidth - 16) x = rect.left - width - 18;
        if (x < 10) x = window.innerWidth - width - 44;
        card.style.left = `${Math.max(10, Math.min(window.innerWidth - width - 10, x))}px`;
        card.style.top = `${Math.max(10, Math.min(window.innerHeight - 240, rect.top))}px`;
      } else {
        card.style.left = `${Math.max(10, (window.innerWidth - width) / 2)}px`;
        card.style.top = '80px';
      }
    }

    private closeCard(): void {
      if (this.openId) void this.saveNow(this.openId);
      this.openId = null;
      this.$<HTMLElement>('#jp-card').hidden = true;
      this.renderList();
    }

    private scheduleSave(id: string): void {
      window.clearTimeout(this.writeTimers.get(id));
      this.writeTimers.set(id, window.setTimeout(() => void this.saveNow(id), 350));
    }

    private async saveNow(id: string): Promise<void> {
      window.clearTimeout(this.writeTimers.get(id));
      this.writeTimers.delete(id);
      const note = this.notes.find((item) => item.id === id);
      if (!note) return;
      // Serialize writes so a stale async response cannot overwrite newer text.
      const snapshot: Note = { ...note };
      const before = this.writeChains.get(id) || Promise.resolve();
      const next = before.catch(() => undefined).then(() => this.repository.put(snapshot));
      this.writeChains.set(id, next);
      try {
        await next;
        if (this.openId === id && note.updatedAt === snapshot.updatedAt) {
          this.$<HTMLElement>('#jp-save-state').textContent = '已保存';
        }
      } catch (error) {
        console.warn('JotPatch save failed:', error);
        if (this.openId === id) this.$<HTMLElement>('#jp-save-state').textContent = '保存失败';
        this.toast('保存失败，请复制正文备份后重试。');
      }
    }

    private async copyNote(): Promise<void> {
      const text = this.notes.find((note) => note.id === this.openId)?.text || '';
      try { await navigator.clipboard.writeText(text); this.toast('便签正文已复制'); }
      catch { this.toast('复制失败，请手动选中文本复制。'); }
    }

    private async deleteNote(): Promise<void> {
      if (!this.openId) return;
      if (!window.confirm('删除这张便签？阶段 0 尚未提供回收站。')) return;
      const id = this.openId;
      window.clearTimeout(this.writeTimers.get(id));
      this.writeTimers.delete(id);
      try {
        await this.writeChains.get(id)?.catch(() => undefined);
        await this.repository.remove(id);
        this.notes = this.notes.filter((note) => note.id !== id);
        this.openId = null;
        this.$<HTMLElement>('#jp-card').hidden = true;
        this.refreshAnchors();
        this.toast('已删除便签');
      } catch { this.toast('删除失败，请稍后再试。'); }
    }

    private toast(message: string): void {
      window.clearTimeout(this.toastTimer);
      const toast = this.$<HTMLElement>('#jp-toast');
      toast.textContent = message;
      toast.hidden = false;
      this.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2600);
    }
  }
}
