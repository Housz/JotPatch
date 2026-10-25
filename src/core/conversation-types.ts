namespace JP {
  export type ConversationSite = 'chatgpt' | 'gemini' | (string & {});

  /** The scroll target MUST be the user prompt, never an article containing the AI reply. */
  export interface ConversationTurn {
    id: string;
    order: number;
    preview: string;
    element: Element | null;
    /** Only turns with a site-provided stable identity are safe to cache across unmounts. */
    stableId?: string;
    /** Approximate document scroll position captured while mounted, not a guaranteed locator. */
    scrollHint?: number;
    /** Scroll span when the hint was captured; prevents using stale coordinates. */
    scrollExtent?: number;
  }
  export interface ConversationSnapshot {
    site: ConversationSite | null;
    turns: ConversationTurn[];
    nativeRailPresent: boolean;
  }
}
