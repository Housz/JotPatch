namespace JP {
  /** Passive, in-memory navigation history. Never scrolls the host page. */
  export class ConversationIndex {
    private known = new Map<string, ConversationTurn>();
    private sequence: string[] = [];

    reset(): void { this.known.clear(); this.sequence = []; }

    combine(snapshot: ConversationSnapshot): ConversationSnapshot {
      // Scan whatever ChatGPT/Gemini actually mounted. A detached prompt must
      // never be retained as a live Element in our cache.
      const liveById = new Map(snapshot.turns.map(turn => [turn.id, turn]));
      const stable = snapshot.turns.filter(turn => !!turn.stableId);
      const stableIds = stable.map(turn => turn.stableId!);
      for (const turn of stable) this.known.set(turn.stableId!, {...turn, element:null});

      // Insert newly discovered messages relative to adjacent *overlapping*
      // stable IDs, so adding older DOM nodes does not scramble known order.
      // Disjoint virtualized windows use their approximate scroll hints only
      // as a fallback; their precise global ordinal is not claimed.
      for (let index=0; index<stableIds.length; index++) {
        const id=stableIds[index];
        if (this.sequence.includes(id)) continue;
        const previous=stableIds.slice(0,index).reverse().find(key=>this.sequence.includes(key));
        const next=stableIds.slice(index+1).find(key=>this.sequence.includes(key));
        if(previous) this.sequence.splice(this.sequence.indexOf(previous)+1,0,id);
        else if(next) this.sequence.splice(this.sequence.indexOf(next),0,id);
        else {
          const hint=this.known.get(id)?.scrollHint;
          const at=this.sequence.findIndex(key=>(this.known.get(key)?.scrollHint ?? Infinity)>(hint??Infinity));
          this.sequence.splice(at<0?this.sequence.length:at,0,id);
        }
      }

      const result:ConversationTurn[]=[];
      for (const key of this.sequence) {
        const current=stable.find(turn=>turn.stableId===key);
        const record=current || this.known.get(key);
        if(record)result.push({...record,element:current?.element||null});
      }
      // An unlabeled turn cannot safely persist across virtualized unmounts.
      // Include it only while in the live DOM, in approximately its position.
      for (const turn of snapshot.turns.filter(turn=>!turn.stableId)) {
        const at=result.findIndex(existing=>(existing.scrollHint??Infinity)>(turn.scrollHint??Infinity));
        result.splice(at<0?result.length:at,0,{...turn});
      }
      result.forEach((turn,order)=>{turn.order=order;});
      return {...snapshot,turns:result};
    }
    discoveredCount(): number { return this.known.size; }
  }
}
