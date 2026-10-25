namespace JP {
  export interface NavigationSearch {
    targetId:string;
    root:Element;
    /** Always get a fresh snapshot after each scroll or DOM mount. */
    getTurns:()=>ConversationTurn[];
    signal:AbortSignal;
    hint?:number;
    hintExtent?:number;
    maxSteps?:number;
  }

  export async function navigationPause(duration:number,signal:AbortSignal):Promise<boolean>{
    if(signal.aborted)return false;
    return new Promise(resolve=>{
      let completed=false;
      const done=(valid:boolean)=>{
        if(completed)return;completed=true;
        clearTimeout(timer);signal.removeEventListener('abort',cancel);resolve(valid);
      };
      const cancel=()=>done(false);
      const timer=window.setTimeout(()=>done(true),duration);
      signal.addEventListener('abort',cancel,{once:true});
      if(signal.aborted)cancel();
    });
  }

  /** Navigation by verified identity, *not* by stale document coordinates.
   *  Read-only until explicitly invoked by a user's click. Bounded traversal;
   *  no internal ChatGPT APIs, no background scanning, no persistent transcript. */
  export async function recoverConversationTurn(search:NavigationSearch):Promise<ConversationTurn|null>{
    const {root,signal,targetId,getTurns}=search;
    const find=()=>getTurns().find(t=>t.id===targetId && !!t.element?.isConnected && t.element.getClientRects().length>0);
    const found=find();if(found)return found;
    if(signal.aborted)return null;

    // Hint only when the virtual scroll extent has not changed significantly.
    // A browser may virtualize a stable-height region, where this fast path
    // avoids walking dozens of screens.
    if(Number.isFinite(search.hint) && Number.isFinite(search.hintExtent) &&
       Math.abs(root.scrollHeight-search.hintExtent!)/Math.max(1,search.hintExtent!)<.22){
      root.scrollTo({top:search.hint!,behavior:'auto'});
      if(!await navigationPause(260,signal))return null;
      const hit=find();if(hit)return hit;
    }

    let stationary=0;
    let previousWindow='';
    const deadline=Date.now()+18000;
    for(let step=0;step<(search.maxSteps??95)&&Date.now()<deadline;step++){
      if(signal.aborted)return null;
      const turns=getTurns();
      const hit=turns.find(t=>t.id===targetId&&!!t.element?.isConnected);
      if(hit)return hit;
      const live=turns.filter(t=>t.element?.isConnected).sort((a,b)=>a.order-b.order);
      if(!live.length)break;
      const target=turns.find(t=>t.id===targetId);
      if(!target)break;
      const closest=live.reduce((best,t)=>Math.abs(t.order-target.order)<Math.abs(best.order-target.order)?t:best,live[0]);
      let direction=target.order<closest.order?-1:1;
      if(live.length>=2 && live[0].element && live[live.length-1].element &&
         live[0].element!.getBoundingClientRect().top>live[live.length-1].element!.getBoundingClientRect().top){
        direction*=-1; // reversed visual order
      }
      const height=Math.max(180,root.clientHeight||innerHeight);
      const amount=direction*height*.77;
      const before=root.scrollTop;
      root.scrollTo({top:before+amount,behavior:'auto'});
      if(!await navigationPause(stationary>1?420:190,signal))return null;
      const arrived=find();if(arrived)return arrived;
      const windowIds=getTurns().filter(t=>t.element?.isConnected).map(t=>t.id).join('|');
      if(Math.abs(root.scrollTop-before)<2 && windowIds===previousWindow){stationary++;}
      else stationary=0;
      previousWindow=windowIds;
      if(stationary>=8)break; // exhausted loading boundary, including slow lazy loads
    }
    // On failure, the caller decides whether restoring the original reading
    // position is still appropriate (a user cancellation must never rewind).
    return null;
  }
}
