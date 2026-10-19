namespace JP {
  /** A content turn owns ordered, independent notes with absolute within-turn fractions. */
  export interface RailTurnGroup {
    turnId: string;
    noteIds: string[];
    fractions: number[];
    /** Optional rendered-height hint, 0.75–1.5. It never alters note fractions. */
    weightHint?: number;
  }
  export interface RailRegion { turnId: string; start: number; end: number }
  export interface RailLayout {
    positions: Map<string, number>;
    regions: RailRegion[];
    dense: boolean;
    /** True when at least two independent targets cannot fit a 9px gap. */
    minPitch: number;
    height: number;
  }
  export interface PageRailPoint { noteId: string; fraction: number }
  const BOUNDARY = 5;
  const TURN_WEIGHT = 17;
  const NOTE_WEIGHT = 10;
  const IDEAL_NOTE_PITCH = 11;
  const MIN_COMFORTABLE_PITCH = 9;

  export function clampRail(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
  }

  /**
   * Pool adjacent violators for non-decreasing constrained values. Transform
   * x_i -> x_i - gap * i first, then reconstruct. The result is the closest
   * least-squares solution with minimum order-preserving marker spacing.
   * Fractions are NEVER renormalized to the first/last note in a turn.
   */
  export function placeOrderedMarkers(fractions: number[], low: number, high: number, preferredGap = IDEAL_NOTE_PITCH): number[] {
    if (!fractions.length) return [];
    const usable = Math.max(0, high - low);
    const gap = fractions.length === 1 ? 0 : Math.min(preferredGap, usable / (fractions.length - 1));
    const transformed = fractions.map((fraction, index) => low + clampRail(fraction, 0, 1) * usable - index * gap);
    type Block = { start: number; end: number; total: number; count: number };
    const blocks: Block[] = [];
    transformed.forEach((value, index) => {
      blocks.push({start:index,end:index,total:value,count:1});
      while (blocks.length >= 2) {
        const last = blocks[blocks.length - 1], prior = blocks[blocks.length - 2];
        if (prior.total / prior.count <= last.total / last.count) break;
        blocks.pop(); blocks.pop();
        blocks.push({start:prior.start,end:last.end,total:prior.total+last.total,count:prior.count+last.count});
      }
    });
    const result = new Array<number>(fractions.length);
    const maxIntercept = high - (fractions.length - 1) * gap;
    for (const block of blocks) {
      const intercept = clampRail(block.total / block.count, low, Math.max(low, maxIntercept));
      for (let i = block.start; i <= block.end; i++) result[i] = intercept + i * gap;
    }
    return result;
  }

  /** The compact overview is the ordered rail itself: no merging or count pins. */
  export function layoutConversationRail(groups: RailTurnGroup[], requestedHeight: number): RailLayout {
    const height = Math.max(50, Number.isFinite(requestedHeight) ? requestedHeight : 400);
    const usable = height - BOUNDARY * 2;
    const positions = new Map<string, number>();
    const regions: RailRegion[] = [];
    if (!groups.length) return {positions, regions, dense:false, minPitch:Infinity, height};

    // Give note-heavy rounds a larger interval, while a long answer gets only
    // a moderate bonus. The total height always remains bounded by the rail.
    const weights = groups.map(g =>
      TURN_WEIGHT * clampRail(g.weightHint ?? 1, .75, 1.5) + NOTE_WEIGHT * g.noteIds.length);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let cursor = BOUNDARY;
    let minPitch = Infinity;
    for (let turnIndex = 0; turnIndex < groups.length; turnIndex++) {
      const group = groups[turnIndex];
      const span = usable * weights[turnIndex] / total;
      const start = cursor, end = cursor + span;
      regions.push({turnId:group.turnId,start,end});
      const turnY = start + Math.min(2.5, span * .12);
      positions.set(`turn:${group.turnId}`, turnY);
      const low = Math.min(end, turnY + Math.min(12, Math.max(4,span*.12)));
      const high = Math.max(low, end - Math.min(6, span * .10));
      // Every note has an intrinsic [0,1] location. Keep *all* of them.
      const noteYs = placeOrderedMarkers(group.fractions, low, high);
      group.noteIds.forEach((id, index) => positions.set(`note:${id}`, noteYs[index]));
      const allYs = [turnY, ...noteYs].sort((a,b) => a-b);
      for (let i = 1; i < allYs.length; i++) minPitch = Math.min(minPitch, allYs[i]-allYs[i-1]);
      cursor += span;
    }
    const allPoints = [...positions.values()].sort((a,b) => a-b);
    for (let i = 1; i < allPoints.length; i++) minPitch = Math.min(minPitch, allPoints[i]-allPoints[i-1]);
    return {positions, regions, minPitch, dense:minPitch<MIN_COMFORTABLE_PITCH, height};
  }

  /** Note-only mode: preserve page fractions and avoid erasing the position of
   *  unknown anchors. Page notes without a content position belong in the box. */
  export function layoutPageRail(points: PageRailPoint[], requestedHeight: number): RailLayout {
    const height = Math.max(50, Number.isFinite(requestedHeight) ? requestedHeight : 400);
    const lo = BOUNDARY, hi = height-BOUNDARY;
    const ordered = [...points].sort((a,b) => a.fraction-b.fraction || a.noteId.localeCompare(b.noteId));
    const ys = placeOrderedMarkers(ordered.map(p => p.fraction),lo,hi);
    const positions = new Map<string,number>();
    ordered.forEach((point,index)=>positions.set(`note:${point.noteId}`,ys[index]));
    let minPitch=Infinity;
    for(let i=1;i<ys.length;i++)minPitch=Math.min(minPitch,ys[i]-ys[i-1]);
    return {positions,regions:[],minPitch,dense:minPitch<MIN_COMFORTABLE_PITCH,height};
  }

  /**
   * Continuous focus+context lens. Integrate a strictly positive Gaussian
   * derivative on *each side* of the focus. This preserves the two endpoints,
   * keeps the pointer's focus coordinate fixed and can never reorder targets.
   */
  export function fisheyeCoordinate(y: number, focus: number, height: number, radius = 38, strength = 13): number {
    const H = Math.max(1,height);
    const f = clampRail(focus,0,H), v=clampRail(y,0,H);
    if (v===f || v===0 || v===H) return v;
    // Simpson integration, bounded samples (<=48 per interval) for predictable
    // input latency even on 1200+ turn synthetic documents.
    const integrate = (start:number,end:number):number => {
      if (end <= start) return 0;
      const n=Math.min(48,Math.max(6,2*Math.ceil((end-start)/9)));
      const h=(end-start)/n;
      const weight=(x:number) => 1+strength*Math.exp(-.5*((x-f)/radius)**2);
      let sum=weight(start)+weight(end);
      for(let i=1;i<n;i++)sum+=(i%2?4:2)*weight(start+i*h);
      return h/3*sum;
    };
    if(v<f){const total=integrate(0,f);return total>0?f*integrate(0,v)/total:v;}
    const total=integrate(f,H);
    return total>0?f+(H-f)*integrate(f,v)/total:v;
  }

  export function fisheyePositions(base:RailLayout,focus:number):Map<string,number>{
    const H=Math.max(1,base.height), f=clampRail(focus,0,H);
    // Reuse one ~2px numeric CDF per animation frame. The old per-marker
    // integration was ~14ms for 1200 targets; this is O(H + markerCount).
    const cells=Math.max(8,Math.ceil(H/2)),step=H/cells;
    const area=new Float64Array(cells+1);
    const radius=38,strength=13;
    const weight=(x:number)=>1+strength*Math.exp(-.5*((x-f)/radius)**2);
    let previous=weight(0);
    for(let i=1;i<=cells;i++){
      const next=weight(i*step);
      area[i]=area[i-1]+(previous+next)*step/2;
      previous=next;
    }
    const at=(y:number)=>{
      if(y<=0)return 0;if(y>=H)return area[cells];
      const pos=y/step,i=Math.floor(pos),fraction=pos-i;
      return area[i]+(area[i+1]-area[i])*fraction;
    };
    const midArea=at(f),totalArea=area[cells],out=new Map<string,number>();
    for(const [key,y] of base.positions){
      if(y===f||y===0||y===H){out.set(key,y);continue;}
      const sample=at(y);
      const next=y<f ? (midArea>0?f*sample/midArea:y) :
        (totalArea>midArea ? f+(H-f)*(sample-midArea)/(totalArea-midArea):y);
      out.set(key,clampRail(next,0,H));
    }
    return out;
  }

}
