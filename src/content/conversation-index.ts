namespace JP {
  /** In-memory navigation cache for DOM virtualization. Does not persist prompt text. */
  export class ConversationIndex {
    private discovered = new Map<string, ConversationTurn>();
    reset(): void { this.discovered.clear(); }

    combine(snapshot: ConversationSnapshot): ConversationSnapshot {
      const present = new Set<string>();
      for (const turn of snapshot.turns) {
        present.add(turn.id);
        // Only stable site IDs can safely survive unmounts. Repeated prompts
        // without stable identifiers are ephemeral to avoid false matches.
        if (turn.stableId) this.discovered.set(turn.stableId, {...turn, element:null});
      }
      const historical: ConversationTurn[] = [];
      for (const turn of this.discovered.values()) {
        if (present.has(turn.id)) continue;
        historical.push({...turn, element: null});
      }
      const turns = [...snapshot.turns, ...historical].sort((a,b) =>
        (a.scrollHint ?? Infinity) - (b.scrollHint ?? Infinity) || a.id.localeCompare(b.id));
      turns.forEach((turn,order) => { turn.order = order; });
      return {...snapshot,turns};
    }

    discoveredCount(): number { return this.discovered.size; }
  }
}
