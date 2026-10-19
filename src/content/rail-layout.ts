namespace JP {
  /** One turn and its individually navigable notes. Input order is document order. */
  export interface RailTurnGroup {
    turnId: string;
    noteIds: string[];
    /** Normalized relative positions within the answer; same order as noteIds. */
    fractions: number[];
  }
  export interface RailRegion {
    turnId: string;
    start: number;
    end: number;
  }
  export interface RailLayout {
    /** Pixel centers in the *track*, not the viewport. */
    positions: Map<string, number>;
    regions: RailRegion[];
    dense: boolean;
    height: number;
  }

  const TURN_WEIGHT = 14;
  const NOTE_WEIGHT = 15;
  const LOCAL_GAP = 16;

  /**
   * Pure layout function: no DOM, no page scrolling, no collapsed count glyphs.
   * Available height is shared across rounds; rounds containing more notes get
   * more space. When dense, hovering one round borrows room from other rounds
   * without changing the underlying order or creating a second-click popover.
   */
  export function layoutConversationRail(groups: RailTurnGroup[], requestedHeight: number, focusedTurn: string | null = null): RailLayout {
    const height = Math.max(50, Number.isFinite(requestedHeight) ? requestedHeight : 400);
    const pad = 5;
    const usable = height - pad * 2;
    const positions = new Map<string, number>();
    const regions: RailRegion[] = [];
    if (!groups.length) return { positions, regions, dense: false, height };

    const weights = groups.map(group => TURN_WEIGHT + group.noteIds.length * NOTE_WEIGHT);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const dense = totalWeight > usable;
    const focused = focusedTurn && dense ? groups.findIndex(group => group.turnId === focusedTurn) : -1;
    const spans = weights.map(weight => weight / totalWeight * usable);
    if (focused >= 0 && groups[focused].noteIds.length) {
      const otherWeight = totalWeight - weights[focused];
      if (otherWeight > 0) {
        const requested = 11 + (groups[focused].noteIds.length + 1) * LOCAL_GAP;
        // Do not collapse every other turn to zero to make room for the lens.
        const focusSpan = Math.min(requested, usable * 0.56, usable - Math.min(otherWeight / TURN_WEIGHT * 2, usable * 0.44));
        const remainder = usable - focusSpan;
        for (let index = 0; index < groups.length; index++)
          spans[index] = index === focused ? focusSpan : (weights[index] / otherWeight) * remainder;
      }
    }

    let cursor = pad;
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const span = spans[groupIndex];
      regions.push({turnId:group.turnId,start:cursor,end:cursor+span});
      positions.set(`turn:${group.turnId}`, cursor + Math.min(3, span * 0.17));
      const length = group.noteIds.length;
      const usableSpan = Math.max(0, span - Math.min(6, span * .22));
      for (let i = 0; i < length; i++) {
        const fraction = Math.max(0, Math.min(1, group.fractions[i] ?? (i+.5)/length));
        // Blend source-relative position and equal spacing. Equal spacing
        // preserves independent markers even when all quotes are adjacent.
        const slot = (i+1)/(length+1) * 0.76 + fraction * 0.24;
        positions.set(`note:${group.noteIds[i]}`, cursor + Math.min(6,span*.23) + usableSpan * slot);
      }
      cursor += span;
    }
    return {positions,regions,dense,height};
  }
}
