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
    private cards = new Map<string, HTMLElement>();
    private visible = true;
    private launcherOpen = false;
    private listOpen = false;
    private selectionTrigger: SelectionTrigger = 'always';
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
      void this.loadPreferences();
      await this.loadPage();
      this.observer = new MutationObserver(() => this.scheduleRefresh());
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
          const trigger = (changes[PREFERENCE_KEY].newValue as Partial<Preferences> | undefined)?.selectionTrigger;
          this.selectionTrigger = trigger === 'alt' || trigger === 'off' ? trigger : 'always';
          this.$<HTMLElement>('#jp-bubble').hidden = true;
        }
        for (const [key, change] of Object.entries(changes)) {
          const fresh = this.repo.noteFromChange(key, change.newValue);
          if (fresh && !this.ownWrites.has(fresh.id) && fresh.pageKey === this.page) this.syncExternalNote(fresh);
        }
      });
    }

    private async loadPreferences(): Promise<void> {
      try { this.selectionTrigger = (await this.repo.preferences()).selectionTrigger; }
      catch { this.selectionTrigger = 'always'; }
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
      this.openIds.clear(); this.cards.clear(); this.$<HTMLElement>('#jp-cards').replaceChildren();
      this.listOpen = false;
      void this.loadPage();
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
      if (target instanceof Node && this.host.contains(target)) return null;
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
    private renderDock(): void {
      const rail = this.$<HTMLElement>('#jp-rail');
      rail.hidden = !this.notes.length;
      this.$<HTMLButtonElement>('#jp-list-toggle').textContent = String(this.notes.length);
      const track = this.$<HTMLElement>('#jp-rail-track'); track.replaceChildren();
      const sorted = this.sortedNotes();
      const textLength = this.index?.text.length || 1;
      const placed: number[] = [];
      sorted.forEach((note, i) => {
        const match = this.matches.get(note.id);
        let pos = match ? match.start / textLength * 100 : (note.anchor ? 90 + i % 4 * 2 : 3 + i * 3);
        pos = clamp(pos, 2, 98);
        while (placed.some(p => Math.abs(p - pos) < 3.4) && pos < 96) pos += 3.4;
        placed.push(pos);
        const button = el('button', `rail-pin${note.anchor && !match ? ' missing' : ''}`);
        button.type = 'button'; button.style.top = `${pos}%`;
        button.style.background = note.anchor && !match ? '#aaa' : COLOR_HEX[appearance(note).color];
        button.title = note.text.trim().slice(0, 70) || (note.anchor?.exact.slice(0, 50) || '本页便签');
        button.setAttribute('aria-label', `跳转便签：${button.title}`);
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
      const head = el('div', 'list-header');
      const title = el('span'); title.textContent = `本页便签 · ${this.notes.length}`;
      const close = el('button'); close.type='button'; close.textContent='×'; close.title='关闭列表';
      close.addEventListener('click', () => {this.listOpen=false; this.renderList();});
      head.append(title,close); list.appendChild(head);
      for (const note of this.sortedNotes()) {
        const button = el('button','entry'); button.type='button';
        const dot = el('span','dot'); dot.style.background = COLOR_HEX[appearance(note).color];
        const content = el('span');
        const label = el('strong'); label.textContent = note.text.trim().split('\n')[0] || (note.anchor?.exact.slice(0,45) || '空白便签');
        const sub = el('small'); sub.textContent = !note.anchor ? '本页' : this.matches.has(note.id) ? '已关联原文' : '原文暂时未找到';
        content.append(label,sub); button.append(dot,content);
        button.addEventListener('click',()=>this.goTo(note.id)); list.appendChild(button);
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
      });
    }
    private positionMarkers(): void {
      for (const marker of Array.from(this.shadow.querySelectorAll<HTMLButtonElement>('.marker'))) {
        const range=this.matches.get(marker.dataset.noteId||'')?.range;
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
      const match=this.matches.get(noteId);
      if (match) {
        const node=match.range.startContainer;
        const target=node.nodeType===Node.ELEMENT_NODE ? node as Element : node.parentElement;
        target?.scrollIntoView({behavior:'smooth',block:'center'});
        this.schedulePosition();
      } else if(this.notes.find(n=>n.id===noteId)?.anchor) this.toast('原文暂时未找到，便签仍已保存');
      if(show) this.showCard(noteId);
    }

    private showCard(noteId: string, focus=false): void {
      const note=this.notes.find(n=>n.id===noteId); if(!note) return;
      let paper=this.cards.get(noteId);
      if(!paper) { paper=this.makePaper(note); this.cards.set(noteId,paper); this.$<HTMLElement>('#jp-cards').appendChild(paper); }
      this.openIds.add(noteId);
      paper.style.zIndex=String(++this.zOrder);
      this.positionCard(noteId);
      if(focus) paper.querySelector<HTMLTextAreaElement>('.note-editor')?.focus({preventScroll:true});
    }
    private closeCard(noteId: string): void {
      void this.saveNow(noteId);
      this.openIds.delete(noteId);
      this.cards.get(noteId)?.remove(); this.cards.delete(noteId);
    }

    private makePaper(note: Note): HTMLElement {
      const paper=el('section','paper');
      paper.dataset.noteId=note.id; paper.setAttribute('aria-label','JotPatch 便签');
      const style=appearance(note);
      paper.style.setProperty('--paper',COLOR_HEX[style.color]);
      paper.style.width=`${style.width}px`; paper.style.height=`${style.height}px`;
      paper.innerHTML=`
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
      const editor=paper.querySelector<HTMLTextAreaElement>('.note-editor')!;
      editor.value=note.text;
      editor.addEventListener('input',()=>{
        note.text=editor.value; note.updatedAt=Date.now(); this.dirty.add(note.id);
        this.scheduleSave(note.id); this.renderList();
      });
      editor.addEventListener('focus',()=>{
        paper.querySelector<HTMLElement>('.note-preview')!.hidden=true;
        editor.hidden=false;
      });
      editor.addEventListener('blur',()=>{
        this.updatePreview(paper,note);
        void this.saveNow(note.id);
      });
      paper.querySelector<HTMLElement>('.note-preview')!.addEventListener('click',()=>{
        paper.querySelector<HTMLElement>('.note-preview')!.hidden=true;
        editor.hidden=false;editor.focus({preventScroll:true});
      });
      paper.querySelector<HTMLElement>('.note-preview')!.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();
          paper.querySelector<HTMLElement>('.note-preview')!.hidden=true;
          editor.hidden=false;editor.focus({preventScroll:true});}
      });
      editor.addEventListener('keydown',(e: KeyboardEvent)=>{
        if ((e.ctrlKey||e.metaKey) && !e.altKey) {
          const lower=e.key.toLowerCase();
          if (lower==='b'||lower==='i') { e.preventDefault(); this.format(editor,lower==='b'?'bold':'italic'); }
          if(e.shiftKey && e.key==='7'){e.preventDefault(); this.format(editor,'number');}
          if(e.shiftKey && e.key==='8'){e.preventDefault(); this.format(editor,'bullet');}
        }
      });
      paper.addEventListener('pointerdown',()=>{ paper.style.zIndex=String(++this.zOrder); });
      for(const name of ['bold','italic','bullet','number'] as const) {
        const btn=paper.querySelector<HTMLButtonElement>(`.${name}`)!;
        btn.addEventListener('pointerdown',e=>e.preventDefault());
        btn.addEventListener('click',()=>this.format(editor,name));
      }
      paper.querySelector('.copy')!.addEventListener('click',()=>void this.copyNote(note.id));
      paper.querySelector('.jump')!.addEventListener('click',()=>this.goTo(note.id,false));
      paper.querySelector('.close')!.addEventListener('click',()=>this.closeCard(note.id));
      const menu=paper.querySelector<HTMLElement>('.note-menu')!;
      paper.querySelector('.menu-trigger')!.addEventListener('click',()=>{menu.hidden=!menu.hidden;});
      paper.querySelector('.copy-menu')!.addEventListener('click',()=>{menu.hidden=true;void this.copyNote(note.id);});
      paper.querySelector('.delete-menu')!.addEventListener('click',()=>{menu.hidden=true;void this.deleteNote(note.id);});
      const colors=paper.querySelector<HTMLElement>('.colors')!;
      COLOR_ORDER.forEach(color=>{
        const btn=el('button');btn.type='button';btn.title=color;
        btn.style.background=COLOR_HEX[color];btn.setAttribute('aria-label',`颜色：${color}`);
        btn.setAttribute('aria-pressed',String(color===style.color));
        btn.addEventListener('click',()=>{
          note.appearance={...appearance(note),color};
          paper.style.setProperty('--paper',COLOR_HEX[color]);
          colors.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
          this.touchNote(note);this.renderDock();this.renderMarkers();
        });
        colors.appendChild(btn);
      });
      this.installDrag(paper.querySelector<HTMLElement>('.drag-handle')!,note,'move');
      this.installDrag(paper.querySelector<HTMLElement>('.resize-handle')!,note,'resize');
      this.updatePreview(paper,note);
      return paper;
    }

    private updatePreview(paper:HTMLElement,note:Note):void {
      const editor=paper.querySelector<HTMLTextAreaElement>('.note-editor')!;
      const preview=paper.querySelector<HTMLElement>('.note-preview')!;
      if (editor===(paper.getRootNode() as ShadowRoot).activeElement) return;
      // Markdown is a small supported subset, parsed into safe DOM nodes.
      // Text from webpages is never fed into innerHTML.
      const hasFormat=/(?:\*\*[^\n*]+\*\*|\*[^\n*]+\*|^\s*(?:- |\d+\. ))/m.test(note.text);
      if(!hasFormat){preview.hidden=true;editor.hidden=false;return;}
      preview.replaceChildren();
      const appendInline=(parent:HTMLElement,line:string)=>{
        const tokens=line.split(/(\*\*[^\n*]+\*\*|\*[^\n*]+\*)/g);
        for(const token of tokens){
          let child:HTMLElement|null=null;
          if(token.startsWith('**')&&token.endsWith('**')&&token.length>4){
            child=el('strong');child.textContent=token.slice(2,-2);
          }else if(token.startsWith('*')&&token.endsWith('*')&&token.length>2){
            child=el('em');child.textContent=token.slice(1,-1);
          }
          if(child) parent.appendChild(child);
          else parent.appendChild(document.createTextNode(token));
        }
      };
      let list:HTMLOListElement|HTMLUListElement|null=null;
      let listType='';
      for(const line of note.text.split('\n')){
        const bullet=line.match(/^\s*- (.*)$/),number=line.match(/^\s*\d+\. (.*)$/);
        const type=bullet?'ul':number?'ol':'';
        if(type){
          if(!list||listType!==type){list=el(type==='ul'?'ul':'ol');preview.appendChild(list);listType=type;}
          const li=el('li');appendInline(li,(bullet||number)![1]);list.appendChild(li);
        }else{
          list=null;listType='';const para=el('p');
          appendInline(para,line||'\u00a0');preview.appendChild(para);
        }
      }
      editor.hidden=true;preview.hidden=false;
    }

    private format(editor: HTMLTextAreaElement, type: 'bold'|'italic'|'bullet'|'number'): void {
      if (editor.readOnly) return;
      editor.focus({preventScroll:true});
      const start=editor.selectionStart, end=editor.selectionEnd, value=editor.value;
      if(type==='bold'||type==='italic') {
        const marker=type==='bold'?'**':'*';
        editor.setRangeText(marker+value.slice(start,end)+marker,start,end,'select');
        editor.setSelectionRange(start+marker.length,end+marker.length);
      } else {
        const lineStart=value.lastIndexOf('\n',start-1)+1;
        let lineEnd=value.indexOf('\n',end);
        if(lineEnd===-1)lineEnd=value.length;
        const lines=value.slice(lineStart,lineEnd).split('\n');
        const replacement=lines.map((line,i)=>`${type==='bullet'?'- ':`${i+1}. `}${line}`).join('\n');
        editor.setRangeText(replacement,lineStart,lineEnd,'end');
      }
      editor.dispatchEvent(new Event('input',{bubbles:true}));
    }
    private installDrag(handle: HTMLElement,note: Note,mode: 'move'|'resize'):void {
      handle.addEventListener('pointerdown',(event:PointerEvent)=>{
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        const initial=appearance(note),startX=event.clientX,startY=event.clientY;
        const move=(e:PointerEvent)=>{
          if(e.pointerId!==event.pointerId)return;
          const dx=e.clientX-startX,dy=e.clientY-startY;
          const updated:NoteAppearance=mode==='move'
            ?{...initial,offsetX:initial.offsetX+dx,offsetY:initial.offsetY+dy}
            :{...initial,width:clamp(initial.width+dx,180,Math.min(560,innerWidth-15)),
              height:clamp(initial.height+dy,132,Math.min(620,innerHeight-15))};
          note.appearance=updated;
          const card=this.cards.get(note.id);
          if(card){card.style.width=`${updated.width}px`;card.style.height=`${updated.height}px`;}
          this.positionCard(note.id);
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
    private positionCard(noteId:string):void {
      const card=this.cards.get(noteId),note=this.notes.find(n=>n.id===noteId);
      if(!card||!note||!this.openIds.has(noteId))return;
      const dimensions=appearance(note);
      const match=this.matches.get(noteId);
      const rect=match&&visibleRect(match.range);
      if(note.anchor && match && (!rect||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth)){
        card.hidden=true;return;
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
        const editor=paper.querySelector<HTMLTextAreaElement>('.note-editor');if(editor)editor.value=fresh.text;
        this.updatePreview(paper,old);
        paper.style.setProperty('--paper',COLOR_HEX[appearance(fresh).color]);
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
