namespace JP {
  /** Minimal, safe Markdown <> rich text boundary: bold, italic, bullets and ordered lists only.
   * No HTML content is accepted from the clipboard or serialized to storage. */
  function appendInlineMarkdown(parent: HTMLElement, value: string): void {
    const pieces = value.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
    for (const piece of pieces) {
      if (!piece) continue;
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
        const tag = document.createElement('strong'); tag.textContent = piece.slice(2, -2); parent.appendChild(tag);
      } else if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
        const tag = document.createElement('em'); tag.textContent = piece.slice(1, -1); parent.appendChild(tag);
      } else parent.appendChild(document.createTextNode(piece));
    }
  }

  export function renderMarkdown(editor: HTMLElement, markdown: string): void {
    const fragment = document.createDocumentFragment();
    let list: HTMLOListElement | HTMLUListElement | null = null;
    let kind = '';
    for (const line of markdown.split('\n')) {
      const bullet = line.match(/^\s*[-+] (.*)$/);
      const numbered = line.match(/^\s*\d+\. (.*)$/);
      const next = bullet ? 'ul' : numbered ? 'ol' : '';
      if (next) {
        if (!list || kind !== next) {
          list = document.createElement(next) as HTMLOListElement | HTMLUListElement;
          fragment.appendChild(list); kind = next;
        }
        const li = document.createElement('li'); appendInlineMarkdown(li, (bullet || numbered)![1]);
        if (!li.childNodes.length) li.appendChild(document.createElement('br'));
        list.appendChild(li);
      } else {
        list = null; kind = '';
        const p = document.createElement('p'); appendInlineMarkdown(p, line);
        if (!p.childNodes.length) p.appendChild(document.createElement('br'));
        fragment.appendChild(p);
      }
    }
    editor.replaceChildren(fragment);
  }

  function richInline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    if (element.tagName === 'BR') return '\n';
    const text = Array.from(element.childNodes, richInline).join('');
    if (!text.trim()) return text;
    if (element.matches('strong,b') || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600)
      return `**${text}**`;
    if (element.matches('em,i') || element.style.fontStyle === 'italic') return `*${text}*`;
    return text;
  }

  /** Serializes only the four supported formats. Nested HTML from paste is never retained. */
  export function markdownFromEditor(editor: HTMLElement): string {
    const lines: string[]=[];
    let loose='';
    const flush=()=>{if(loose){lines.push(loose);loose='';}};
    const visit=(node:Node):void=>{
      if(node.nodeType===Node.TEXT_NODE){loose+=node.textContent||'';return;}
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      const item=node as HTMLElement;
      if(item.matches('ul,ol')){
        flush(); const ordered=item.tagName==='OL';let order=Number(item.getAttribute('start'))||1;
        for(const li of Array.from(item.children).filter(x=>x.tagName==='LI')){
          const inner=Array.from(li.childNodes,richInline).join('').replace(/\n+$/,'');
          lines.push(`${ordered?`${order++}.`:'-'} ${inner}`);
        }
      }else if(item.matches('p,div')){
        // Chromium execCommand can nest UL/OL inside P. Walk nested blocks
        // instead of flattening the list into plain italic/bold text.
        const children=Array.from(item.childNodes);
        if(children.some(x=>x instanceof Element && x.matches('ul,ol,p,div'))){
          flush();children.forEach(visit);flush();
        }else{
          flush();lines.push(children.map(richInline).join('').replace(/\n$/,''));
        }
      }else if(item.tagName==='BR'){
        flush();lines.push('');
      }else loose+=richInline(item);
    };
    Array.from(editor.childNodes).forEach(visit);flush();
    return lines.join('\n').replace(/\n{3,}$/,'\n\n');
  }
}
