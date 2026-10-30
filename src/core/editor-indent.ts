namespace JP {
  /** A small, predictable two-space indentation for the note's current line
   * or selected lines. Keep real contenteditable DOM nodes and inline marks:
   * re-rendering Markdown on each key would lose selection and native undo. */
  export function indentNoteEditor(editor:HTMLElement,outdent:boolean):boolean {
    const selection=(editor.getRootNode() as ShadowRoot & {getSelection?:()=>Selection|null})
      .getSelection?.() || document.getSelection();
    if(!selection?.rangeCount)return false;
    const range=selection.getRangeAt(0);
    if(!editor.contains(range.startContainer)||!editor.contains(range.endContainer))return false;
    if(range.collapsed && !outdent){
      // Single caret: Tab inserts two spaces at the caret, like a text editor.
      // execCommand retains native browser selection and undo when available.
      const succeeded=document.execCommand('insertText',false,'  ');
      if(!succeeded){
        const node=document.createTextNode('  ');
        range.insertNode(node);
        selection.collapse(node,2);
      }
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }
    const containingBlock=(node:Node):HTMLElement=>{
      let element=node.nodeType===Node.ELEMENT_NODE?node as HTMLElement:node.parentElement;
      while(element && element!==editor){
        if(element.matches('p,li,div') && editor.contains(element))return element;
        element=element.parentElement;
      }
      return editor;
    };
    const all=Array.from(editor.querySelectorAll<HTMLElement>('p,li,div'))
      .filter(item=>!item.querySelector('p,li,div'));
    let blocks:HTMLElement[];
    if(range.collapsed)blocks=[containingBlock(range.startContainer)];
    else {
      blocks=all.filter(block=>range.intersectsNode(block));
      // A selection ending at the very start of the next line must not
      // indent an unselected next line.
      if(range.endOffset===0){
        const after=containingBlock(range.endContainer);
        if(after!==editor && blocks.length>1 && blocks.at(-1)===after)blocks.pop();
      }
      if(!blocks.length)blocks=[containingBlock(range.startContainer)];
    }
    const startContainer=range.startContainer,startOffset=range.startOffset;
    let changed=false,removedAtCaret=0;
    for(const block of blocks){
      let first=block.firstChild;
      // Prefix whitespace *outside* bold/italic spans so marks survive.
      if(!outdent){
        const prefix=document.createTextNode('  ');
        block.insertBefore(prefix,first);
        changed=true;
      }else{
        if(first?.nodeType!==Node.TEXT_NODE){
          // Whitespace from legacy rich content may be inside an inline span.
          first=block.querySelector('strong,em,b,i')?.firstChild||first;
        }
        if(first?.nodeType!==Node.TEXT_NODE)continue;
        const node=first as Text;
        const match=node.data.match(/^( {1,2}|\t)/);
        if(!match)continue;
        node.deleteData(0,match[0].length);
        if(startContainer===node)removedAtCaret=match[0].length;
        changed=true;
      }
    }
    if(!changed)return false;
    if(range.collapsed){
      if(startContainer.isConnected){
        const at=startContainer.nodeType===Node.TEXT_NODE
          ? Math.max(0,Math.min((startContainer as Text).length,startOffset-removedAtCaret))
          : Math.min(startOffset,startContainer.childNodes.length);
        selection.collapse(startContainer,at);
      }else selection.collapse(blocks[0],0);
    }else{
      const next=document.createRange();
      next.setStart(blocks[0],0);
      next.setEnd(blocks[blocks.length-1],blocks[blocks.length-1].childNodes.length);
      selection.removeAllRanges();selection.addRange(next);
    }
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }
}
