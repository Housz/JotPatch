namespace JP {
  const PREFIX = 'jotpatch:note:v1:';
  const PREFERENCES_KEY = 'jotpatch:preferences:v1';
  const COLORS: readonly NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
  const DEFAULTS: NoteAppearance = { color: 'yellow', width: 256, height: 202, offsetX: 0, offsetY: 0 };

  export function appearance(note: Note): NoteAppearance {
    const style = note.appearance || {};
    return {
      color: COLORS.includes(style.color as NoteColor) ? style.color as NoteColor : DEFAULTS.color,
      width: Math.min(560, Math.max(180, Number(style.width) || DEFAULTS.width)),
      height: Math.min(620, Math.max(132, Number(style.height) || DEFAULTS.height)),
      offsetX: Number.isFinite(style.offsetX) ? style.offsetX! : DEFAULTS.offsetX,
      offsetY: Number.isFinite(style.offsetY) ? style.offsetY! : DEFAULTS.offsetY
    };
  }

  export class NoteRepository {
    static key(id: string): string { return PREFIX + id; }

    async list(page: string): Promise<Note[]> {
      const stored = await chrome.storage.local.get(null) as Record<string, unknown>;
      const output: Note[] = [];
      const staleDeletes: string[] = [];
      for (const [key, value] of Object.entries(stored)) {
        if (!key.startsWith(PREFIX) || !this.isNote(value) || value.pageKey !== page) continue;
        if (value.deletedAt) {
          if (Date.now() - value.deletedAt > 30_000) staleDeletes.push(key);
          continue;
        }
        output.push(value);
      }
      // A tombstone protects against stale page instances resurrecting a deletion.
      if (staleDeletes.length) void chrome.storage.local.remove(staleDeletes).catch(() => undefined);
      return output.sort((a, b) => a.createdAt - b.createdAt);
    }

    async get(id: string): Promise<Note | null> {
      const value = (await chrome.storage.local.get(NoteRepository.key(id)))[NoteRepository.key(id)];
      return this.isNote(value) ? value : null;
    }

    async put(note: Note): Promise<void> {
      await chrome.storage.local.set({ [NoteRepository.key(note.id)]: note });
    }

    async markDeleted(note: Note): Promise<void> {
      await this.put({ ...note, deletedAt: Date.now(), updatedAt: Date.now(), revision: (note.revision || 0) + 1 });
    }

    async remove(id: string): Promise<void> {
      await chrome.storage.local.remove(NoteRepository.key(id));
    }

    noteFromChange(key: string, newValue: unknown): Note | null {
      return key.startsWith(PREFIX) && this.isNote(newValue) ? newValue : null;
    }

    async preferences(): Promise<Preferences> {
      const saved = (await chrome.storage.local.get(PREFERENCES_KEY))[PREFERENCES_KEY];
      const setting = saved && typeof saved === 'object' ? (saved as Partial<Preferences>).selectionTrigger : null;
      return { selectionTrigger: setting === 'alt' || setting === 'off' ? setting : 'always' };
    }

    private isNote(value: unknown): value is Note {
      if (!value || typeof value !== 'object') return false;
      const x = value as Partial<Note>;
      return x.schemaVersion === 1 && typeof x.id === 'string' && typeof x.pageKey === 'string' &&
        typeof x.text === 'string' && (!x.anchor || typeof x.anchor.exact === 'string') &&
        typeof x.createdAt === 'number' && typeof x.updatedAt === 'number';
    }
  }
}
