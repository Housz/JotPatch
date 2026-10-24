namespace JP {
  /** Ephemeral turn history. Only stable site IDs survive DOM virtualization. */
  export class ConversationIndex {
    private known = new Map<string, ConversationTurn>();
    private sequence: string[] = [];
    private physicalIds = new WeakMap<Element, string>();
    private aliases = new Map<string, string>();

    reset(): void {
      this.known.clear(); this.sequence=[];
      this.physicalIds=new WeakMap<Element,string>();this.aliases.clear();
    }

    resolveId(id:string):string {
      let current=id;
      for(let i=0;i<8;i++){
        const next=this.aliases.get(current);
        if(!next || next===current)break;
        current=next;
      }
      return current;
    }

    combine(snapshot:ConversationSnapshot):ConversationSnapshot {
      const seenStable=new Set<string>();
      const incomingIds=new Set(snapshot.turns.map(t=>t.stableId).filter((id):id is string=>!!id));
      const live:ConversationTurn[]=[];
      for(let incomingIndex=0;incomingIndex<snapshot.turns.length;incomingIndex++){
        const entry=snapshot.turns[incomingIndex];
        let next={...entry};
        if(next.stableId){
          let id=this.resolveId(next.stableId);
          // React may change the data-turn-key while reusing the *same*
          // actual user message node. A WeakMap is evidence of identity; the
          // same prompt text is NOT (users can ask identical questions twice).
          const container=next.element?.closest('article[data-turn], [data-turn-key], [data-turn-id], user-query');
          const prior=(next.element ? this.physicalIds.get(next.element) : undefined) ||
            (container ? this.physicalIds.get(container) : undefined);
          const previous=prior ? this.known.get(prior) : undefined;
          // Some virtualizers recycle a physical DOM node for a completely
          // different question. Identity continuity also requires its text.
          if(prior && prior!==id && previous && previous.preview===next.preview){
            this.aliases.set(id,prior);id=prior;
          }else if(!this.known.has(id) && next.preview.length>=8){
            // If React replaces the entire DOM shell while promoting a temp
            // ID to a final ID, physical identity is lost. Merge only with
            // strong adjacent-turn evidence, identical prompt and close
            // measured position. Never merge on prompt text alone.
            const priorVisible=snapshot.turns.slice(0,incomingIndex).reverse()
              .find(t=>t.stableId && this.sequence.includes(this.resolveId(t.stableId)));
            const successorVisible=snapshot.turns.slice(incomingIndex+1)
              .find(t=>t.stableId && this.sequence.includes(this.resolveId(t.stableId)));
            const left=priorVisible?.stableId?this.resolveId(priorVisible.stableId):null;
            const right=successorVisible?.stableId?this.resolveId(successorVisible.stableId):null;
            const candidates=this.sequence.filter(oldId=>{
              const original=this.known.get(oldId);if(!original || incomingIds.has(oldId))return false;
              if(original.preview!==next.preview || !Number.isFinite(original.scrollHint) ||
                 !Number.isFinite(next.scrollHint) || Math.abs(original.scrollHint!-next.scrollHint!)>36)return false;
              const index=this.sequence.indexOf(oldId);
              return (!!left && this.sequence[index-1]===left) ||
                (!!right && this.sequence[index+1]===right);
            });
            if(candidates.length===1){this.aliases.set(id,candidates[0]);id=candidates[0];}
          }
          next.stableId=id; next.id=id;
          if(next.element)this.physicalIds.set(next.element,id);
          if(container)this.physicalIds.set(container,id);
          if(seenStable.has(id))continue;
          seenStable.add(id);
          // Do not retain detached Elements in the long-lived index.
          this.known.set(id,{...next,element:null});
        }
        live.push(next);
      }

      // In a virtualized list, two overlapping loaded windows establish a
      // reliable relative sequence. Disjoint windows can only be estimated.
      const stableIds=live.filter(t=>!!t.stableId).map(t=>t.stableId!);
      for(let i=0;i<stableIds.length;i++){
        const id=stableIds[i];
        if(this.sequence.includes(id))continue;
        const previous=stableIds.slice(0,i).reverse().find(key=>this.sequence.includes(key));
        const following=stableIds.slice(i+1).find(key=>this.sequence.includes(key));
        if(previous)this.sequence.splice(this.sequence.indexOf(previous)+1,0,id);
        else if(following)this.sequence.splice(this.sequence.indexOf(following),0,id);
        else {
          const hint=this.known.get(id)?.scrollHint;
          const insertion=this.sequence.findIndex(key=>(this.known.get(key)?.scrollHint??Infinity)>(hint??Infinity));
          this.sequence.splice(insertion<0?this.sequence.length:insertion,0,id);
        }
      }
      const currentById=new Map(live.filter(t=>!!t.stableId).map(t=>[t.id,t]));
      const turns:ConversationTurn[]=[];
      for(const id of this.sequence){
        const current=currentById.get(id);
        const saved=current||this.known.get(id);
        if(saved) turns.push({...saved,element:current?.element||null});
      }
      // A turn without a site ID remains transient. Never persist its DOM
      // ordinal through virtualized unmounts or merge it with identical text.
      for(const turn of live.filter(t=>!t.stableId)){
        const at=turns.findIndex(t=>(t.scrollHint??Infinity)>(turn.scrollHint??Infinity));
        turns.splice(at<0?turns.length:at,0,turn);
      }
      turns.forEach((turn,i)=>{turn.order=i;});
      return {...snapshot,turns};
    }
    discoveredCount():number{return this.known.size;}
  }
}
