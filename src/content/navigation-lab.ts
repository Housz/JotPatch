namespace JP {
  /** Experimental checkpoints are navigation metadata only. They never contain
   *  a transcript, prompt preview, HTML, or a live DOM element. */
  export interface LabCheckpoint {
    id:string;
    top:number;
    extent:number;
    observedAt:number;
  }

  export interface LabNavigationSearch {
    targetId:string;
    getRoot:()=>Element|null;
    getTurns:()=>ConversationTurn[];
    signal:AbortSignal;
    checkpoints:NavigationLabIndex;
    /** Optional fallback hint retained by the ordinary v0.1.14 index. */
    hint?:number;
    hintExtent?:number;
    maxSteps?:number;
    maxMilliseconds?:number;
  }

  export interface LabNavigationResult {
    turn:ConversationTurn|null;
    outcome:'arrived'|'cancelled'|'unreachable';
    strategy:'direct'|'checkpoint'|'progressive';
    steps:number;
    elapsedMs:number;
  }

  export class NavigationLabIndex {
    private entries=new Map<string,LabCheckpoint>();
    private readonly limit=1200;

    clear():void{this.entries.clear();}
    size():number{return this.entries.size;}
    lookup(id:string):LabCheckpoint|undefined{return this.entries.get(id);}

    observe(turns:ConversationTurn[],root:Element|null):void {
      if(!root || !root.isConnected)return;
      const extent=root.scrollHeight;
      for(const turn of turns){
        if(!turn.stableId || !turn.element?.isConnected)continue;
        const rect=turn.element.getBoundingClientRect();
        if(!Number.isFinite(rect.top))continue;
        const rootTop=root===document.scrollingElement?0:root.getBoundingClientRect().top;
        const top=root.scrollTop+rect.top-rootTop;
        // A DOM-recycling virtualization window can have a short-lived bad
        // rect. A later trusted observation of the same ID replaces it.
        if(!Number.isFinite(top))continue;
        this.entries.delete(turn.id);
        this.entries.set(turn.id,{id:turn.id,top,extent,observedAt:Date.now()});
        if(this.entries.size>this.limit){
          const oldest=this.entries.keys().next().value;
          if(oldest)this.entries.delete(oldest);
        }
      }
    }

    /** Extent validation prevents stale absolute hints after lazy paging. */
    usable(id:string,root:Element):LabCheckpoint|undefined {
      const checkpoint=this.entries.get(id);
      if(!checkpoint)return undefined;
      const changed=Math.abs(root.scrollHeight-checkpoint.extent)/Math.max(1,checkpoint.extent);
      return changed<=.18?checkpoint:undefined;
    }
  }

  /** Opt-in, bounded recovery for an explicitly selected historical target.
   *  A target is considered reached ONLY when its logical ID is mounted. It
   *  never fetches internal ChatGPT endpoints or background-scans a transcript. */
  export async function recoverConversationTurnLab(search:LabNavigationSearch):Promise<LabNavigationResult>{
    const start=Date.now(),signal=search.signal;
    const result=(turn:ConversationTurn|null,strategy:LabNavigationResult['strategy'],steps:number):LabNavigationResult=>({
      turn,
      outcome:signal.aborted?'cancelled':turn?'arrived':'unreachable',
      strategy,steps,elapsedMs:Date.now()-start
    });
    const find=()=>search.getTurns().find(turn=>turn.id===search.targetId && !!turn.element?.isConnected && turn.element.getClientRects().length>0)||null;
    let direct=find();if(direct || signal.aborted)return result(direct,'direct',0);

    let root=search.getRoot();
    if(!root || !root.isConnected)return result(null,'progressive',0);
    const checkpoint=search.checkpoints.usable(search.targetId,root);
    const hint=checkpoint?.top??search.hint;
    const extent=checkpoint?.extent??search.hintExtent;
    if(Number.isFinite(hint)&&Number.isFinite(extent) &&
       Math.abs(root.scrollHeight-extent!)/Math.max(1,extent!)<=.18){
      root.scrollTo({top:hint!,behavior:'auto'});
      // Keep fast path short, but wait long enough for async DOM commit.
      for(let n=0;n<3;n++){
        if(!await navigationPause(n===0?140:165,signal))return result(null,'checkpoint',0);
        direct=find();if(direct)return result(direct,'checkpoint',0);
      }
    }

    const maxSteps=Math.max(1,Math.min(220,search.maxSteps??140));
    const deadline=start+Math.max(1000,Math.min(60000,search.maxMilliseconds??32000));
    let stationary=0,windowBefore='',previousRoot=root,usedSteps=0;
    for(let step=1;step<=maxSteps && Date.now()<deadline;step++){
      usedSteps=step;
      if(signal.aborted)return result(null,'progressive',step-1);
      // Re-scan first: getTurns can discover replacement scroll containers.
      search.getTurns();
      root=search.getRoot();
      if(!root?.isConnected){
        // React can replace the entire scroll container during transitions.
        if(!await navigationPause(250,signal))return result(null,'progressive',step-1);
        root=search.getRoot();
        if(!root?.isConnected)continue;
      }
      if(root!==previousRoot){stationary=0;windowBefore='';previousRoot=root;}
      const turns=search.getTurns();
      const target=turns.find(turn=>turn.id===search.targetId);
      const visible=turns.filter(turn=>turn.element?.isConnected).sort((a,b)=>a.order-b.order);
      direct=visible.find(turn=>turn.id===search.targetId)||null;
      if(direct)return result(direct,'progressive',step-1);
      if(!target || !visible.length)break;

      const near=visible.reduce((best,item)=>Math.abs(item.order-target.order)<Math.abs(best.order-target.order)?item:best,visible[0]);
      let direction=target.order<near.order?-1:1;
      if(visible.length>=2){
        const first=visible[0].element!.getBoundingClientRect().top;
        const last=visible[visible.length-1].element!.getBoundingClientRect().top;
        if(first>last)direction*=-1;
      }
      const before=root.scrollTop;
      const amount=direction*Math.max(200,root.clientHeight||innerHeight)*.82;
      root.scrollTo({top:before+amount,behavior:'auto'});
      // Dynamic window updates typically finish in ~100-200ms; slow boundary
      // pagination requires an adaptive wait, not rapid repeated scrolls.
      const quiet=stationary>0;
      if(!await navigationPause(quiet?280:115,signal))return result(null,'progressive',step);
      direct=find();if(direct)return result(direct,'progressive',step);
      let afterTurns=search.getTurns().filter(turn=>turn.element?.isConnected);
      let windowNow=afterTurns.map(turn=>turn.id).join('|');
      let moved=Math.abs(root.scrollTop-before)>2;
      if(!moved && windowNow===windowBefore){
        // The scroll boundary may be waiting for a network request and React
        // commit. Re-sample at increasing intervals only at such boundaries.
        for(let patience=0;patience<3;patience++){
          if(!await navigationPause(250+patience*220,signal))return result(null,'progressive',step);
          direct=find();if(direct)return result(direct,'progressive',step);
          const newer=search.getTurns().filter(turn=>turn.element?.isConnected);
          const signature=newer.map(turn=>turn.id).join('|');
          if(signature!==windowNow || Math.abs(root.scrollTop-before)>2){windowNow=signature;moved=true;break;}
        }
      }
      if(!moved && windowNow===windowBefore)stationary++;
      else stationary=0;
      windowBefore=windowNow;
      if(stationary>=4)break;
    }
    return result(null,'progressive',usedSteps);
  }
}
