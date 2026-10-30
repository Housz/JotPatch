namespace JP {
  /** Find the caret in the editor's own selection, not in the host webpage. */
  function editorCaret(editor:HTMLElement):{selection:Selection;range:Range}|null {
    const root=editor.getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null};
    const shadowSelection=root.getSelection?.();
    const selection=shadowSelection?.rangeCount?shadowSelection:document.getSelection();
    if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);
    if(!range.collapsed || !editor.contains(range.startContainer))return null;
    return {selection,range};
  }

  function lineBlock(editor:HTMLElement,node:Node):HTMLElement|null {
    let current=node.nodeType===Node.ELEMENT_NODE?node as HTMLElement:node.parentElement;
    while(current && current!==editor){
      if(current.matches('p,div') && current.parentElement===editor)return current;
      if(current.tagName==='LI' && current.parentElement?.matches('ul,ol') &&
         current.parentElement.parentElement===editor)return current;
      current=current.parentElement;
    }
    return null;
  }

  /** Copy/cut the entire current Markdown line only when there is no selection.
   *  Selected content and all ordinary browser clipboard shortcuts are native.
   *  ClipboardEvent.clipboardData is used synchronously during the user gesture
   *  (no clipboard permissions, remote APIs, or selection-changing copy hack).
   */
  export function editorLineClipboard(editor:HTMLElement,event:ClipboardEvent,cut:boolean):boolean {
    if(!event.clipboardData)return false;
    const caret=editorCaret(editor);
    if(!caret)return false;
    const {selection,range}=caret;
    const node=range.startContainer;
    const block=lineBlock(editor,node);
    if(block){
      const wrapper=document.createElement('div');
      if(block.tagName==='LI'){
        const source=block.parentElement!;
        const list=source.cloneNode(false) as HTMLOListElement | HTMLUListElement;
        if(source.tagName==='OL'){
          const offset=Array.prototype.indexOf.call(source.children,block) as number;
          (list as HTMLOListElement).start=(source as HTMLOListElement).start+offset;
        }
        list.appendChild(block.cloneNode(true));wrapper.appendChild(list);
      }else wrapper.appendChild(block.cloneNode(true));
      const value=markdownFromEditor(wrapper);
      event.clipboardData.setData('text/plain',value+'\n');
      event.preventDefault();
      if(!cut)return true;
      const parent=block.parentElement!;
      const next=block.nextElementSibling,previous=block.previousElementSibling;
      // Use the browser editing command when available to keep its undo stack.
      const whole=document.createRange();
      whole.selectNode(block);
      selection.removeAllRanges();selection.addRange(whole);
      const native=document.execCommand('delete',false);
      if(!native){
        block.remove();
        if(parent.matches('ol,ul')&&!parent.children.length)parent.remove();
        const target=next?.isConnected?next:previous?.isConnected?previous:editor;
        const restored=document.createRange();
        restored.selectNodeContents(target);
        restored.collapse(target===next);
        selection.removeAllRanges();selection.addRange(restored);
      }
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }

    // An empty contenteditable can start with a bare text node, before the
    // browser inserts <p> elements. Support its current logical newline too.
    if(node.nodeType!==Node.TEXT_NODE || node.parentNode!==editor)return false;
    const text=node as Text;
    const from=text.data.lastIndexOf('\n',Math.max(0,range.startOffset-1))+1;
    const index=text.data.indexOf('\n',range.startOffset);
    const to=index<0?text.length:index;
    event.clipboardData.setData('text/plain',text.data.slice(from,to)+'\n');
    event.preventDefault();
    if(!cut)return true;
    const removeStart=to<text.length?from:from>0?from-1:from;
    const removeEnd=to<text.length?to+1:to;
    text.deleteData(removeStart,removeEnd-removeStart);
    selection.collapse(text,Math.min(removeStart,text.length));
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
}
