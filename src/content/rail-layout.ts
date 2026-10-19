namespace JP {
  /** One turn and its individually navigable notes, in document order. */
  export interface RailTurnGroup {
    turnId: string;
    noteIds: string[];
    fractions: number[];
  }
  export interface RailRegion {
    turnId: string;
    start: number;
    end: number;
  }
  export interface RailLayout {
    /** Pixel coordinates relative to the rail track, never viewport coordinates. */
    positions: Map<string, number>;
    regions: RailRegion[];
    /** Groups whose individual dots are replaced by a multi-color overview. */
    compactGroups: Set<string>;
    dense: boolean;
    height: number;
  }

  const TURN_WEIGHT = 14;
  const NOTE_WEIGHT = 15;
  const MIN_INDIVIDUAL_PITCH = 12;
  // Product threshold, independent of conversation length. Four notes within a
  // single turn are enough to earn a multi-color overview and hover expansion.
  export const OVERVIEW_NOTE_THRESHOLD = 4;

  /** Pure layout: one stable overview, never reflowed by hovering. */
  export function layoutConversationRail(groups: RailTurnGroup[], requestedHeight: number): RailLayout {
    const height = Math.max(50, Number.isFinite(requestedHeight) ? requestedHeight : 400);
    const pad = 5;
    const usable = Math.max(1, height - 2 * pad);
    const positions = new Map<string, number>();
    const regions: RailRegion[] = [];
    const compactGroups = new Set<string>();
    if (!groups.length) return {positions, regions, compactGroups, dense:false, height};

    const uncompressed = groups.map(g => TURN_WEIGHT + g.noteIds.length * NOTE_WEIGHT);
    const required = uncompressed.reduce((sum, weight) => sum + weight, 0);
    // Decide local compression from *real pixel budgets*, not just total notes
    // or number of turns. A 5-note/10-turn conversation should also show the
    // overview, while one or two comfortably separated notes remain direct.
    groups.forEach((group, index) => {
      const count = group.noteIds.length;
      const nominalSpan = uncompressed[index] / required * usable;
      if (count >= OVERVIEW_NOTE_THRESHOLD ||
          (count >= 2 && nominalSpan / (count+1) < MIN_INDIVIDUAL_PITCH)) {
        compactGroups.add(group.turnId);
      }
    });

    // A compact group needs *one* summary slot, not N full-height slots.
    // Otherwise an 8-note group creates excessive blank space in the rail.
    const weights = groups.map(group => compactGroups.has(group.turnId)
      ? TURN_WEIGHT + 12 + Math.min(group.noteIds.length, 5) * 2
      : TURN_WEIGHT + group.noteIds.length * NOTE_WEIGHT);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = pad;
    for (let groupIndex=0; groupIndex<groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const span = weights[groupIndex] / total * usable;
      regions.push({turnId:group.turnId, start:cursor, end:cursor+span});
      positions.set(`turn:${group.turnId}`, cursor + Math.min(3,span*.17));
      const count = group.noteIds.length;
      const inset = Math.min(6, span*.23);
      const noteSpan = Math.max(0,span-inset);
      for (let i=0; i<count; i++) {
        const fraction = Math.max(0,Math.min(1,group.fractions[i] ?? (i+.5)/count));
        const slot = (i+1)/(count+1)*.76 + fraction*.24;
        positions.set(`note:${group.noteIds[i]}`,cursor+inset+noteSpan*slot);
      }
      if(compactGroups.has(group.turnId))
        positions.set(`overview:${group.turnId}`,cursor+inset+noteSpan*.58);
      cursor+=span;
    }
    return {positions,regions,compactGroups,dense:required>usable||compactGroups.size>0,height};
  }

  export interface PageRailPoint { noteId: string; fraction: number; }
  export interface PageRailGroup { id: string; noteIds: string[]; center: number; start: number; end: number; }

  /**
   * Page-only fallback, e.g. an AI page whose DOM currently has <3 mounted
   * turns. A dense *note-only* rail must still show a visible multi-color
   * overview and the same hover lens, rather than endless overlapping dots.
   */
  export function groupPageRailPoints(points: PageRailPoint[], height: number): PageRailGroup[] {
    if (!points.length) return [];
    const safeHeight = Math.max(100,height);
    const crowded = points.length >= 14 && safeHeight/points.length < 34;
    const bin = crowded ? Math.min(52,Math.max(25,safeHeight/12)) : 18;
    const buckets = new Map<number,PageRailPoint[]>();
    for(const point of points){
      const y=Math.max(0,Math.min(1,point.fraction))*safeHeight;
      const slot=Math.floor(Math.min(safeHeight-0.001,y)/bin);
      const bucket=buckets.get(slot)||[];
      bucket.push(point);buckets.set(slot,bucket);
    }
    return [...buckets.entries()].sort(([a],[b])=>a-b).map(([slot,entries])=>{
      const start=slot*bin,end=Math.min(safeHeight,(slot+1)*bin);
      return {id:`page-region-${slot}`,noteIds:entries.map(e=>e.noteId),
        center:entries.reduce((sum,e)=>sum+Math.max(0,Math.min(1,e.fraction))*safeHeight,0)/entries.length,
        start,end};
    });
  }
  /** Individual notes from adjacent turns can also run out of space even if
   *  no one turn owns four notes. Preserve all turn bars, combine only closely
   *  spaced colored note dots into hoverable overview groups. */
  export interface RailCrossTurnGroup extends PageRailGroup {}
  export function groupCrowdedTurnNotes(groups:RailTurnGroup[], layout:RailLayout):RailCrossTurnGroup[] {
    const noteCount=groups.reduce((sum,g)=>sum+g.noteIds.length,0);
    if(noteCount<14 || layout.height/noteCount>=28)return [];
    const bin=Math.min(52,Math.max(32,layout.height/12));
    const bins=new Map<number,Array<{id:string;y:number}>>();
    for(const group of groups){
      if(layout.compactGroups.has(group.turnId))continue;
      for(const id of group.noteIds){
        const y=layout.positions.get(`note:${id}`);
        if(y==null)continue;
        const slot=Math.floor(Math.min(layout.height-.001,Math.max(0,y))/bin);
        const bucket=bins.get(slot)||[];bucket.push({id,y});bins.set(slot,bucket);
      }
    }
    return [...bins.entries()].sort(([a],[b])=>a-b).flatMap(([slot,items])=>{
      if(items.length<2)return [];
      items.sort((a,b)=>a.y-b.y);
      return [{id:`cross-region-${slot}`,noteIds:items.map(x=>x.id),
        center:items.reduce((sum,x)=>sum+x.y,0)/items.length,
        start:slot*bin,end:Math.min(layout.height,(slot+1)*bin)}];
    });
  }

}
