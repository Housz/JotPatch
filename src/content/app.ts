namespace JP {
  // Paper is the editor. No title bar, quote box, footer or permanent toolbar.
  const COLOR_HEX: Record<NoteColor, string> = {
    yellow: '#FFF1B8', pink: '#FBE1E9', green: '#DFF1DD',
    blue: '#DAECFF', purple: '#EAE2FA', gray: '#F0EFEC'
  };
  const COLOR_ORDER: NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
  const PREFERENCE_KEY = 'jotpatch:preferences:v1';

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag);
    if (className) item.className = className;
    return item;
  }
  function visibleRect(range: Range): DOMRect | null {
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) return rect;
    const rect = range.getBoundingClientRect();
    return rect.height ? rect : null;
  }
  function id(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(Math.max(lo, hi), x)); }

  export class JotPatchApp {
    private repo = new NoteRepository();
    private page = pageKey(location.href);
    private notes: Note[] = [];
    private matches = new Map<string, Match>();
    private index: TextIndex | null = null;
    private host!: HTMLDivElement;
    private shadow!: ShadowRoot;
    private observer!: MutationObserver;
    private pendingRange: Range | null = null;
    private openIds = new Set<string>();
    // Only a direct user action may open a paper with an unresolved text anchor.
    private explicitlyDetachedIds = new Set<string>();
    private cards = new Map<string, HTMLElement>();
    private visible = true;
    private launcherOpen = false;
    private listOpen = false;
    private selectionTrigger: SelectionTrigger = 'always';
    private conversationNavigation = true;
    private conversation: ConversationSnapshot = { site: null, turns: [], nativeRailPresent: false };
    private conversationTimer = 0;
    private conversationIndex = new ConversationIndex();
    private conversationScrollRootRef: Element | null = null;
    private scanningHistory = false;
    private stopHistoryScan = false;
    private activeTurnId: string | null = null;
    private refreshTimer = 0;
    private scrollScheduled = false;
    private loadRequest = 0;
    private toastTimer = 0;
    private zOrder = 8;
    private writeTimers = new Map<string, number>();
    private writeChains = new Map<string, Promise<void>>();
    private knownRevisions = new Map<string, number>();
    private dirty = new Set<string>();
    private conflicts = new Set<string>();
    private ownWrites = new Set<string>();
    private deletedUndo: { note: Note; timer: number } | null = null;

    async start(): Promise<void> {
      this.mount();
      this.setupEvents();
      await this.loadPreferences();
      await this.loadPage();
      this.refreshConversation();
      this.observer = new MutationObserver((records) => {
        // Ignore our own Shadow DOM host mutations. Otherwise rebuilding the
        // Dock repeatedly schedules another expensive conversation scan.
        const external = records.filter(record => !this.host.contains(record.target));
        if (!external.length) return;
        this.scheduleRefresh();
        if (external.some(record => record.type === 'childList')) this.scheduleConversationScan();
      });
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      // SPA navigation without injecting into page-owned history functions.
      window.setInterval(() => this.checkPageRoute(), 1400);
    }

    toggle(): void {
      this.visible = !this.visible;
      this.host.hidden = !this.visible;
      if (this.visible) { this.launcherOpen = true; this.renderLauncher(); this.scheduleRefresh(); }
    }
    openLauncher(): void {
      this.visible = true; this.host.hidden = false; this.launcherOpen = true;
      this.renderLauncher(); this.scheduleRefresh();
    }
    toggleLauncher(): void {
      if (!this.visible) { this.openLauncher(); return; }
      this.launcherOpen = !this.launcherOpen; this.renderLauncher();
    }

    private mount(): void {
      this.host = el('div');
      this.host.id = 'jotpatch-root';
      this.host.setAttribute('data-jotpatch-exclude', '');
      this.host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = `
        <style>${PAPER_STYLES}</style>
        <div class="launcher" id="jp-launcher" hidden aria-label="JotPatch 快捷操作">
          <button id="jp-new" aria-label="新建本页便签" title="新建本页便签" type="button">+</button>
          <button id="jp-settings" aria-label="设置" title="设置" type="button">⚙</button>
          <button id="jp-hide" aria-label="隐藏 JotPatch" title="隐藏便签" type="button">−</button>
        </div>
        <div class="bubble" id="jp-bubble" hidden><button id="jp-bubble-pin" aria-label="将便签钉在选中文字旁" title="贴便签" type="button">📌</button></div>
        <nav id="jp-rail" class="rail" aria-label="网页对话与便签导航" hidden>
          <button id="jp-list-toggle" class="rail-head" title="打开本页导航列表" type="button">0</button>
          <div class="rail-track" id="jp-rail-track"></div>
        </nav>
        <div id="jp-turn-preview" class="turn-preview" role="tooltip" hidden></div>
        <aside id="jp-note-popover" class="note-popover" aria-label="本轮便签" hidden></aside>
        <aside id="jp-list" class="list" aria-label="本页便签列表" hidden></aside>
        <div id="jp-markers"></div>
        <div id="jp-cards"></div>
        <div id="jp-toast" class="toast" role="status" aria-live="polite" hidden><span id="jp-toast-text"></span><button id="jp-undo" type="button" hidden>撤销</button></div>`;
      (document.body || document.documentElement).appendChild(this.host);
    }

    private $<T extends HTMLElement>(selector: string): T {
      const node = this.shadow.querySelector<T>(selector);
      if (!node) throw new Error(`Missing JotPatch UI: ${selector}`);
      return node;
    }

    private setupEvents(): void {
      this.$<HTMLButtonElement>('#jp-new').addEventListener('click', () => void this.createPageNote());
      this.$<HTMLButtonElement>('#jp-hide').addEventListener('click', () => this.toggle());
      this.$<HTMLButtonElement>('#jp-settings').addEventListener('click', () => this.openSettings());
      this.$<HTMLButtonElement>('#jp-bubble-pin').addEventListener('pointerdown', e => e.preventDefault());
      this.$<HTMLButtonElement>('#jp-bubble-pin').addEventListener('click', () => void this.createFromSelection());
      this.$<HTMLButtonElement>('#jp-list-toggle').addEventListener('click', () => {
        this.listOpen = !this.listOpen; this.renderList();
      });
      this.$<HTMLButtonElement>('#jp-undo').addEventListener('click', () => void this.undoDeletion());
      document.addEventListener('keydown', event => {
        if(event.key==='Escape') for(const card of this.cards.values()){const menu=card.querySelector<HTMLElement>('.note-menu');if(menu)menu.hidden=true;card.querySelector('.menu-trigger')?.setAttribute('aria-expanded','false');}
      });
      document.addEventListener('pointerdown', event => {
        const path = event.composedPath();
        if (!path.includes(this.$<HTMLElement>('#jp-note-popover'))) this.hideNotePopover();
        for (const card of this.cards.values()) {
          const menu = card.querySelector<HTMLElement>('.note-menu');
          if (menu && !path.includes(menu) && !path.includes(card.querySelector('.menu-trigger')!)){menu.hidden=true;card.querySelector('.menu-trigger')?.setAttribute('aria-expanded','false');}
        }
      }, true);
      document.addEventListener('mouseup', e => this.maybeOfferSelection(e.target, e.altKey));
      document.addEventListener('keyup', e => {
        if (e.key.startsWith('Arrow') || e.key === 'Shift') this.maybeOfferSelection(e.target, e.altKey);
      });
      document.addEventListener('contextmenu', e => this.rememberSelection(e.target));
      window.addEventListener('scroll', () => this.schedulePosition(), true);
      window.addEventListener('resize', () => this.schedulePosition());
      window.addEventListener('hashchange', () => this.checkPageRoute());
      window.addEventListener('popstate', () => this.checkPageRoute());
      chrome.runtime.onMessage.addListener((message: {type: string; selectionText?: string}, _sender: unknown, respond: (result: unknown) => void) => {
        if (message.type === 'JP_PING') { respond({ ready: true }); return false; }
        if (message.type === 'JP_TOGGLE_UI') { this.toggle(); respond({ ok: true }); return false; }
        if (message.type === 'JP_OPEN_LAUNCHER') { this.openLauncher(); respond({ ok: true }); return false; }
        if (message.type === 'JP_TOGGLE_LAUNCHER') { this.toggleLauncher(); respond({ ok: true }); return false; }
        if (message.type === 'JP_CREATE_FROM_CONTEXT') {
          this.openLauncher();
          void this.createFromContext(message.selectionText || '').then(
            ok => respond({ok}), () => respond({ok:false}));
          return true;
        }
        return false;
      });
      chrome.storage.onChanged?.addListener((changes: Record<string, {newValue?: unknown; oldValue?: unknown}>, area: string) => {
        if (area !== 'local') return;
        if (changes[PREFERENCE_KEY]) {
          const preferences = changes[PREFERENCE_KEY].newValue as Partial<Preferences> | undefined;
          const trigger = preferences?.selectionTrigger;
          this.selectionTrigger = trigger === 'alt' || trigger === 'off' ? trigger : 'always';
          this.conversationNavigation = preferences?.conversationNavigation !== false;
          this.$<HTMLElement>('#jp-bubble').hidden = true;
          this.refreshConversation();
        }
        for (const [key, change] of Object.entries(changes)) {
          const fresh = this.repo.noteFromChange(key, change.newValue);
          if (fresh && !this.ownWrites.has(fresh.id) && fresh.pageKey === this.page) this.syncExternalNote(fresh);
        }
      });
    }

    private async loadPreferences(): Promise<void> {
      try {
        const prefs = await this.repo.preferences();
        this.selectionTrigger = prefs.selectionTrigger;
        this.conversationNavigation = prefs.conversationNavigation;
      } catch { this.selectionTrigger = 'always'; this.conversationNavigation = true; }
    }
    private openSettings(): void {
      void chrome.runtime.sendMessage({ type: 'JP_OPEN_SITE_SETUP' }).catch(() => this.toast('请从扩展管理页打开 JotPatch 设置。'));
    }
    private renderLauncher(): void { this.$<HTMLElement>('#jp-launcher').hidden = !this.launcherOpen; }

    private checkPageRoute(): void {
      const next = pageKey(location.href);
      if (next === this.page) return;
      for (const id of this.openIds) void this.saveNow(id);
      this.page = next;
      this.pendingRange = null;
      this.$<HTMLElement>('#jp-bubble').hidden = true;
      this.openIds.clear(); this.explicitlyDetachedIds.clear(); this.cards.clear(); this.$<HTMLElement>('#jp-cards').replaceChildren();
      this.listOpen = false;
      this.stopHistoryScan = true;
      this.conversationIndex.reset();
      this.conversationScrollRootRef = null;
      this.conversation = { site: conversationSite(), turns: [], nativeRailPresent: false };
      this.hideTurnPreview();
      void this.loadPage().then(() => this.scheduleConversationScan(true));
    }
    private async loadPage(): Promise<void> {
      const request = ++this.loadRequest;
      const page = this.page;
      try {
        const notes = await this.repo.list(page);
        if (request !== this.loadRequest || page !== this.page) return;
        this.notes = notes;
        for (const note of notes) this.knownRevisions.set(note.id, note.revision || 0);
        this.refreshAnchors();
      } catch (error) { console.warn('JotPatch load failed', error); this.toast('便签读取失败，请检查扩展存储'); }
    }

    private rememberSelection(target: EventTarget | null): Range | null {
      if (target instanceof Node && (this.host.contains(target) || target.getRootNode() === this.shadow)) return null;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      const range = selection.getRangeAt(0);
      if (!range.toString().trim() || range.toString().length > 1600 || this.host.contains(range.commonAncestorContainer)) return null;
      this.pendingRange = range.cloneRange();
      return this.pendingRange;
    }
    private maybeOfferSelection(target: EventTarget | null, alt: boolean): void {
      const bubble = this.$<HTMLElement>('#jp-bubble');
      bubble.hidden = true;
      if (!this.visible || this.selectionTrigger === 'off' || (this.selectionTrigger === 'alt' && !alt)) return;
      const range = this.rememberSelection(target);
      if (!range) return;
      const rect = visibleRect(range);
      if (!rect) return;
      bubble.hidden = false;
      bubble.style.left = `${clamp(rect.right - 17, 8, window.innerWidth - 40)}px`;
      bubble.style.top = `${clamp(rect.top - 6, 40, window.innerHeight - 8)}px`;
    }
    private async createFromContext(selectionText: string): Promise<boolean> {
      const current = document.getSelection();
      const live = current?.rangeCount && !current.isCollapsed ? current.getRangeAt(0) : null;
      let range = this.pendingRange || live;
      if (range && selectionText && range.toString().trim() !== selectionText.trim()) range = null;
      if (!range) {
        const index = buildTextIndex();
        range = uniqueQuoteRange(selectionText, index);
      }
      if (!range) { this.toast('无法可靠定位选区。请在网页中重新选中原文后再试。'); return false; }
      return this.createFromSelection(range);
    }
    private async createFromSelection(givenRange?: Range): Promise<boolean> {
      const range = givenRange || this.pendingRange || document.getSelection()?.getRangeAt(0);
      if (!range) { this.toast('请选中网页文字'); return false; }
      const index = buildTextIndex();
      const anchor = captureSelection(range, index);
      if (!anchor) { this.toast('请选择 1–1600 字的普通网页文字'); return false; }
      return this.createNote(anchor);
    }
    private async createPageNote(): Promise<boolean> { return this.createNote(); }
    private async createNote(anchor?: TextAnchor): Promise<boolean> {
      const now = Date.now();
      const note: Note = {
        schemaVersion: 1, id: id(), pageKey: this.page, sourceUrl: location.href,
        sourceTitle: document.title, anchor, text: '',
        appearance: {color:'yellow', width:256, height:202, offsetX:0, offsetY:0},
        createdAt: now, updatedAt: now, revision: 0
      };
      try {
        this.ownWrites.add(note.id);
        await this.repo.put(note);
        this.knownRevisions.set(note.id, 0);
        this.notes.push(note);
        this.pendingRange = null;
        this.$<HTMLElement>('#jp-bubble').hidden = true;
        document.getSelection()?.removeAllRanges();
        this.launcherOpen = false; this.renderLauncher();
        this.refreshAnchors(); this.showCard(note.id, true);
        return true;
      } catch (error) { console.warn('JotPatch creation failed', error); this.toast('保存失败，未创建便签'); return false; }
      finally { this.ownWrites.delete(note.id); }
    }

    private refreshAnchors(): void {
      if (!document.body) return;
      this.index = buildTextIndex(); this.matches.clear();
      for (const note of this.notes) if (note.anchor) {
        const match = resolveAnchor(note.anchor, this.index);
        if (match) this.matches.set(note.id, match);
      }
      this.paintHighlights(); this.renderDock(); this.renderMarkers(); this.schedulePosition();
    }
    private scheduleRefresh(): void {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refreshAnchors(), 650);
    }
    private paintHighlights(): void {
      const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
      if (!highlights || !HighlightCtor) return;
      const ranges = [...this.matches.values()].map(m => m.range);
      if (ranges.length) highlights.set('jotpatch-anchored-text', new HighlightCtor(...ranges));
      else highlights.delete('jotpatch-anchored-text');
    }

    private sortedNotes(): Note[] {
      return [...this.notes].sort((a,b) =>
        (this.matches.get(a.id)?.start ?? (a.anchor ? Infinity : -1)) -
        (this.matches.get(b.id)?.start ?? (b.anchor ? Infinity : -1)) || a.createdAt - b.createdAt);
    }
    /** Scan only known AI sites. A leading-edge throttle handles streaming DOM changes. */
    private scheduleConversationScan(immediate = false): void {
      if (!this.conversationNavigation || !conversationSite()) return;
      if (immediate) clearTimeout(this.conversationTimer);
      else if (this.conversationTimer) return;
      this.conversationTimer = window.setTimeout(() => {
        this.conversationTimer = 0;
        this.refreshConversation();
      }, immediate ? 60 : 800);
    }
    private refreshConversation(): void {
      clearTimeout(this.conversationTimer);
      this.conversationTimer = 0;
      const snapshot = this.conversationNavigation ? collectConversation() :
        { site: conversationSite(), turns: [], nativeRailPresent: false };
      this.conversation = this.conversationNavigation ? this.conversationIndex.combine(snapshot) : snapshot;
      const activeSource = this.conversation.turns.find(t=>t.element?.isConnected)?.element;
      if(activeSource)this.conversationScrollRootRef=conversationScrollRoot(activeSource);
      this.hideTurnPreview();
      this.renderDock();
      this.schedulePosition();
    }
    private hideTurnPreview(): void { this.$<HTMLElement>('#jp-turn-preview').hidden = true; }
    private showTurnPreview(turn: ConversationTurn, button: HTMLButtonElement): void {
      this.hideNotePopover();
      const preview = this.$<HTMLElement>('#jp-turn-preview');
      preview.replaceChildren();
      const label = el('small'); label.textContent = `已发现第 ${turn.order + 1} / ${this.conversation.turns.length} 轮${turn.element?'':' · 暂未挂载'}`;
      const summary = el('span'); summary.textContent = turn.preview;
      preview.append(label, summary);
      const rect = button.getBoundingClientRect();
      const railRect = this.$<HTMLElement>('#jp-rail').getBoundingClientRect();
      preview.style.right = `${Math.max(44, innerWidth - railRect.left + 9)}px`;
      preview.style.top = `${clamp(rect.top - 13, 8, innerHeight - 96)}px`;
      preview.hidden = false;
    }
    private async jumpToTurn(turn: ConversationTurn): Promise<void> {
      this.hideTurnPreview(); this.hideNotePopover();
      // Always re-resolve the current prompt before navigating: a stale React
      // wrapper or cached element may have been recycled by the host app.
      const live = collectConversation().turns.find(t => t.id === turn.id);
      if (live?.element) {
        navigateToPrompt(live.element);
        this.activeTurnId = turn.id; this.schedulePosition(); return;
      }
      if (!turn.stableId || !Number.isFinite(turn.scrollHint)) {
        this.toast('该轮原文尚未加载，继续滚动网页后重试'); return;
      }
      const source = this.conversation.turns.find(t => t.element?.isConnected)?.element;
      const root = source ? conversationScrollRoot(source) :
        (this.conversationScrollRootRef?.isConnected ? this.conversationScrollRootRef : document.scrollingElement);
      if (!root) { this.toast('无法确定会话滚动区域'); return; }
      const hint = turn.scrollHint!;
      const directions = [0, -0.7, 0.7, -1.4, 1.4];
      for (const delta of directions) {
        root.scrollTo({top: Math.max(0, hint + delta * root.clientHeight), behavior:'auto'});
        await new Promise(resolve => window.setTimeout(resolve, 180));
        if (!this.visible || !this.conversationNavigation) return;
        const match = collectConversation().turns.find(t => t.id === turn.id);
        if (match?.element) {
          navigateToPrompt(match.element);
          this.refreshConversation(); this.schedulePosition(); return;
        }
      }
      this.toast('这一轮未能重新加载，已停止跳转；可手动滚动到附近再试');
      this.refreshConversation();
    }
    private updateActiveTurn(): void {
      if (!this.conversationNavigation || this.conversation.nativeRailPresent) return;
      const turns = this.conversation.turns.filter(t => !!t.element?.isConnected);
      if (!turns.length) return;
      const threshold = innerHeight * .32;
      // Elements may be mounted in a virtualized window; compare only live
      // prompt rectangles instead of assuming the full conversation is mounted.
      let active = turns[0];
      for (const turn of turns) {
        if (turn.element!.getBoundingClientRect().top > threshold) break;
        active = turn;
      }
      if (active.id === this.activeTurnId) return;
      this.activeTurnId = active.id;
      for (const button of this.shadow.querySelectorAll<HTMLButtonElement>('.rail-turn')) {
        if (button.dataset.turnId === active.id) button.setAttribute('aria-current', 'location');
        else button.removeAttribute('aria-current');
      }
    }

    /** Explicit, reversible history discovery. No undocumented ChatGPT API calls. */
    private async scanOlderTurns(): Promise<void> {
      if (this.scanningHistory) { this.stopHistoryScan = true; return; }
      const source = this.conversation.turns.find(t => t.element?.isConnected)?.element;
      if (!source || !conversationSite()) { this.toast('尚未找到可滚动的对话'); return; }
      const root = conversationScrollRoot(source);
      this.conversationScrollRootRef=root;
      const originPage = this.page, start = root.scrollTop;
      this.scanningHistory = true; this.stopHistoryScan = false; this.renderList();
      let previous = root.scrollTop, stalled = 0, count = 0;
      try {
        while (!this.stopHistoryScan && this.page === originPage && root.scrollTop > 2 && count++ < 160) {
          root.scrollTo({top: Math.max(0, root.scrollTop - Math.max(240, root.clientHeight * .78)), behavior:'auto'});
          await new Promise(resolve => window.setTimeout(resolve, 160));
          const now = root.scrollTop;
          if (Math.abs(now - previous) < 2) stalled++; else stalled = 0;
          previous = now;
          // Do not rescan the entire notes index/DOM on every scroll step.
          this.conversation = this.conversationIndex.combine(collectConversation());
          if (count % 5 === 0) { this.renderDock(); this.renderList(); }
          if (stalled > 4) break;
        }
      } finally {
        // Returning to the original reading position is essential; full scan
        // is user-initiated and may still cause momentary layout shifts.
        if (this.page === originPage && root.isConnected) {
          root.scrollTo({top:start,behavior:'auto'});
          await new Promise(resolve => window.setTimeout(resolve, 220));
        }
        this.scanningHistory = false; this.stopHistoryScan = false;
        this.refreshConversation();
        this.toast(`已发现 ${this.conversation.turns.length} 轮；无法保证包含未加载的全部历史`);
      }
    }
    private hideNotePopover(): void { this.$<HTMLElement>('#jp-note-popover').hidden = true; }
    private showNotePopover(notes: Note[], button: HTMLButtonElement): void {
      this.hideTurnPreview();
      const panel = this.$<HTMLElement>('#jp-note-popover');
      panel.replaceChildren();
      const head = el('div','cluster-title'); head.textContent=`此轮 ${notes.length} 张便签`; panel.appendChild(head);
      for (const note of notes) {
        const item = el('button','cluster-item'); item.type = 'button';
        const dot=el('span','dot'); dot.style.background=COLOR_HEX[appearance(note).color];
        const label=el('span'); label.textContent=note.text.trim().slice(0,55)||note.anchor?.exact.slice(0,50)||'空白便签';
        item.append(dot,label);
        item.addEventListener('click',()=>{this.hideNotePopover();this.goTo(note.id);});
        panel.appendChild(item);
      }
      const rect=button.getBoundingClientRect();
      panel.style.top=`${clamp(rect.top - 10, 8, innerHeight - Math.min(230, 40 + notes.length*40))}px`;
      panel.hidden=false;
    }
    private renderDock(): void {
      const rail = this.$<HTMLElement>('#jp-rail');
      const turns = this.conversationNavigation ? this.conversation.turns : [];
      const showTurns = turns.length >= 3 && !this.conversation.nativeRailPresent;
      rail.hidden = !this.notes.length && !showTurns;
      rail.classList.toggle('with-conversation', showTurns);
      rail.classList.toggle('native-nav', this.conversation.nativeRailPresent);
      const toggle = this.$<HTMLButtonElement>('#jp-list-toggle');
      toggle.textContent = showTurns ? '≡' : String(this.notes.length);
      toggle.title = showTurns ? `已发现 ${turns.length} 轮 · ${this.notes.length} 张便签` : `本页 ${this.notes.length} 张便签`;
      const track = this.$<HTMLElement>('#jp-rail-track'); track.replaceChildren();
      if (showTurns) {
        // Prevent densely spaced targets from covering their neighbors.
        const availableHeight = Math.max(160, innerHeight * 0.60 - 40) * 0.92;
        const lineHeight = clamp(availableHeight / Math.max(1, turns.length) * 0.78, 2, 6);
        for (const turn of turns) {
          const button = el('button', 'rail-turn');
          button.type = 'button';
          button.dataset.turnId = turn.id;
          button.style.top = `${this.turnPosition(turn.order, turns.length)}%`;
          button.style.height = `${lineHeight}px`;
          button.title = `第 ${turn.order + 1} 轮：${turn.preview}`;
          button.setAttribute('aria-label', button.title);
          button.addEventListener('click', () => void this.jumpToTurn(turn));
          button.addEventListener('pointerenter', () => this.showTurnPreview(turn, button));
          button.addEventListener('pointerleave', () => this.hideTurnPreview());
          button.addEventListener('focus', () => this.showTurnPreview(turn, button));
          button.addEventListener('blur', () => this.hideTurnPreview());
          track.appendChild(button);
        }
      }
      const sorted = this.sortedNotes();
      const textLength = this.index?.text.length || 1;
      const liveTurns = turns.filter(t => !!t.element?.isConnected);
      const perTurn = new Map<string, Note[]>();
      const loose: Note[] = [];
      for (const note of sorted) {
        const match = this.matches.get(note.id);
        const associated = showTurns && match ? turnForRange(match.range, liveTurns) : null;
        if (!associated) { loose.push(note); continue; }
        const group=perTurn.get(associated.id) || [];
        group.push(note); perTurn.set(associated.id, group);
      }
      const placed: number[] = [];
      const addNotePin=(notes:Note[],position:number) => {
        const group=notes.length>1;
        const button=el('button',`rail-pin${group?' rail-note-cluster':''}${notes.some(n=>n.anchor&&!this.matches.has(n.id))?' missing':''}`);
        button.type='button';button.style.top=`${clamp(position,2,98)}%`;
        const note=notes[0];
        button.style.background=COLOR_HEX[appearance(note).color];
        if(group){button.textContent=String(notes.length);button.dataset.count=String(notes.length);}
        button.title=group ? `此轮 ${notes.length} 张便签` : note.text.trim().slice(0,70) || note.anchor?.exact.slice(0,50) || '本页便签';
        button.setAttribute('aria-label',button.title);
        button.addEventListener('click',()=>{
          if(group)this.showNotePopover(notes,button);
          else{this.hideTurnPreview();this.goTo(note.id);}
        });
        track.appendChild(button);placed.push(position);
      };
      if(showTurns){
        for(const [turnId,group] of perTurn){
          const turn=turns.find(t=>t.id===turnId);
          if(turn)addNotePin(group,this.turnPosition(turn.order,turns.length));
          else loose.push(...group);
        }
      }
      loose.forEach((note,i)=>{
        const match=this.matches.get(note.id);
        let pos=match?match.start/textLength*100:(note.anchor?90+i%4*2:3+i*3);
        pos=clamp(pos,2,98);
        while(placed.some(p=>Math.abs(p-pos)<3.3)&&pos<95)pos+=3.3;
        addNotePin([note],pos);
      });
      this.activeTurnId = null;
      this.updateActiveTurn();
      this.renderList();
    }
    private turnPosition(order: number, count: number): number {
      return 4 + 92 * (count <= 1 ? 0.5 : order / (count - 1));
    }
    private renderList(): void {
      const list = this.$<HTMLElement>('#jp-list');
      const turns = this.conversationNavigation && !this.conversation.nativeRailPresent ? this.conversation.turns : [];
      list.hidden = !this.listOpen || (!this.notes.length && turns.length < 3);
      if (list.hidden) return;
      list.replaceChildren();
      const head = el('div', 'list-header');
      const title = el('span'); title.textContent = turns.length >= 3
        ? `已发现 ${turns.length} 轮 · ${this.notes.length} 张便签` : `本页便签 · ${this.notes.length}`;
      const close = el('button'); close.type='button'; close.textContent='×'; close.title='关闭列表';
      close.addEventListener('click', () => {this.listOpen=false; this.renderList();});
      head.append(title,close); list.appendChild(head);
      if (turns.length >= 3 && conversationSite()) {
        const scan=el('button','scan-history');scan.type='button';
        scan.textContent=this.scanningHistory?'停止扫描':'扫描较早轮次';
        scan.title='按需滚动收集历史轮次，之后恢复阅读位置；虚拟化页面可能仍无法列全';
        scan.addEventListener('click',()=>void this.scanOlderTurns());
        list.appendChild(scan);
      }
      if (turns.length >= 3) {
        const heading = el('div', 'list-section'); heading.textContent = '对话轮次'; list.appendChild(heading);
        for (const turn of turns) {
          const button = el('button','entry turn-entry'); button.type='button';
          const count = el('span','turn-order'); count.textContent = String(turn.order + 1);
          const label = el('span'); label.textContent = turn.preview;
          button.append(count,label);
          button.addEventListener('click',()=>{this.listOpen=false;this.renderList();void this.jumpToTurn(turn);});
          list.appendChild(button);
        }
      }
      if (this.notes.length) {
        if (turns.length >= 3) {
          const heading = el('div','list-section'); heading.textContent = '本页便签'; list.appendChild(heading);
        }
        for (const note of this.sortedNotes()) {
          const button = el('button','entry'); button.type='button';
          const dot = el('span','dot'); dot.style.background = COLOR_HEX[appearance(note).color];
          const content = el('span');
          const label = el('strong'); label.textContent = note.text.trim().split('\n')[0] || (note.anchor?.exact.slice(0,45) || '空白便签');
          const sub = el('small'); sub.textContent = !note.anchor ? '本页' : this.matches.has(note.id) ? '已关联原文' : '原文暂时未找到';
          content.append(label,sub); button.append(dot,content);
          button.addEventListener('click',()=>{this.listOpen=false;this.renderList();this.goTo(note.id);}); list.appendChild(button);
        }
      }
    }
    private renderMarkers(): void {
      const target = this.$<HTMLElement>('#jp-markers'); target.replaceChildren();
      for (const note of this.notes) {
        if (!note.anchor) continue;
        const button = el('button','marker'); button.type='button'; button.dataset.noteId=note.id;
        button.style.background=COLOR_HEX[appearance(note).color]; button.textContent='✎';
        button.title=note.text.trim().slice(0,70)||note.anchor.exact.slice(0,70);
        button.setAttribute('aria-label',`打开便签：${button.title}`);
        button.addEventListener('click',()=>this.showCard(note.id));
        target.appendChild(button);
      }
      this.positionMarkers();
    }
    private schedulePosition(): void {
      if (this.scrollScheduled) return;
      this.scrollScheduled=true;
      requestAnimationFrame(()=>{
        this.scrollScheduled=false; this.positionMarkers();
        for(const id of this.openIds) this.positionCard(id);
        this.updateActiveTurn();
      });
    }
    /** A virtualized conversation may detach a Range before MutationObserver reindexes it.
     *  Never treat a stale or missing text match as a screen-positioned page note. */
    private liveMatch(note:Note):Match|null {
      if(!note.anchor)return null;
      const match=this.matches.get(note.id);
      if(!match)return null;
      const {range}=match;
      if(!range.startContainer.isConnected||!range.endContainer.isConnected)return null;
      // Fast identity check for the common case: the whole quote is in one
      // text node. React sometimes rewrites an existing Text node in place.
      if(range.startContainer===range.endContainer && range.startContainer.nodeType===Node.TEXT_NODE &&
         (range.startContainer as Text).data.slice(range.startOffset,range.endOffset)!==note.anchor.exact)return null;
      return match;
    }
    private positionMarkers(): void {
      const notesById=new Map(this.notes.map(note=>[note.id,note]));
      for (const marker of Array.from(this.shadow.querySelectorAll<HTMLButtonElement>('.marker'))) {
        const note=notesById.get(marker.dataset.noteId||'');
        const range=note&&this.liveMatch(note)?.range;
        const rect=range&&visibleRect(range);
        if (!rect||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth) {
          marker.hidden=true; continue;
        }
        marker.hidden=false;
        marker.style.left=`${clamp(rect.right+7,5,innerWidth-24)}px`;
        marker.style.top=`${clamp(rect.top,5,innerHeight-24)}px`;
      }
    }
    private goTo(noteId: string, show=true): void {
      const note=this.notes.find(n=>n.id===noteId);
      if(!note)return;
      const match=this.liveMatch(note);
      if (match) {
        const node=match.range.startContainer;
        const target=node.nodeType===Node.ELEMENT_NODE ? node as Element : node.parentElement;
        target?.scrollIntoView({behavior:'smooth',block:'center'});
        this.schedulePosition();
      } else if(note.anchor) this.toast('原文暂时未找到，便签仍已保存');
      // An explicit Dock/list click is allowed to open an orphaned note for
      // editing. Passive DOM mutations and scrolls are NEVER allowed to do so.
      if(show) this.showCard(noteId,false,!!note.anchor&&!match);
    }

    private showCard(noteId: string, focus=false, openDetached=false): void {
      const note=this.notes.find(n=>n.id===noteId); if(!note) return;
      if(openDetached)this.explicitlyDetachedIds.add(noteId);
      else this.explicitlyDetachedIds.delete(noteId);
      let paper=this.cards.get(noteId);
      if(!paper) { paper=this.makePaper(note); this.cards.set(noteId,paper); this.$<HTMLElement>('#jp-cards').appendChild(paper); }
      this.openIds.add(noteId);
      paper.style.zIndex=String(++this.zOrder);
      this.positionCard(noteId);
      if(focus) paper.querySelector<HTMLElement>('.note-editor')?.focus({preventScroll:true});
    }
    private closeCard(noteId: string): void {
      void this.saveNow(noteId);
      this.openIds.delete(noteId);
      this.explicitlyDetachedIds.delete(noteId);
      this.cards.get(noteId)?.remove(); this.cards.delete(noteId);
    }

    private makePaper(note: Note): HTMLElement {
      const paper=el('section','paper');
      paper.dataset.noteId=note.id;paper.setAttribute('aria-label','JotPatch 便签');
      const style=appearance(note);
      paper.style.setProperty('--paper',COLOR_HEX[style.color]);
      paper.style.setProperty('--jp-font-size',this.fontPixels(style.fontSize));
      paper.style.width=`${style.width}px`;paper.style.height=`${style.height}px`;
      // Fixed header and footer take actual layout space; no controls overlap text.
      paper.innerHTML=`
        <header class="paper-head drag-region" title="拖动整条顶栏移动便签" aria-label="拖动便签位置">
          <span class="paper-grab" aria-hidden="true">··</span>
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
      const editor=paper.querySelector<HTMLElement>('.note-editor')!;
      renderMarkdown(editor,note.text);
      const changed=()=>{
        note.text=markdownFromEditor(editor);
        editor.dataset.empty=String(!note.text.trim());
        this.touchNote(note);this.renderList();
      };
      editor.dataset.empty=String(!note.text.trim());
      editor.addEventListener('input',changed);
      editor.addEventListener('blur',()=>void this.saveNow(note.id));
      editor.addEventListener('paste',event=>{
        // Paste plain text only. HTML from source websites must not enter our
        // editable DOM or storage, even if the clipboard contains rich HTML.
        event.preventDefault();
        document.execCommand('insertText',false,event.clipboardData?.getData('text/plain')||'');
      });
      editor.addEventListener('keydown',(event:KeyboardEvent)=>{
        if((event.ctrlKey||event.metaKey)&&!event.altKey){
          const key=event.key.toLowerCase();
          if(key==='b'||key==='i'){
            event.preventDefault();this.format(editor,key==='b'?'bold':'italic');
          }else if(event.shiftKey && event.key==='7'){
            event.preventDefault();this.format(editor,'number');
          }else if(event.shiftKey && event.key==='8'){
            event.preventDefault();this.format(editor,'bullet');
          }
        }
      });
      paper.addEventListener('pointerdown',()=>{paper.style.zIndex=String(++this.zOrder);});
      paper.addEventListener('focusin',()=>{paper.style.zIndex=String(++this.zOrder);});
      paper.addEventListener('wheel',(event:WheelEvent)=>{
        // Cancel browser zoom only while the pointer is inside a note.
        if(!event.ctrlKey || !event.cancelable)return;
        event.preventDefault();event.stopPropagation();
        const steps:NoteFontSize[]=['sm','md','lg'];
        const current=appearance(note).fontSize;
        const direction=event.deltaY<0?1:-1;
        const next=steps[clamp(steps.indexOf(current)+direction,0,steps.length-1)];
        this.setFontSize(note,paper,next);
      },{passive:false});
      for(const name of ['bold','italic','bullet','number'] as const){
        const button=paper.querySelector<HTMLButtonElement>(`.${name}`)!;
        button.addEventListener('pointerdown',event=>event.preventDefault());
        button.addEventListener('click',()=>this.format(editor,name));
      }
      paper.querySelector('.copy')!.addEventListener('click',()=>void this.copyNote(note.id));
      paper.querySelector('.jump')!.addEventListener('click',()=>this.goTo(note.id,false));
      paper.querySelector('.close')!.addEventListener('click',()=>this.closeCard(note.id));
      const menu=paper.querySelector<HTMLElement>('.note-menu')!;
      const menuTrigger=paper.querySelector<HTMLButtonElement>('.menu-trigger')!;
      menuTrigger.addEventListener('click',()=>{
        for(const other of this.cards.values())if(other!==paper){
          const otherMenu=other.querySelector<HTMLElement>('.note-menu');if(otherMenu)otherMenu.hidden=true;
        }
        menu.hidden=!menu.hidden;menuTrigger.setAttribute('aria-expanded',String(!menu.hidden));
      });
      paper.querySelector('.delete-menu')!.addEventListener('click',()=>{menu.hidden=true;void this.deleteNote(note.id);});
      for(const button of paper.querySelectorAll<HTMLButtonElement>('.font-size')){
        button.setAttribute('aria-pressed',String(button.dataset.font===style.fontSize));
        button.addEventListener('click',()=>this.setFontSize(note,paper,button.dataset.font as NoteFontSize));
      }
      const colors=paper.querySelector<HTMLElement>('.colors')!;
      COLOR_ORDER.forEach(color=>{
        const btn=el('button');btn.type='button';btn.title=color;
        btn.style.background=COLOR_HEX[color];btn.setAttribute('aria-label',`颜色：${color}`);
        btn.setAttribute('aria-pressed',String(color===style.color));
        btn.addEventListener('click',()=>{
          note.appearance={...appearance(note),color};
          paper.style.setProperty('--paper',COLOR_HEX[color]);
          colors.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button===btn)));
          this.touchNote(note);this.renderDock();this.renderMarkers();
        });
        colors.appendChild(btn);
      });
      this.installDrag(paper.querySelector<HTMLElement>('.drag-region')!,note,'move');
      this.installDrag(paper.querySelector<HTMLElement>('.resize-handle')!,note,'resize');
      return paper;
    }

    private fontPixels(size:NoteFontSize):string {
      return size==='sm'?'12px':size==='lg'?'17px':'14px';
    }
    private setFontSize(note:Note,paper:HTMLElement,size:NoteFontSize):void {
      if(!['sm','md','lg'].includes(size)||appearance(note).fontSize===size)return;
      note.appearance={...appearance(note),fontSize:size};
      paper.style.setProperty('--jp-font-size',this.fontPixels(size));
      for(const button of paper.querySelectorAll<HTMLButtonElement>('.font-size')){
        button.setAttribute('aria-pressed',String(button.dataset.font===size));
      }
      this.touchNote(note);
    }
    private format(editor:HTMLElement,type:'bold'|'italic'|'bullet'|'number'):void {
      editor.focus({preventScroll:true});
      // Chromium's native edit commands preserve browser selection and undo;
      // only generated safe HTML is persisted as canonical Markdown.
      const command={bold:'bold',italic:'italic',bullet:'insertUnorderedList',number:'insertOrderedList'}[type];
      const changed=document.execCommand(command,false);
      if(changed)editor.dispatchEvent(new Event('input',{bubbles:true}));
    }
    private installDrag(handle:HTMLElement,note:Note,mode:'move'|'resize'):void {
      handle.addEventListener('pointerdown',(event:PointerEvent)=>{
        if(event.button!==0)return;
        // Entire fixed header is draggable, but its buttons remain clickable.
        if(mode==='move' && (event.target as Element).closest('button'))return;
        event.preventDefault();event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        const initial=appearance(note),startX=event.clientX,startY=event.clientY;
        const paper=this.cards.get(note.id) || handle.closest<HTMLElement>('.paper');
        const startRect=paper?.getBoundingClientRect();
        const move=(e:PointerEvent)=>{
          if(e.pointerId!==event.pointerId)return;
          const dx=e.clientX-startX,dy=e.clientY-startY;
          let updated:NoteAppearance=mode==='move'
            ? {...initial,offsetX:initial.offsetX+dx,offsetY:initial.offsetY+dy}
            : {...initial,
              width:clamp(initial.width+dx,180,Math.min(560,innerWidth-15-(startRect?.left||0))),
              height:clamp(initial.height+dy,132,Math.min(620,innerHeight-15-(startRect?.top||0)))};
          note.appearance=updated;
          if(paper){paper.style.width=`${updated.width}px`;paper.style.height=`${updated.height}px`;}
          this.positionCard(note.id);
          if(mode==='resize' && startRect && paper){
            // When the chosen source-relative placement reflows with width,
            // compensate offsets to keep the actual TOP-LEFT corner fixed.
            const adjusted=paper.getBoundingClientRect();
            updated={...updated,offsetX:updated.offsetX+startRect.left-adjusted.left,
              offsetY:updated.offsetY+startRect.top-adjusted.top};
            note.appearance=updated;this.positionCard(note.id);
          }
        };
        const finish=(e:PointerEvent)=>{
          if(e.pointerId!==event.pointerId)return;
          handle.removeEventListener('pointermove',move);
          handle.removeEventListener('pointerup',finish);
          handle.removeEventListener('pointercancel',finish);
          this.touchNote(note);
        };
        handle.addEventListener('pointermove',move);
        handle.addEventListener('pointerup',finish);
        handle.addEventListener('pointercancel',finish);
      });
    }
    private concealCard(card:HTMLElement):void {
      if(card.hidden)return;
      // Prevent an editor detached by React virtualization from retaining an
      // invisible keyboard focus, and flush pending input through blur/save.
      const active=this.shadow.activeElement;
      if(active instanceof HTMLElement && card.contains(active))active.blur();
      card.hidden=true;
    }
    private positionCard(noteId:string):void {
      const card=this.cards.get(noteId),note=this.notes.find(n=>n.id===noteId);
      if(!card||!note||!this.openIds.has(noteId))return;
      const dimensions=appearance(note);
      const match=this.liveMatch(note);
      const rect=match&&visibleRect(match.range);
      if(note.anchor){
        if(!match||!rect){
          // A missing DOM anchor is NOT a page-level note. Never use the
          // fallback viewport position unless the user explicitly opened it.
          if(!this.explicitlyDetachedIds.has(noteId)){this.concealCard(card);return;}
        }else{
          this.explicitlyDetachedIds.delete(noteId);
          if(rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth){
            this.concealCard(card);return;
          }
        }
      }
      card.hidden=false;
      const width=Math.min(dimensions.width,Math.max(180,innerWidth-14));
      const height=Math.min(dimensions.height,Math.max(132,innerHeight-14));
      card.style.width=`${width}px`;card.style.height=`${height}px`;
      let x=innerWidth-width-56, y=74+this.notes.indexOf(note)*14;
      if(rect){
        // Prefer the margins of the containing paragraph instead of floating
        // over the *rest of the same selected sentence*. If neither side fits,
        // place the card after the paragraph (or above it if no lower room).
        const parent=match!.range.startContainer.parentElement;
        const block=parent?.closest('p,li,blockquote,pre,h1,h2,h3,h4,article') || parent;
        const blockRect=block?.getBoundingClientRect() || rect;
        if(innerWidth-blockRect.right >= width+20){
          x=blockRect.right+12;y=rect.top;
        }else if(blockRect.left >= width+20){
          x=blockRect.left-width-12;y=rect.top;
        }else{
          x=clamp(rect.right-width/2,8,innerWidth-width-8);
          y=blockRect.bottom+11;
          if(y+height>innerHeight-8)y=blockRect.top-height-11;
        }
      }
      x=clamp(x+dimensions.offsetX,8,innerWidth-width-8);
      y=clamp(y+dimensions.offsetY,8,innerHeight-height-8);
      card.style.left=`${x}px`;card.style.top=`${y}px`;
    }

    private touchNote(note:Note):void {note.updatedAt=Date.now();this.dirty.add(note.id);this.scheduleSave(note.id);}
    private scheduleSave(noteId:string):void {
      clearTimeout(this.writeTimers.get(noteId));
      this.writeTimers.set(noteId,window.setTimeout(()=>void this.saveNow(noteId),380));
    }
    private async saveNow(noteId:string):Promise<void> {
      clearTimeout(this.writeTimers.get(noteId));this.writeTimers.delete(noteId);
      if(!this.dirty.has(noteId)||this.conflicts.has(noteId))return;
      const note=this.notes.find(n=>n.id===noteId);if(!note)return;
      const snapshot:Note={...note,appearance:note.appearance?{...note.appearance}:undefined};
      const prior=this.writeChains.get(noteId)||Promise.resolve();
      const next=prior.catch(()=>undefined).then(async()=>{
        const persisted=await this.repo.get(noteId);
        const revision=this.knownRevisions.get(noteId)||0;
        if(persisted?.deletedAt || (persisted && (persisted.revision||0)>revision)){
          this.conflicts.add(noteId);throw new Error('CONFLICT');
        }
        snapshot.revision=revision+1;
        this.ownWrites.add(noteId);
        try {
          await this.repo.put(snapshot);
          this.knownRevisions.set(noteId,snapshot.revision);
          note.revision=snapshot.revision;
          if(note.updatedAt===snapshot.updatedAt)this.dirty.delete(noteId);
        } finally { this.ownWrites.delete(noteId); }
      });
      this.writeChains.set(noteId,next);
      try{await next;this.saveStatus(noteId,'');}
      catch(error){
        if(this.conflicts.has(noteId)){
          this.saveStatus(noteId,'conflict','冲突，请复制备份');
          this.toast('此便签在其他标签页有更新；已暂停本页保存，请复制当前内容备份');
        }else{
          this.saveStatus(noteId,'error','保存失败');
          this.toast('保存失败，请复制便签内容备份');
        }
      }
    }
    private saveStatus(noteId:string,state:string,label=''):void {
      const paper=this.cards.get(noteId);if(!paper)return;
      paper.dataset.save=state;
      const indicator=paper.querySelector<HTMLElement>('.save-indicator');if(indicator)indicator.textContent=label;
    }
    private syncExternalNote(fresh:Note):void {
      const old=this.notes.find(n=>n.id===fresh.id);
      if(fresh.deletedAt){
        if(!old)return;
        if(this.dirty.has(old.id)) {this.conflicts.add(old.id);this.saveStatus(old.id,'conflict','其他页面已删除');return;}
        this.notes=this.notes.filter(n=>n.id!==fresh.id);this.closeCard(fresh.id);this.refreshAnchors();return;
      }
      if(!old){this.notes.push(fresh);this.knownRevisions.set(fresh.id,fresh.revision||0);this.refreshAnchors();return;}
      if((fresh.revision||0)<=(this.knownRevisions.get(fresh.id)||0))return;
      if(this.dirty.has(fresh.id)){
        this.conflicts.add(fresh.id);this.saveStatus(fresh.id,'conflict','冲突，请复制备份');return;
      }
      Object.assign(old,fresh);this.knownRevisions.set(fresh.id,fresh.revision||0);
      const paper=this.cards.get(fresh.id);
      if(paper){
        const editor=paper.querySelector<HTMLElement>('.note-editor');
        if(editor){renderMarkdown(editor,fresh.text);editor.dataset.empty=String(!fresh.text.trim());}
        paper.style.setProperty('--paper',COLOR_HEX[appearance(fresh).color]);
        paper.style.setProperty('--jp-font-size',this.fontPixels(appearance(fresh).fontSize));
        paper.style.width=`${appearance(fresh).width}px`;paper.style.height=`${appearance(fresh).height}px`;
      }
      this.refreshAnchors();
    }
    private async copyNote(noteId:string):Promise<void> {
      const note=this.notes.find(n=>n.id===noteId);if(!note)return;
      try{await navigator.clipboard.writeText(note.text);this.toast('便签内容已复制');}
      catch{this.toast('复制失败，请选中正文后手动复制');}
    }
    private async deleteNote(noteId:string):Promise<void> {
      const note=this.notes.find(n=>n.id===noteId);if(!note)return;
      await this.saveNow(noteId);
      if(this.conflicts.has(noteId))return;
      try{
        await this.writeChains.get(noteId)?.catch(()=>undefined);
        this.ownWrites.add(noteId);
        try { await this.repo.markDeleted(note); }
        finally { this.ownWrites.delete(noteId); }
        this.notes=this.notes.filter(n=>n.id!==noteId);
        this.openIds.delete(noteId);this.cards.get(noteId)?.remove();this.cards.delete(noteId);
        this.dirty.delete(noteId);this.refreshAnchors();
        if(this.deletedUndo)clearTimeout(this.deletedUndo.timer);
        const timer=window.setTimeout(()=>{this.deletedUndo=null;this.hideToast();},8000);
        this.deletedUndo={note,timer};this.toast('便签已删除',true,8000);
      }catch{this.toast('删除失败，请重试');}
    }
    private async undoDeletion():Promise<void> {
      const deleted=this.deletedUndo;if(!deleted)return;
      clearTimeout(deleted.timer);this.deletedUndo=null;
      const note:Note={...deleted.note,deletedAt:undefined,updatedAt:Date.now(),revision:(deleted.note.revision||0)+2};
      try{
        this.ownWrites.add(note.id);
        try { await this.repo.put(note); }
        finally { this.ownWrites.delete(note.id); }
        this.notes.push(note);
        this.knownRevisions.set(note.id,note.revision||0);
        this.refreshAnchors();this.showCard(note.id);this.toast('已恢复便签');
      }catch{this.toast('恢复失败，请重试');this.deletedUndo=deleted;}
    }
    private hideToast():void{this.$<HTMLElement>('#jp-toast').hidden=true;}
    private toast(message:string,undo=false,duration=3000):void {
      clearTimeout(this.toastTimer);
      const toast=this.$<HTMLElement>('#jp-toast');
      this.$<HTMLElement>('#jp-toast-text').textContent=message;
      this.$<HTMLElement>('#jp-undo').hidden=!undo;
      toast.hidden=false;
      this.toastTimer=window.setTimeout(()=>this.hideToast(),duration);
    }
  }
}
