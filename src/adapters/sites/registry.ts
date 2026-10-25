namespace JP {
  /** A site adapter owns DOM discovery only. Core navigation must not know site-specific selectors. */
  export interface ConversationAdapter {
    readonly site: ConversationSite;
    /** Exact hostname checks; never use suffix matching without the dot boundary. */
    matches(url: URL): boolean;
    readonly selectors: string;
    canonical(node: Element): Element;
    prompt(node: Element, wrapper: Element): Element;
    nativeRailPresent?(): boolean;
  }

  const conversationAdapters: ConversationAdapter[] = [];
  export function registerConversationAdapter(adapter: ConversationAdapter): void {
    if (!adapter.site || !adapter.selectors || conversationAdapters.some(item => item.site === adapter.site))
      throw new Error(`Duplicate or invalid conversation adapter: ${adapter.site}`);
    conversationAdapters.push(adapter);
  }
  export function findConversationAdapter(url: URL = new URL(location.href)): ConversationAdapter | null {
    return conversationAdapters.find(adapter => adapter.matches(url)) || null;
  }
  export function conversationSite(url: URL = new URL(location.href)): ConversationSite | null {
    return findConversationAdapter(url)?.site || null;
  }
}
