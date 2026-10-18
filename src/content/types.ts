// Stage 0 intentionally compiles ordered TypeScript namespaces into one classic
// content script; no runtime dependency or cross-origin imports are needed.
declare const chrome: any;

namespace JP {
  export interface TextAnchor {
    version: 1;
    type: 'text';
    exact: string;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
  }

  export interface Note {
    schemaVersion: 1;
    id: string;
    pageKey: string;
    sourceUrl: string;
    sourceTitle: string;
    anchor: TextAnchor;
    text: string;
    createdAt: number;
    updatedAt: number;
  }

  export interface Match {
    range: Range;
    start: number;
    end: number;
    confidence: 'exact-position' | 'quote-context';
  }

  export interface TextIndex {
    text: string;
    nodes: Array<{ node: Text; start: number; end: number }>;
    truncated: boolean;
  }
}
