namespace JP {
  const PREFIX = 'jotpatch:note:v1:';

  // Individual keys avoid a global read-modify-write notes array. Stage 1 will
  // add revision checks, per-page indexing, and conflict resolution.
  export class NoteRepository {
    static key(id: string): string { return PREFIX + id; }

    async list(page: string): Promise<Note[]> {
      const stored = await chrome.storage.local.get(null) as Record<string, unknown>;
      const output: Note[] = [];
      for (const [key, value] of Object.entries(stored)) {
        if (key.startsWith(PREFIX) && this.isNote(value) && value.pageKey === page) output.push(value);
      }
      return output.sort((a, b) => a.createdAt - b.createdAt);
    }

    async put(note: Note): Promise<void> {
      await chrome.storage.local.set({ [NoteRepository.key(note.id)]: note });
    }

    async remove(id: string): Promise<void> {
      await chrome.storage.local.remove(NoteRepository.key(id));
    }

    noteFromChange(key: string, newValue: unknown): Note | null {
      return key.startsWith(PREFIX) && this.isNote(newValue) ? newValue : null;
    }

    private isNote(value: unknown): value is Note {
      if (!value || typeof value !== 'object') return false;
      const x = value as Partial<Note>;
      return x.schemaVersion === 1 && typeof x.id === 'string' && typeof x.pageKey === 'string' &&
        typeof x.text === 'string' && !!x.anchor && typeof x.anchor.exact === 'string' &&
        typeof x.createdAt === 'number' && typeof x.updatedAt === 'number';
    }
  }
}
