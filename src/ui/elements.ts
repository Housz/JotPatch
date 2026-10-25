namespace JP {
  /** Small Shadow-DOM element helper and anchored-range rectangle lookup. */
  export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag);
    if (className) item.className = className;
    return item;
  }
  export function visibleRect(range: Range): DOMRect | null {
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) return rect;
    const rect = range.getBoundingClientRect();
    return rect.height ? rect : null;
  }
  export function id(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  export function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(Math.max(lo, hi), x)); }

}
