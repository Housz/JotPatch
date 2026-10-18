// The content script is compiled as an ordered classic-script TS namespace.
// This keeps the extension dependency-free while allowing modules to share types.
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

  export type NoteColor = 'yellow' | 'pink' | 'green' | 'blue' | 'purple' | 'gray';
  export type SelectionTrigger = 'always' | 'alt' | 'off';

  export interface NoteAppearance {
    color: NoteColor;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  }

  export interface Note {
    schemaVersion: 1;
    id: string;
    pageKey: string;
    sourceUrl: string;
    sourceTitle: string;
    // Optional: page notes are pinned to the page but not to a text range.
    anchor?: TextAnchor;
    text: string;
    appearance?: Partial<NoteAppearance>;
    createdAt: number;
    updatedAt: number;
    revision?: number;
    deletedAt?: number;
  }

  export interface Preferences {
    selectionTrigger: SelectionTrigger;
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
