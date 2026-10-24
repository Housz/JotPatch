namespace JP {
  export const CONTENT_SCRIPT = 'dist/content.js';
  export const HIGHLIGHT_CSS = 'styles/highlight.css';
  export const SITE_SCRIPT_PREFIX = 'jotpatch_site_';

  const SUPPORTED_PROTOCOLS = ['http:', 'https:'];

  /** Match patterns never contain explicit ports: http://localhost:8000 -> http://localhost/*. */
  export function buildMatchPattern(origin: string): string {
    const url = new URL(origin);
    if (!SUPPORTED_PROTOCOLS.includes(url.protocol) || !url.hostname) throw new Error('Unsupported origin');
    return `${url.protocol}//${url.hostname}/*`;
  }

  /** Compact stable hash; collisions are possible but exceedingly rare for a tiny allowlist. */
  export function siteScriptId(pattern: string): string {
    let hash = 2166136261;
    for (const char of pattern) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `${SITE_SCRIPT_PREFIX}${(hash >>> 0).toString(16)}`;
  }

  /** Host patterns the user has actually granted through the optional permission prompt. */
  export async function grantedSitePatterns(): Promise<string[]> {
    const all = await JP.api.permissions.getAll();
    return ((all?.origins || []) as string[]).filter((pattern) => /^https?:\/\//.test(pattern));
  }

  export interface SiteSyncResult {
    registered: string[];
    removed: string[];
  }

  /**
   * Reconcile registered site scripts with the granted host permissions.
   * Idempotent, so it is safe both on browser start and right after a grant or
   * revocation. Firefox 105+ and Chrome 96+ implement the same API surface.
   */
  export async function syncSiteScripts(): Promise<SiteSyncResult> {
    const result: SiteSyncResult = { registered: [], removed: [] };
    const scripting = JP.api?.scripting;
    if (!scripting?.registerContentScripts || !scripting?.getRegisteredContentScripts) {
      console.warn('JotPatch: this browser cannot register site scripts; toolbar activation still works.');
      return result;
    }
    const wanted = await grantedSitePatterns();
    const wantedSet = new Set(wanted);
    const existing = (await scripting.getRegisteredContentScripts()) as Array<{ id?: string; matches?: string[] }>;
    const ours = existing.filter((script) => typeof script.id === 'string' && script.id.startsWith(SITE_SCRIPT_PREFIX));
    const stale = ours.filter((script) => !(script.matches || []).every((match) => wantedSet.has(match)));
    const staleIds = new Set(stale.map((script) => script.id as string));
    if (staleIds.size) {
      try {
        await scripting.unregisterContentScripts({ ids: [...staleIds] });
        result.removed.push(...staleIds);
      } catch (error) {
        console.warn('JotPatch: could not unregister stale site scripts', error);
      }
    }
    for (const pattern of wanted) {
      const id = siteScriptId(pattern);
      if (ours.some((script) => script.id === id && !staleIds.has(id))) continue;
      try {
        await scripting.registerContentScripts([{
          id, matches: [pattern], js: [CONTENT_SCRIPT], css: [HIGHLIGHT_CSS],
          runAt: 'document_idle', persistAcrossSessions: true
        }]);
        result.registered.push(id);
      } catch (error) {
        // Two contexts (options page and background) may sync concurrently; the
        // loser of that race only reports a duplicate id.
        const message = String((error as Error)?.message || error);
        if (!/already|duplicate/i.test(message)) console.warn(`JotPatch: could not register ${pattern}`, error);
      }
    }
    return result;
  }
}
