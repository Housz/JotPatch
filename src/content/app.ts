namespace JP {
  // Lightweight paper notes and a passive, shared conversation/notes timeline.
  const COLOR_HEX: Record<NoteColor, string> = {
    yellow: '#FFF1B8', pink: '#FBE1E9', green: '#DFF1DD',
    blue: '#DAECFF', purple: '#EAE2FA', gray: '#F0EFEC'
  };
  const COLOR_ORDER: NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
  const PREFERENCE_KEY = 'jotpatch:preferences:v1';
  const BRAND_LINE = 'Powered by Housz';

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
    private defaultNoteColorMode: DefaultNoteColorMode = 'yellow';
    private lastAutoColor: NoteColor | null = null;
    private conversation: ConversationSnapshot = { site: null, turns: [], nativeRailPresent: false };
    private conversationTimer = 0;
    private conversationIndex = new ConversationIndex();
    private conversationScrollRootRef: Element | null = null;
    private railGroups: RailTurnGroup[] = [];
    private railLayoutBase: RailLayout | null = null;
    private railLayoutHeight = 0;
    private railSignature = '';
    private navController:AbortController|null=null;
    private navGeneration=0;
    private navigationBusy=false;
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
    private unpinUndo: { noteId: string; anchor: TextAnchor; turnId?: string; oldAppearance: NoteAppearance; timer: number; pageKey:string } | null = null;

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
        if (external.some(record => record.type === 'childList' || record.type === 'attributes')) this.scheduleConversationScan();
      });
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['data-turn-key','data-turn-id','data-message-id','data-turn','data-message-author-role'] });
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
          <button id="jp-list-toggle" class="rail-head" title="打开本页导航列表" aria-label="打开本页导航列表" type="button">≡</button>
          <div class="rail-track" id="jp-rail-track"></div>
          <button id="jp-loose-toggle" class="rail-loose" title="本页悬浮或待定位便签" aria-label="查看本页悬浮和待定位便签" type="button" hidden>▤</button>
        </nav>
        <div id="jp-turn-preview" class="turn-preview" role="tooltip" hidden></div>
        <aside id="jp-list" class="list" aria-label="本页便签列表" hidden></aside>
        <div id="jp-markers"></div>
        <div id="jp-cards"></div>
        <div id="jp-toast" class="toast" role="status" aria-live="polite" hidden><span id="jp-toast-text"></span><button id="jp-cancel-nav" type="button" hidden>取消</button><button id="jp-undo" type="button" hidden>撤销</button></div>`;
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
      this.$<HTMLButtonElement>('#jp-undo').addEventListener('click', () => void this.undoLastAction());
      this.$<HTMLButtonElement>('#jp-cancel-nav').addEventListener('click',()=>this.cancelNavigation(true));
      // Only *user input* interrupts a targeted history navigation. Scroll
      // events fired by the extension's own scrollTo() are not user input.
      const userInterrupt=()=>{if(this.navigationBusy)this.cancelNavigation(false);};
      window.addEventListener('wheel',userInterrupt,{capture:true,passive:true});
      window.addEventListener('touchstart',userInterrupt,{capture:true,passive:true});
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden)userInterrupt();
      });
      document.addEventListener('pointerdown',event=>{
        if(!this.navigationBusy)return;
        const path=event.composedPath();
        if(path.includes(this.$<HTMLElement>('#jp-rail')) ||
           path.includes(this.$<HTMLElement>('#jp-cancel-nav')))return;
        userInterrupt();
      },true);
      window.addEventListener('keydown',event=>{
        if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))userInterrupt();
      },true);
      this.$<HTMLButtonElement>('#jp-loose-toggle').addEventListener('click', () => {
        this.listOpen = true; this.renderList();
      });
      const track=this.$<HTMLElement>('#jp-rail-track');
      // Rail buttons themselves own hover previews and direct navigation.
      // Even if several buttons are only pixels apart, never intercept clicks
      // to open an extra list or guess which neighboring note was intended.
      track.addEventListener('keydown',event=>{
        if(event.key==='Escape'){this.hideTurnPreview();return;}
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
        const targets=Array.from(track.querySelectorAll<HTMLButtonElement>('[data-rail-key]'))
          .sort((a,b)=>Number.parseFloat(a.style.top)-Number.parseFloat(b.style.top));
        const at=targets.indexOf(this.shadow.activeElement as HTMLButtonElement);
        if(at<0)return;
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?targets.length-1:
          clamp(at+(event.key==='ArrowDown'?1:-1),0,targets.length-1);
        targets[next]?.focus({preventScroll:true});
      });
      document.addEventListener('keydown', event => {
        if(event.key==='Escape')this.hideTurnPreview();
        if(event.key==='Escape') for(const card of this.cards.values()){const menu=card.querySelector<HTMLElement>('.note-menu');if(menu)menu.hidden=true;card.querySelector('.menu-trigger')?.setAttribute('aria-expanded','false');}
      });
      document.addEventListener('pointerdown', event => {
        const path = event.composedPath();
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
      window.addEventListener('scroll', () => {
        this.schedulePosition();
        // React virtualized lists may reuse DOM nodes without a childList
        // mutation; natural user scrolling may still reveal a new prompt.
        if(this.conversationNavigation && conversationSite())this.scheduleConversationScan();
      }, true);
      window.addEventListener('resize', () => {this.hideTurnPreview();this.schedulePosition();});
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
          this.defaultNoteColorMode = preferences?.defaultNoteColorMode === 'random' ? 'random' : 'yellow';
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
        this.defaultNoteColorMode = prefs.defaultNoteColorMode;
      } catch { this.selectionTrigger = 'always'; this.conversationNavigation = true; this.defaultNoteColorMode = 'yellow'; }
    }
    private openSettings(): void {
      void chrome.runtime.sendMessage({ type: 'JP_OPEN_SITE_SETUP' }).catch(() => this.toast('请从扩展管理页打开 JotPatch 设置。'));
    }
    private renderLauncher(): void { this.$<HTMLElement>('#jp-launcher').hidden = !this.launcherOpen; }

    private checkPageRoute(): void {
      const next = pageKey(location.href);
      if (next === this.page) return;
      for (const id of this.openIds) void this.saveNow(id);
      this.cancelNavigation(false);
      this.page = next;
      this.railSignature='';
      this.pendingRange = null;
      this.$<HTMLElement>('#jp-bubble').hidden = true;
      if(this.unpinUndo)clearTimeout(this.unpinUndo.timer);
      this.unpinUndo=null;
      this.openIds.clear(); this.explicitlyDetachedIds.clear(); this.cards.clear(); this.$<HTMLElement>('#jp-cards').replaceChildren();
      this.listOpen = false;
      this.hideTurnPreview();
      this.railGroups=[];this.railLayoutBase=null;
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
      return this.createNote(anchor,range);
    }
    private async createPageNote(): Promise<boolean> { return this.createNote(); }
    private async createNote(anchor?: TextAnchor,sourceRange?:Range): Promise<boolean> {
      const now = Date.now();
      const linked = anchor && sourceRange ? turnForRange(sourceRange,this.conversation.turns.filter(t=>t.element?.isConnected)) : null;
      const note: Note = {
        schemaVersion: 1, id: id(), pageKey: this.page, sourceUrl: location.href,
        sourceTitle: document.title, anchor, conversationTurnId:linked?.stableId, text: '',
        appearance: {color:this.pickDefaultColor(), width:256, height:202, offsetX:0, offsetY:0},
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

    private pickDefaultColor(): NoteColor {
      if (this.defaultNoteColorMode !== 'random') return 'yellow';
      const pool = COLOR_ORDER.filter(color => color !== this.lastAutoColor);
      const color = pool[Math.floor(Math.random() * pool.length)] || 'yellow';
      this.lastAutoColor = color;
      return color;
    }

    private refreshAnchors(): void {
      if (!document.body) return;
      this.index = buildTextIndex(); this.matches.clear();
      const live=this.conversation.turns.filter(t=>t.element?.isConnected);
      for (const note of this.notes) if (note.anchor) {
        const expected=note.conversationTurnId&&conversationSite() ?
          this.conversationIndex.resolveId(note.conversationTurnId):null;
        // Never reattach a lost quote to an identical phrase in another Q/A.
        const filter=expected ? (range:Range)=>turnForRange(range,live)?.id===expected : undefined;
        const match=resolveAnchor(note.anchor,this.index,filter);
        if(match)this.matches.set(note.id,match);
      }
      this.paintHighlights(); this.associateNotesToTurns(); this.renderDock(); this.renderMarkers(); this.schedulePosition();
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
      this.associateNotesToTurns();
      this.renderDock();
      this.schedulePosition();
    }
    private hideTurnPreview(): void { this.$<HTMLElement>('#jp-turn-preview').hidden = true; }
    private showTurnPreview(turn: ConversationTurn, button: HTMLButtonElement): void {
      this.showRailPreview(turn.preview || '非文本提问',button);
    }
    /** Same compact, headerless preview for both gray turns and note markers. */
    private showRailPreview(content:string,button:HTMLButtonElement):void {
      const preview=this.$<HTMLElement>('#jp-turn-preview');
      preview.textContent=content;
      const rect=button.getBoundingClientRect();
      const railRect=this.$<HTMLElement>('#jp-rail').getBoundingClientRect();
      preview.style.right=`${Math.max(44,innerWidth-railRect.left+9)}px`;
      preview.style.top=`${clamp(rect.top-13,8,innerHeight-96)}px`;
      preview.hidden=false;
    }
    private cancelNavigation(explicit:boolean):void {
      if(this.navController)this.navController.abort();
      this.navController=null;
      this.navigationBusy=false;
      this.navGeneration++;
      if(this.shadow?.querySelector('#jp-cancel-nav')){
        this.$<HTMLButtonElement>('#jp-cancel-nav').hidden=true;
        if(explicit)this.toast('已停止定位');
        else if(this.$<HTMLElement>('#jp-toast-text').textContent==='正在定位…')this.hideToast();
      }
    }

    private beginNavigation():{controller:AbortController;generation:number;page:string} {
      this.cancelNavigation(false);
      const controller=new AbortController();
      this.navController=controller;this.navigationBusy=true;
      const generation=this.navGeneration;
      clearTimeout(this.toastTimer);
      this.$<HTMLElement>('#jp-toast').hidden=false;
      this.$<HTMLElement>('#jp-toast-text').textContent='正在定位…';
      this.$<HTMLButtonElement>('#jp-undo').hidden=true;
      this.$<HTMLButtonElement>('#jp-cancel-nav').hidden=false;
      return {controller,generation,page:this.page};
    }

    private finishNavigation(job:{controller:AbortController;generation:number;page:string},message?:string):void {
      if(this.navController!==job.controller || this.navGeneration!==job.generation)return;
      this.navController=null;this.navigationBusy=false;
      this.$<HTMLButtonElement>('#jp-cancel-nav').hidden=true;
      if(message)this.toast(message);
      else this.hideToast();
      this.refreshConversation();
    }

    private scanLiveTurns():ConversationTurn[] {
      // This method never calls a private API and never moves the page on its
      // own. During navigation, newly mounted DOM joins the passive index but
      // the rail is not rebuilt until the operation completes.
      const snapshot=this.conversationIndex.combine(collectConversation());
      this.conversation=snapshot;
      return snapshot.turns;
    }

    private findLiveTurn(id:string):ConversationTurn|null {
      const key=this.conversationIndex.resolveId(id);
      return this.scanLiveTurns().find(t=>t.id===key && !!t.element?.isConnected)||null;
    }

    private navigationRoot():Element|null {
      const source=this.conversation.turns.find(t=>t.element?.isConnected)?.element;
      return source?conversationScrollRoot(source):
        (this.conversationScrollRootRef?.isConnected?this.conversationScrollRootRef:document.scrollingElement);
    }

    private restoreAfterFailedSearch(root:Element,original:number,extent:number,reading:Element|null,readingTop:number):void {
      if(reading?.isConnected){
        const now=reading.getBoundingClientRect().top;
        root.scrollTo({top:root.scrollTop+now-readingTop,behavior:'auto'});
      }else if(Math.abs(root.scrollHeight-extent)/Math.max(1,extent)<.23){
        root.scrollTo({top:original,behavior:'auto'});
      }
    }

    /** The target must be verified by stable logical turn ID after mounting. */
    private async locateTurn(id:string,controller:AbortController):Promise<ConversationTurn|null> {
      const key=this.conversationIndex.resolveId(id);
      const direct=this.findLiveTurn(key);
      if(direct)return direct;
      const record=this.conversation.turns.find(t=>t.id===key);
      const root=this.navigationRoot();
      if(!root || !record || !record.stableId)return null;
      return recoverConversationTurn({root,targetId:key,signal:controller.signal,
        hint:record.scrollHint,hintExtent:record.scrollExtent,
        getTurns:()=>this.scanLiveTurns()});
    }

    private async jumpToTurn(turn: ConversationTurn): Promise<void> {
      this.hideTurnPreview();
      const targetId=this.conversationIndex.resolveId(turn.id);
      if(!turn.stableId){
        const current=this.conversation.turns.find(t=>t.id===targetId&&t.element?.isConnected);
        if(current?.element)navigateToPrompt(current.element);
        else this.toast('这一轮尚未加载');
        return;
      }
      const root=this.navigationRoot();
      const start=root?.scrollTop??0,extent=root?.scrollHeight??0;
      const original=this.conversation.turns.filter(t=>t.element?.isConnected)
        .sort((a,b)=>Math.abs((a.element?.getBoundingClientRect().top||0)-130)-
          Math.abs((b.element?.getBoundingClientRect().top||0)-130))[0]?.element||null;
      const top=original?.getBoundingClientRect().top??0;
      const job=this.beginNavigation();
      let reached=false;
      try{
        const found=await this.locateTurn(targetId,job.controller);
        if(!found?.element || job.controller.signal.aborted || job.page!==this.page)return;
        navigateToPrompt(found.element);
        // The prompt can unmount immediately after the first scroll. Validate
        // the identity and visible position, not only a completed scrollTo().
        await navigationPause(110,job.controller.signal);
        const verified=this.findLiveTurn(targetId);
        const bounding=verified?.element?.getBoundingClientRect();
        const rootBox=verified?.element?conversationScrollRoot(verified.element).getBoundingClientRect():null;
        const topBound=root===document.scrollingElement?0:(rootBox?.top??0);
        reached=!!bounding && bounding.bottom>=topBound && bounding.top<topBound+(root?.clientHeight||innerHeight);
      }finally{
        if(this.navController===job.controller && !job.controller.signal.aborted){
          if(!reached && root)this.restoreAfterFailedSearch(root,start,extent,original,top);
          this.finishNavigation(job,reached?undefined:'暂时无法定位这一轮');
        }
      }
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

    private showNotePreview(note:Note,button:HTMLButtonElement):void {
      const content=note.text.trim().slice(0,210) || note.anchor?.exact.slice(0,210) || '空白便签';
      this.showRailPreview(content,button);
    }

    /** Resolve the fraction of a note *within the entire response turn*.
     *  Never normalize against the earliest/latest notes or invent 50% when
     *  a quote is not mounted. Render geometry first, text fallback second. */
    private spatialProgress(note:Note, match:Match, turn:ConversationTurn, turns:ConversationTurn[]):
      {fraction:number; confidence:'geometry'|'text'|'estimated'} | null {
      if(!turn.element?.isConnected)return null;
      const root=conversationScrollRoot(turn.element);
      const startY=conversationScrollHint(turn.element);
      const next=turns[turn.order+1];
      let endY:number|null=null;
      if(next?.element?.isConnected && conversationScrollRoot(next.element)===root){
        endY=conversationScrollHint(next.element);
      }else if(!next){
        // The last known user message usually has an adjacent assistant turn.
        // Inspect its following sibling(s), but never use the entire document
        // body as the answer range when a specific message boundary exists.
        let block=turn.element.closest('article, user-query, [data-turn-key]')||turn.element;
        let sibling:Element|null=block.nextElementSibling;
        for(let i=0;sibling && i<6;i++){
          if(sibling.matches('user-query,[data-turn="user"],[data-user-message-bubble]')||
             sibling.querySelector('[data-user-message-bubble],user-query'))break;
          block=sibling;sibling=sibling.nextElementSibling;
        }
        const rect=block.getBoundingClientRect();
        const rootRect=root===document.scrollingElement?{top:0}:root.getBoundingClientRect();
        endY=root.scrollTop+rect.bottom-rootRect.top;
      }
      if(endY!==null && endY>startY+14){
        const rangeRect=visibleRect(match.range);
        if(rangeRect){
          const rootRect=root===document.scrollingElement?{top:0}:root.getBoundingClientRect();
          const position=root.scrollTop+rangeRect.top-rootRect.top;
          if(position>=startY-10 && position<=endY+10){
            return {fraction:clamp((position-startY)/(endY-startY),0,1),confidence:'geometry'};
          }
        }
      }
      // Text-only fallback uses the whole *turn* start/end, not other notes.
      if(this.index){
        const findTextStart=(element:Element):number|undefined=>
          this.index?.nodes.find(entry=>element.contains(entry.node))?.start;
        const start=findTextStart(turn.element);
        const end=next?.element?.isConnected?findTextStart(next.element):this.index.text.length;
        if(start!==undefined && end!==undefined && end>start+20 && match.start>=start && match.start<=end){
          return {fraction:clamp((match.start-start)/(end-start),0,1),confidence:'text'};
        }
      }
      return null;
    }

    private pageProgress(match:Match):number|null {
      const rangeRect=visibleRect(match.range);if(!rangeRect)return null;
      const root=document.scrollingElement||document.documentElement;
      const height=Math.max(root.scrollHeight,document.documentElement.scrollHeight);
      return height>0?clamp((root.scrollTop+rangeRect.top)/height,0,1):null;
    }

    private associateNotesToTurns():void {
      const turns=this.conversation.turns;
      const live=turns.filter(turn=>turn.element?.isConnected);
      for(const note of this.notes){
        if(!note.anchor)continue;
        const match=this.liveMatch(note);
        if(!match)continue;
        const turn=turnForRange(match.range,live);
        const position=turn?this.spatialProgress(note,match,turn,turns):null;
        const pageProgress=this.pageProgress(match);
        const updatedId=turn?.stableId||note.conversationTurnId;
        const previous=note.spatial;
        const better=position && (position.confidence==='geometry'||previous?.confidence!=='geometry');
        const next=better ? {withinTurnProgress:position!.fraction,confidence:position!.confidence,
            pageProgress:pageProgress??previous?.pageProgress}
          : previous ? {...previous,pageProgress:pageProgress??previous.pageProgress}
          : pageProgress!==null?{pageProgress,confidence:'estimated' as const}:undefined;
        const moved=next && (!previous ||
          (next.withinTurnProgress!==undefined&&
           (previous.withinTurnProgress===undefined||Math.abs(previous.withinTurnProgress-next.withinTurnProgress)>.024)) ||
          (next.pageProgress!==undefined&&
           (previous.pageProgress===undefined||Math.abs(previous.pageProgress-next.pageProgress)>.024)) ||
          next.confidence!==previous.confidence);
        if((updatedId!==note.conversationTurnId || moved) && !this.conflicts.has(note.id)){
          note.conversationTurnId=updatedId;
          if(next)note.spatial=next;
          this.touchNote(note);
        }
      }
    }

    private renderDock():void {
      const rail=this.$<HTMLElement>('#jp-rail');
      const turns=this.conversationNavigation?this.conversation.turns:[];
      const showTurns=turns.length>=3&&!this.conversation.nativeRailPresent;
      const anchored=this.notes.filter(note=>!!note.anchor);
      rail.hidden=!this.notes.length&&!showTurns;
      rail.classList.toggle('with-conversation',showTurns);
      rail.classList.toggle('native-nav',this.conversation.nativeRailPresent);
      const toggle=this.$<HTMLButtonElement>('#jp-list-toggle');
      toggle.textContent=showTurns?'≡':String(this.notes.length);
      toggle.title=showTurns?`已发现 ${turns.length} 轮 · ${this.notes.length} 张便签`:`本页 ${this.notes.length} 张便签`;
      const track=this.$<HTMLElement>('#jp-rail-track');
      const live=turns.filter(turn=>turn.element?.isConnected);
      const byTurn=new Map<string,Note[]>();
      const unassigned:Note[]=[];
      const knownIds=new Set(turns.map(turn=>turn.id));
      for(const note of anchored){
        const matched=this.liveMatch(note);
        const turn=showTurns&&matched?turnForRange(matched.range,live):null;
        const identity=turn?.id||note.conversationTurnId;
        const hasProgress=note.spatial?.withinTurnProgress!==undefined;
        if(showTurns&&identity&&knownIds.has(identity)&&hasProgress){
          const existing=byTurn.get(identity)||[];
          existing.push(note);byTurn.set(identity,existing);
        }else unassigned.push(note);
      }
      // The streaming assistant can mutate hundreds of text nodes without
      // adding a single question. Do not destroy/recreate the entire rail for
      // each MutationObserver callback: it causes focus loss and visible jitter.
      const signature=JSON.stringify({page:this.page,showTurns,
        native:this.conversation.nativeRailPresent,
        turnIds:showTurns?turns.map(t=>t.id):[],
        notes:this.notes.map(n=>[n.id,!!n.anchor,appearance(n).color,n.conversationTurnId]),
        groups:[...byTurn].map(([id,ns])=>[id,ns.map(n=>n.id)]),
        trackHeight:track.clientHeight});
      if(this.navigationBusy && this.railSignature){
        // In-flight navigation owns the scroll; defer structural repaint.
        this.syncRailMetadata();return;
      }
      if(signature===this.railSignature){
        this.syncRailMetadata();return;
      }
      this.railSignature=signature;
      this.hideTurnPreview();
      track.replaceChildren();this.railGroups=[];this.railLayoutBase=null;
      if(showTurns){
        for(const turn of turns){
          const notes=(byTurn.get(turn.id)||[]).sort((a,b)=>
            (a.spatial?.withinTurnProgress??1)-(b.spatial?.withinTurnProgress??1) || a.createdAt-b.createdAt);
          const fraction=notes.map(note=>note.spatial!.withinTurnProgress!);
          const weightHint=1;
          this.railGroups.push({turnId:turn.id,noteIds:notes.map(note=>note.id),fractions:fraction,weightHint});
          const bar=el('button','rail-turn');bar.type='button';
          bar.dataset.turnId=turn.id;bar.dataset.railKey=`turn:${turn.id}`;
          bar.setAttribute('aria-label',`第 ${turn.order+1} 轮：${turn.preview}`);
          bar.addEventListener('click',()=>void this.jumpToTurn(this.conversation.turns.find(t=>t.id===turn.id)||turn));
          bar.addEventListener('pointerenter',()=>this.showTurnPreview(this.conversation.turns.find(t=>t.id===turn.id)||turn,bar));
          bar.addEventListener('pointerleave',()=>this.hideTurnPreview());
          bar.addEventListener('focus',()=>this.showTurnPreview(this.conversation.turns.find(t=>t.id===turn.id)||turn,bar));
          bar.addEventListener('blur',()=>this.hideTurnPreview());
          track.appendChild(bar);
          for(const note of notes)this.addRailNote(track,note);
        }
        this.applyRailLayout(layoutConversationRail(this.railGroups,track.clientHeight||Math.max(170,innerHeight*.68-65)));
      }else{
        const points:PageRailPoint[]=[];
        for(const note of anchored){
          const fraction=note.spatial?.pageProgress;
          if(fraction===undefined)continue;
          points.push({noteId:note.id,fraction});
          this.addRailNote(track,note);
        }
        this.applyRailLayout(layoutPageRail(points,track.clientHeight||Math.max(170,innerHeight*.68-65)));
      }
      const assignedIds=new Set(this.railGroups.flatMap(group=>group.noteIds));
      const bottom=this.$<HTMLButtonElement>('#jp-loose-toggle');
      const otherCount=this.notes.filter(note=>!note.anchor||!assignedIds.has(note.id)).length;
      bottom.hidden=otherCount===0;
      if(!bottom.hidden){bottom.textContent=String(otherCount);bottom.title=`${otherCount} 张悬浮或待定位便签`;}
      this.activeTurnId=null;this.updateActiveTurn();this.renderList();
    }

    private syncRailMetadata():void {
      for(const button of this.shadow.querySelectorAll<HTMLButtonElement>('.rail-turn')){
        const turn=this.conversation.turns.find(t=>t.id===button.dataset.turnId);
        if(turn)button.setAttribute('aria-label',`第 ${turn.order+1} 轮：${turn.preview}`);
      }
      for(const button of this.shadow.querySelectorAll<HTMLButtonElement>('.rail-pin')){
        const note=this.notes.find(n=>n.id===button.dataset.noteId);
        if(!note)continue;
        button.classList.toggle('missing',!!note.anchor&&!this.liveMatch(note));
        const description=note.text.trim().slice(0,90)||note.anchor?.exact.slice(0,70)||'空白便签';
        button.setAttribute('aria-label',`跳转便签：${description}`);
      }
      this.updateActiveTurn();
      // Unlike the tiny rail, an open navigation list contains user-visible
      // text. Update its labels in-place instead of replacing focused buttons.
      if(this.listOpen){
        for(const entry of this.shadow.querySelectorAll<HTMLButtonElement>('.turn-entry[data-turn-id]')){
          const turn=this.conversation.turns.find(t=>t.id===entry.dataset.turnId);
          const label=entry.querySelector('span:last-child');
          if(turn&&label)label.textContent=turn.preview;
        }
        for(const entry of this.shadow.querySelectorAll<HTMLButtonElement>('.note-entry[data-note-id]')){
          const note=this.notes.find(n=>n.id===entry.dataset.noteId);
          const label=entry.querySelector<HTMLElement>('.note-name');
          if(note&&label)label.textContent=note.text.trim().split('\n')[0]||note.anchor?.exact.slice(0,65)||'空白便签';
        }
      }
    }

    private addRailNote(track:HTMLElement,note:Note):HTMLButtonElement {
      const button=el('button',`rail-pin${note.anchor&&!this.liveMatch(note)?' missing':''}`);
      button.type='button';button.dataset.noteId=note.id;button.dataset.railKey=`note:${note.id}`;
      button.style.background=COLOR_HEX[appearance(note).color];
      const description=note.text.trim().slice(0,90)||note.anchor?.exact.slice(0,70)||'空白便签';
      button.setAttribute('aria-label',`${note.anchor&&!this.liveMatch(note)?'原文暂未加载，':''}跳转便签：${description}`);
      button.addEventListener('click',()=>this.goTo(note.id));
      button.addEventListener('pointerenter',()=>this.showNotePreview(note,button));
      button.addEventListener('pointerleave',()=>this.hideTurnPreview());
      button.addEventListener('focus',()=>this.showNotePreview(note,button));
      button.addEventListener('blur',()=>this.hideTurnPreview());
      track.appendChild(button);return button;
    }

    private applyRailLayout(layout:RailLayout):void {
      const track=this.$<HTMLElement>('#jp-rail-track');
      this.railLayoutBase=layout;
      this.railLayoutHeight=layout.height;
      const lanes=railNoteLanes(layout.positions);
      for(const button of track.querySelectorAll<HTMLButtonElement>('[data-rail-key]')){
        const key=button.dataset.railKey||'';
        const y=layout.positions.get(key);
        if(y!==undefined)button.style.top=`${y}px`;
        const lane=lanes.get(key);
        if(lane!==undefined){
          // 3 * 9px fits the 29px-wide track; vertical ordering is untouched.
          button.style.left=`${1+lane*9}px`;
          button.style.width='8px';
          button.style.height='6px';
          button.dataset.railLane=String(lane);
        }else{
          button.style.removeProperty('left');
          button.style.removeProperty('width');
          button.style.removeProperty('height');
          delete button.dataset.railLane;
        }
      }
    }

    private renderList():void {
      const list=this.$<HTMLElement>('#jp-list');
      const turns=this.conversationNavigation&&!this.conversation.nativeRailPresent?this.conversation.turns:[];
      list.hidden=!this.listOpen || (!this.notes.length&&turns.length<3);
      if(list.hidden)return;
      list.replaceChildren();
      const head=el('div','list-header');
      const title=el('span');title.textContent='JotPatch';
      const close=el('button');close.type='button';close.textContent='×';close.title='关闭列表';
      close.addEventListener('click',()=>{this.listOpen=false;this.renderList();});
      head.append(title,close);list.appendChild(head);
      const hasTurns=turns.length>=3;
      const live=turns.filter(t=>t.element?.isConnected);
      const mapped=new Set<string>();
      if(hasTurns){
        for(const turn of turns){
          const button=el('button','entry turn-entry');button.type='button';button.dataset.turnId=turn.id;
          const number=el('span','turn-order');number.textContent=String(turn.order+1);
          const label=el('span');label.textContent=turn.preview;
          button.append(number,label);
          button.addEventListener('click',()=>{this.listOpen=false;this.renderList();void this.jumpToTurn(this.conversation.turns.find(t=>t.id===turn.id)||turn);});
          list.appendChild(button);
          for(const note of this.sortedNotes()){
            if(!note.anchor)continue;
            const matched=this.liveMatch(note);
            const linked=(matched?turnForRange(matched.range,live)?.id:undefined)||note.conversationTurnId;
            if(linked!==turn.id)continue;
            mapped.add(note.id);
            this.addListNote(list,note,true);
          }
        }
      }
      const others=this.sortedNotes().filter(note=>!mapped.has(note.id));
      if(others.length){
        const heading=el('div','list-section');heading.textContent=hasTurns?'悬浮便签':'本页便签';list.appendChild(heading);
        for(const note of others)this.addListNote(list,note,false);
      }
      const footer=el('div','list-footer');footer.textContent=BRAND_LINE;list.appendChild(footer);
    }

    private addListNote(list:HTMLElement,note:Note,nested:boolean):void {
      const button=el('button',`entry note-entry${nested?' nested':''}`);button.type='button';button.dataset.noteId=note.id;
      const dot=el('span','dot');dot.style.background=COLOR_HEX[appearance(note).color];
      const label=el('span','note-name');label.textContent=note.text.trim().split('\n')[0]||note.anchor?.exact.slice(0,65)||'空白便签';
      button.append(dot,label);
      if(note.anchor){
        const symbol=el('span','entry-pin');symbol.textContent='📌';
        symbol.title=this.liveMatch(note)?'已钉在原文':'原文暂未加载';
        symbol.classList.toggle('unresolved',!this.liveMatch(note));
        symbol.setAttribute('aria-label',symbol.title);
        button.appendChild(symbol);
      }
      button.addEventListener('click',()=>{this.listOpen=false;this.renderList();this.goTo(note.id);});
      list.appendChild(button);
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
        const track=this.$<HTMLElement>('#jp-rail-track');
        if(this.railGroups.length && track.clientHeight!==this.railLayoutHeight)this.renderDock();
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
      if(!range.startContainer.isConnected||!range.endContainer.isConnected || range.toString()!==note.anchor.exact)return null;
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
    private trustedNoteMatch(note:Note,index?:TextIndex):Match|null {
      if(!note.anchor)return null;
      const turns=this.conversation.turns.filter(t=>t.element?.isConnected);
      const targetId=note.conversationTurnId?
        this.conversationIndex.resolveId(note.conversationTurnId):null;
      // Do not interpret a matching sentence in ANOTHER round as success.
      if(targetId && conversationSite()){
        if(!turns.some(t=>t.id===targetId))return null;
        const accept=(range:Range)=>turnForRange(range,turns)?.id===targetId;
        const cached=this.liveMatch(note);
        if(cached && accept(cached.range))return cached;
        return resolveAnchor(note.anchor,index||buildTextIndex(),accept);
      }
      return this.liveMatch(note) || resolveAnchor(note.anchor,index||buildTextIndex());
    }

    private navigateToNoteRange(match:Match):boolean {
      const node=match.range.startContainer;
      const element=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
      if(!element?.isConnected)return false;
      const root=conversationScrollRoot(element);
      const rect=match.range.getBoundingClientRect();
      const rootTop=root===document.scrollingElement?0:root.getBoundingClientRect().top;
      root.scrollTo({top:root.scrollTop+rect.top-rootTop-140,behavior:'auto'});
      this.schedulePosition();
      return true;
    }

    /** Restore an anchored note in two phases: (1) its known question; (2)
     *  the EXACT quotation within that round. Never jump to a similar phrase
     *  in a different conversation turn. */
    private async recoverNote(noteId:string,show:boolean):Promise<void> {
      const note=this.notes.find(n=>n.id===noteId);
      if(!note?.anchor)return;
      this.hideTurnPreview();
      const job=this.beginNavigation();
      const root=this.navigationRoot();
      const start=root?.scrollTop??0,extent=root?.scrollHeight??0;
      const reading=this.conversation.turns.find(t=>t.element?.isConnected)?.element||null;
      const oldTop=reading?.getBoundingClientRect().top??0;
      let outcome:'arrived'|'partial'|'failed'='failed';
      try{
        let matched=this.trustedNoteMatch(note);
        if(!matched && note.conversationTurnId){
          const turn=await this.locateTurn(note.conversationTurnId,job.controller);
          if(!turn?.element || job.controller.signal.aborted)return;
          this.scanLiveTurns();
          // A virtualized answer may load only after its prompt is approached.
          navigateToPrompt(turn.element);
          const progress=note.spatial?.withinTurnProgress;
          const rootForTurn=conversationScrollRoot(turn.element);
          const next=this.conversation.turns[turn.order+1];
          if(progress!==undefined && next?.element?.isConnected){
            const currentY=conversationScrollHint(turn.element);
            const nextY=conversationScrollHint(next.element);
            if(nextY>currentY)rootForTurn.scrollTo({top:currentY+progress*(nextY-currentY)-125,behavior:'auto'});
          }
          // Verify on each step. Never accept a global text match outside
          // the saved logical round, even if it has identical wording.
          for(let i=0;i<17&&!job.controller.signal.aborted;i++){
            await navigationPause(i===0?190:150,job.controller.signal);
            this.scanLiveTurns();
            matched=this.trustedNoteMatch(note);
            if(matched)break;
            const active=this.conversation.turns.find(t=>t.id===this.conversationIndex.resolveId(note.conversationTurnId!));
            if(!active?.element?.isConnected)break;
            const amount=Math.max(100,(rootForTurn.clientHeight||innerHeight)*.53);
            rootForTurn.scrollTo({top:rootForTurn.scrollTop+amount,behavior:'auto'});
          }
          if(!matched)outcome='partial';
        }
        if(matched && !job.controller.signal.aborted){
          // Scrolling may recycle the original Text node immediately. Rebuild
          // a verified Range AFTER movement before claiming arrival.
          for(let verify=0;verify<3 && !job.controller.signal.aborted;verify++){
            if(!this.navigateToNoteRange(matched))break;
            if(!await navigationPause(130,job.controller.signal))break;
            this.scanLiveTurns();
            matched=this.trustedNoteMatch(note,buildTextIndex());
            if(!matched)break;
            const rangeBox=matched.range.getBoundingClientRect();
            const node=matched.range.startContainer;
            const element=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
            const parent=element?conversationScrollRoot(element):null;
            const viewport=parent===document.scrollingElement?
              {top:0,bottom:innerHeight} : parent?.getBoundingClientRect();
            if(viewport && rangeBox.bottom>viewport.top && rangeBox.top<viewport.bottom){
              outcome='arrived';this.matches.set(note.id,matched);break;
            }
          }
          if(outcome==='arrived' && show)this.showCard(note.id);
        }
      }finally{
        if(this.navController===job.controller && !job.controller.signal.aborted){
          if(outcome==='failed' && root)this.restoreAfterFailedSearch(root,start,extent,reading,oldTop);
          this.finishNavigation(job,outcome==='arrived'?undefined:
            outcome==='partial'?'已到达所属对话，但尚未找到这段原文':'暂时无法定位原文');
          if(outcome==='failed' && show)this.showCard(note.id,false,true);
        }
      }
    }

    private goTo(noteId: string, show=true): void {
      const note=this.notes.find(n=>n.id===noteId);
      if(!note)return;
      if(!note.anchor){if(show)this.showCard(noteId);return;}
      const match=this.trustedNoteMatch(note);
      if(match){
        this.cancelNavigation(false);
        this.navigateToNoteRange(match);
        if(show)this.showCard(note.id);
        return;
      }
      if(note.conversationTurnId){void this.recoverNote(noteId,show);return;}
      this.toast('原文尚未加载，可从导航列表找回便签');
      if(show)this.showCard(note.id,false,true);
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
          <button class="paper-pin" type="button" aria-label="解除原文锚定" title="已钉在原文 · 点击解除锚定" ${note.anchor?'':'hidden'}>
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
          <div class="note-mode">${note.anchor?'📌 贴在原文':'◌ 本页悬浮'}</div>
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
      paper.querySelector('.paper-pin')!.addEventListener('click',()=>this.unpinNote(note.id));
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
        this.updatePinIcon(paper,fresh);
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
        this.unpinUndo=null;
        if(this.deletedUndo)clearTimeout(this.deletedUndo.timer);
        const timer=window.setTimeout(()=>{this.deletedUndo=null;this.hideToast();},8000);
        this.deletedUndo={note,timer};this.toast('便签已删除',true,8000);
      }catch{this.toast('删除失败，请重试');}
    }
    private updatePinIcon(paper:HTMLElement,note:Note):void {
      const pin=paper.querySelector<HTMLButtonElement>('.paper-pin');
      if(pin)pin.hidden=!note.anchor;
      const mode=paper.querySelector<HTMLElement>('.note-mode');
      if(mode)mode.textContent=note.anchor?'📌 贴在原文':'◌ 本页悬浮';
    }

    /** One-way transition: text-pinned -> page-floating, never the reverse. */
    private unpinNote(noteId:string):void {
      const note=this.notes.find(n=>n.id===noteId);
      if(!note?.anchor)return;
      const paper=this.cards.get(noteId);
      const rect=paper?.getBoundingClientRect();
      const style=appearance(note);
      if(this.unpinUndo)clearTimeout(this.unpinUndo.timer);
      const timer=window.setTimeout(()=>{this.unpinUndo=null;},8100);
      this.unpinUndo={noteId,anchor:{...note.anchor},turnId:note.conversationTurnId,oldAppearance:{...style},pageKey:this.page,timer};
      if(this.deletedUndo){clearTimeout(this.deletedUndo.timer);this.deletedUndo=null;}
      note.anchor=undefined;
      note.conversationTurnId=undefined;
      this.explicitlyDetachedIds.delete(noteId);
      // Preserve the top-left screen position instead of teleporting the paper
      // to the generic free-note default on the first unpin.
      if(rect){
        const baseY=74+this.notes.indexOf(note)*14;
        note.appearance={...style,offsetX:rect.left-(innerWidth-style.width-56),offsetY:rect.top-baseY};
      }
      if(paper)this.updatePinIcon(paper,note);
      this.touchNote(note);
      this.refreshAnchors();
      this.toast('已改为本页悬浮便签',true,8000);
    }

    private async undoLastAction():Promise<void>{
      if(this.unpinUndo){
        const undo=this.unpinUndo;clearTimeout(undo.timer);this.unpinUndo=null;
        if(undo.pageKey!==this.page)return;
        const note=this.notes.find(n=>n.id===undo.noteId);
        if(!note)return;
        note.anchor=undo.anchor;note.conversationTurnId=undo.turnId;
        note.appearance={...undo.oldAppearance};
        const paper=this.cards.get(note.id);
        if(paper)this.updatePinIcon(paper,note);
        this.touchNote(note);this.refreshAnchors();this.toast('已恢复原文锚定');
        return;
      }
      await this.undoDeletion();
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
      this.$<HTMLButtonElement>('#jp-cancel-nav').hidden=true;
      const toast=this.$<HTMLElement>('#jp-toast');
      this.$<HTMLElement>('#jp-toast-text').textContent=message;
      this.$<HTMLElement>('#jp-undo').hidden=!undo;
      toast.hidden=false;
      this.toastTimer=window.setTimeout(()=>this.hideToast(),duration);
    }
  }
}
