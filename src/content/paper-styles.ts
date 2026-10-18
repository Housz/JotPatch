namespace JP {
  export const PAPER_STYLES = `
    :host{all:initial;font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#37342e}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    button{font:inherit;border:0;cursor:pointer} button:focus-visible,textarea:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .launcher{position:fixed;top:14px;right:42px;display:flex;gap:3px;align-items:center;padding:3px;
      background:#fffdf8f0;border:1px solid #e8e3d8;border-radius:20px;box-shadow:0 4px 16px #0002;pointer-events:auto}
    .launcher button{width:29px;height:29px;border-radius:50%;background:transparent;color:#5f5b51;font-size:17px}
    .launcher button:hover{background:#eee9df} .launcher button#jp-new{font-size:21px;line-height:26px}
    .bubble{position:fixed;z-index:20;pointer-events:auto;transform:translateY(-100%)}
    .bubble button{width:31px;height:31px;border-radius:50%;background:#fff8df;color:#7a612a;box-shadow:0 2px 12px #0003;
      border:1px solid #e7d59e;font-size:16px;line-height:30px;padding:0;text-align:center}
    .bubble button:hover{background:#ffe7a1;transform:scale(1.06)}
    .rail{position:fixed;right:7px;top:20%;height:60%;width:26px;border-radius:16px;background:#fffdf9dc;
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail-head{position:absolute;top:3px;left:2px;width:20px;height:20px;border-radius:50%;font-size:11px;
      background:#f0ece2;color:#615a4b;padding:0}
    .rail-track{position:absolute;top:28px;bottom:12px;left:3px;right:3px}
    .rail-pin{position:absolute;left:4px;width:12px;height:12px;border:1px solid #0002;border-radius:50%;
      box-shadow:0 1px 4px #0002;transform:translateY(-50%);padding:0}
    .rail-pin.missing{background:#aaa!important;border-style:dashed}
    .rail-pin:hover,.marker:hover{outline:2px solid #7562a4;outline-offset:2px}
    .list{position:fixed;right:40px;top:20%;width:255px;max-height:63vh;overflow:auto;pointer-events:auto;
      background:#fffefaf7;border:1px solid #eae5da;border-radius:9px;box-shadow:0 8px 26px #0002;padding:6px}
    .list-header{display:flex;justify-content:space-between;align-items:center;padding:7px 7px 10px;font-weight:600}
    .list-header button{background:transparent;color:#777;margin:0 3px;font-size:16px}
    .entry{width:100%;background:transparent;padding:9px 7px;display:flex;align-items:flex-start;gap:8px;
      border-top:1px solid #ece9e0;color:#34312e;text-align:left}
    .entry:hover{background:#f7f2e8}.entry .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin-top:5px}
    .entry strong{display:block;font-weight:550;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .entry small{display:block;color:#8b8477;font-size:11px}
    .marker{position:fixed;z-index:4;width:19px;height:19px;pointer-events:auto;border-radius:50%;padding:0;
      box-shadow:0 2px 7px #0003;color:#755d24;font-size:11px;border:1px solid #fff9}
    .paper{--paper:#fff1b8;position:fixed;z-index:8;background:var(--paper);border:1px solid #00000010;
      border-radius:5px;box-shadow:0 5px 18px #0002;pointer-events:auto;min-width:180px;min-height:132px;overflow:hidden}
    .paper:focus-within{box-shadow:0 6px 24px #0003}.paper:hover{box-shadow:0 6px 21px #0003}
    .note-editor,.note-preview{display:block;width:100%;height:100%;border:0;outline:none!important;resize:none;
      background:transparent;color:#393329;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;
      padding:30px 13px 26px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
    .note-editor::placeholder{color:#8d8270aa}.note-editor{caret-color:#534529}
    .note-preview{cursor:text}.note-preview p{margin:0 0 .25em}.note-preview ul,.note-preview ol{margin:0 0 .25em;padding-left:22px}
    .note-preview li{padding:0}.note-preview strong{font-weight:700}.note-preview em{font-style:italic}
    .note-tools{position:absolute;top:4px;left:4px;right:4px;display:flex;align-items:center;justify-content:space-between;
      opacity:.12;transition:opacity .12s ease;pointer-events:none}
    .paper:hover .note-tools,.paper:focus-within .note-tools{opacity:1;pointer-events:auto}
    .tool-group{display:flex;gap:1px;align-items:center}.note-tools button,.note-actions button{padding:0;width:23px;height:23px;
      border-radius:5px;background:transparent;color:#625743;font-size:13px;display:inline-flex;justify-content:center;align-items:center}
    .note-tools button:hover,.note-actions button:hover{background:#00000013}
    .drag-handle{cursor:grab;touch-action:none;user-select:none}.drag-handle:active{cursor:grabbing}
    .note-actions{position:absolute;bottom:3px;left:9px;right:18px;display:flex;align-items:center;gap:2px;
      opacity:0;transition:opacity .12s ease;pointer-events:none}
    .paper:hover .note-actions,.paper:focus-within .note-actions{opacity:.82;pointer-events:auto}
    .note-actions button{width:21px;height:20px;font-size:12px}.note-actions .spacer{flex:1}
    .resize-handle{position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize;
      touch-action:none;opacity:.15;background:linear-gradient(135deg,transparent 55%,#736a5666 55%,#736a5666 60%,transparent 60%)}
    .paper:hover .resize-handle,.paper:focus-within .resize-handle{opacity:.75}
    .note-menu{position:absolute;right:5px;top:29px;width:190px;padding:7px;background:#fffcf4;border:1px solid #e2d9c4;
      border-radius:8px;box-shadow:0 7px 21px #0003;z-index:4}
    .colors{display:flex;gap:5px;padding:6px 4px 10px}.colors button{width:22px;height:22px;border-radius:50%;border:1px solid #0002;padding:0}
    .colors button[aria-pressed=true]{outline:2px solid #7567a1;outline-offset:2px}
    .menu-action{display:block;text-align:left;width:100%;padding:7px;border-radius:5px;background:transparent;color:#4b463b}
    .menu-action:hover{background:#eee8d8}.menu-action.danger{color:#9b4440}
    .save-indicator{position:absolute;bottom:7px;right:28px;font-size:11px;opacity:0;color:#625847;pointer-events:none}
    .paper[data-save=error] .save-indicator,.paper[data-save=conflict] .save-indicator{opacity:1;color:#9b4141}
    .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;pointer-events:auto;
      background:#34302c;color:#fff;border-radius:8px;padding:9px 12px;box-shadow:0 3px 14px #0003;
      display:flex;gap:12px;align-items:center;max-width:min(440px,92vw);font-size:12px}
    .toast button{background:transparent;color:#ffe1a0;font-weight:600;padding:4px;border-radius:4px}
  `;
}
