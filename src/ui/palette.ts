namespace JP {
  /** Shared note palette; both paper and Dock use the same persisted NoteColor IDs. */
  export const COLOR_HEX: Record<NoteColor, string> = {
    yellow: '#FFF1B8', pink: '#FBE1E9', green: '#DFF1DD',
    blue: '#DAECFF', purple: '#EAE2FA', gray: '#F0EFEC'
  };
  export const COLOR_ORDER: NoteColor[] = ['yellow', 'pink', 'green', 'blue', 'purple', 'gray'];
}
