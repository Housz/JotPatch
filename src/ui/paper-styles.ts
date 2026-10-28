namespace JP {
  export const PAPER_STYLES = `
    :host{all:initial;font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#37342e;
      --jp-paper-amount:100%;--jp-dock-surface:#fffdf9d9;--jp-list-surface:#fffefaf7}
    :host([hidden]){display:none!important}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    button{font:inherit;border:0;cursor:pointer} button:focus-visible,[contenteditable]:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .bubble{position:fixed;z-index:1030;pointer-events:auto;transform:translateY(-100%)}
    .bubble button{width:31px;height:31px;border-radius:50%;background:#fff8df;color:#7a612a;box-shadow:0 2px 12px #0003;
      border:1px solid #e7d59e;font-size:16px;line-height:30px;padding:0;text-align:center}
    .bubble button:hover{background:#ffe7a1;transform:scale(1.06)}
    /* One stable surface for creation, navigation and settings. On an empty
       page it collapses to two controls instead of showing an empty track. */
    .rail{position:fixed;z-index:1000;right:7px;top:50%;transform:translateY(-50%);height:68vh;max-height:730px;
      min-height:230px;width:38px;border-radius:19px;background:var(--jp-dock-surface);
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail.native-nav{right:42px}
    .rail.compact{height:114px;min-height:0;max-height:none}
    .rail.compact.no-notes{height:76px}
    .rail.compact.has-loose{height:144px}
    .rail-new,.rail-head,.rail-settings{position:absolute;left:50%;transform:translateX(-50%);
      width:28px;height:28px;padding:0;border-radius:50%;display:grid;place-items:center;
      background:transparent;color:#615a4b;font-size:16px;line-height:1}
    .rail-new{top:5px;font-size:22px;font-weight:350}
    .rail-head{top:40px;font-size:16px}
    .rail-settings{bottom:5px;font-size:17px}
    .rail-new:hover,.rail-head:hover,.rail-settings:hover,.rail-loose:hover{background:#e7e1d5}
    .rail-new:focus-visible,.rail-head:focus-visible,.rail-settings:focus-visible{
      outline:2px solid #7461ae;outline-offset:2px}
    .rail-track{position:absolute;top:76px;bottom:42px;left:2px;right:2px}
    .rail.has-loose .rail-track{bottom:67px}
    .rail.compact .rail-track{display:none}
    .rail.compact .rail-loose:not([hidden]){display:grid;place-items:center}
    .rail-loose{position:absolute;bottom:41px;left:50%;transform:translateX(-50%);height:22px;min-width:26px;
      padding:0 4px;background:#efe9df;border-radius:11px;color:#6d6659;font-size:11px}
    .rail-loose[aria-pressed="true"]{background:#ded8ca;color:#433e37}
    .rail-turn{position:absolute;right:2px;width:14px;height:3px;min-height:2px;padding:0;
      background:#c3c7cc;border-radius:8px;transform:translateY(-50%);
      transition:width .12s ease,background .12s ease;z-index:1}
    .rail-turn:hover,.rail-turn:focus-visible{width:20px;background:#818894;z-index:6}
    .rail-turn[aria-current="location"]{width:19px;background:#717883}
    .rail.with-conversation .rail-pin{left:2px;width:13px;height:7px;z-index:3;border-radius:9px}
    /* Direct one-click navigation at every density. No auxiliary picker. */
    .rail-track .rail-pin,.rail-track .rail-turn{transition:width .12s ease,background .12s ease}
    .rail-pin{position:absolute;left:5px;width:11px;height:10px;border:1px solid #0002;border-radius:50%;
      box-shadow:0 1px 4px #0002;transform:translateY(-50%);padding:0;
      transition:width .1s ease;cursor:pointer}
    .rail-pin.missing{border:1px dashed #716b66;opacity:.85}
    .rail-pin:focus-visible,.rail-turn:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .rail-pin:hover,.rail-pin:focus-visible,.marker:hover{outline:2px solid #7562a4;outline-offset:2px;z-index:8}
    .turn-preview{position:fixed;max-width:252px;min-width:140px;z-index:1020;pointer-events:none;
      border-radius:8px;padding:9px 11px;background:#fffefcf7;border:1px solid #e6e3dc;
      box-shadow:0 4px 18px #0002;font-size:12px;line-height:1.5;color:#37342e;
      overflow-wrap:anywhere;white-space:pre-line;max-height:8.4em;overflow:hidden}

    .list{position:fixed;z-index:1010;right:53px;top:19%;width:min(298px,calc(100vw - 108px));max-height:69vh;
      overflow:auto;pointer-events:auto;background:var(--jp-list-surface);border:1px solid #eae5da;
      border-radius:9px;box-shadow:0 8px 26px #0002;padding:4px 5px}
    .list.native-nav{right:88px}
    .list.compact{top:50%;transform:translateY(-50%);max-height:65vh}
    .entry{width:100%;background:transparent;padding:7px 7px;display:flex;align-items:center;gap:8px;
      border-top:1px solid #ece9e0;color:#34312e;text-align:left}
    .entry:hover{background:#f7f2e8}
    .entry .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin:0 1px}
    .list-section{font-size:11px;color:#827d74;letter-spacing:.025em;padding:8px 8px 3px}
    .entry:first-child{border-top:0}
    .turn-entry{gap:8px;font-size:12px;font-weight:520}
    .turn-entry span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .turn-order{color:#8e928f;flex:0 0 21px;font-variant-numeric:tabular-nums;text-align:right}
    .note-entry{min-height:29px;border-top:0;font-size:12px}
    .note-entry.nested{padding:5px 7px 5px 40px}
    .note-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1}
    .entry-pin{font-size:12px;color:#9a8551;flex:none}
    .entry-pin.unresolved{color:#aaa;text-decoration:underline dotted}
    @media (prefers-reduced-motion:reduce){.rail-turn,.rail-pin{transition:none!important}}
    @media (max-height:420px){.rail:not(.compact){height:86vh;min-height:0}}
    .marker{position:fixed;z-index:4;width:19px;height:19px;pointer-events:auto;border-radius:50%;padding:0;
      box-shadow:0 2px 7px #0003;color:#755d24;font-size:11px;border:1px solid #fff9}
    .paper{--paper:#fff1b8;--jp-font-size:14px;position:fixed;z-index:8;display:flex;flex-direction:column;
      background:color-mix(in srgb,var(--paper) var(--jp-paper-amount),transparent);
      border:1px solid #0000000d;border-radius:4px;box-shadow:0 5px 18px #0002;
      pointer-events:auto;min-width:180px;min-height:132px;overflow:visible}
    .paper:focus-within{box-shadow:0 6px 24px #0003;background:var(--paper)}
    .paper:hover{box-shadow:0 6px 21px #0003}
    .paper-head,.paper-foot{width:100%;display:flex;align-items:center;flex:0 0 28px;
      padding:2px 5px;user-select:none;border-color:transparent;transition:background .13s ease}
    .paper-head{justify-content:space-between;cursor:grab;touch-action:none}
    .paper-head:active{cursor:grabbing}
    .paper-foot{justify-content:flex-start;gap:2px;flex:0 0 27px}
    .paper:hover .paper-head,.paper:focus-within .paper-head{background:#00000006;border-bottom:1px solid #0000000b}
    .paper:hover .paper-foot,.paper:focus-within .paper-foot{background:#00000006;border-top:1px solid #0000000b}
    .paper-grab{flex:1;min-width:8px;pointer-events:none}
    /* Request the monochrome text presentation of 📌 (U+FE0E); do not
       inherit the platform's colored emoji artwork on different papers. */
    .paper-head button.paper-pin{flex:0 0 22px;display:grid;place-items:center;
      color:#746f69;opacity:.6;pointer-events:auto;cursor:pointer}
    .paper-pin-symbol{font-family:'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',sans-serif;
      font-variant-emoji:text;font-size:13px;line-height:1;filter:grayscale(1)}
    .paper-pin[hidden]{display:none!important}
    .paper-head button.paper-pin:hover{background:#0000000c;color:#514c46;opacity:.88}
    .paper-head-actions{display:flex;gap:1px;opacity:0;pointer-events:auto;transition:opacity .14s ease}
    .paper-foot>button,.paper-foot>.save-indicator{opacity:0;pointer-events:auto;transition:opacity .14s ease}
    .paper:hover .paper-head-actions,.paper:focus-within .paper-head-actions,
    .paper:hover .paper-foot>button,.paper:focus-within .paper-foot>button,
    .paper[data-save=conflict] .save-indicator,.paper[data-save=error] .save-indicator{
      opacity:.9;pointer-events:auto}
    .paper-head button,.paper-foot button{padding:0;width:25px;height:22px;border-radius:4px;background:transparent;
      color:#625743;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
    .paper-head button:hover,.paper-foot button:hover{background:#00000014}
    .paper-foot-spacer{flex:1}
    .note-editor{display:block;min-height:0;flex:1;width:100%;border:0;outline:none!important;
      background:transparent;color:#393329;position:relative;font:var(--jp-font-size)/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;
      padding:7px 12px 8px;overflow-y:auto;overflow-x:hidden;white-space:pre-wrap;overflow-wrap:anywhere;
      caret-color:#534529;user-select:text}
    .note-editor[data-empty="true"]::before{content:attr(data-placeholder);position:absolute;top:7px;left:12px;
      pointer-events:none;color:#8c806c86}
    .note-editor p,.note-editor div{margin:0;min-height:1.5em}
    .note-editor ul,.note-editor ol{margin:0 0 3px;padding-left:21px}
    .note-editor li{margin:0;min-height:1.5em}
    .note-editor b,.note-editor strong{font-weight:700}.note-editor i,.note-editor em{font-style:italic}
    .resize-handle{position:absolute;bottom:0;right:0;width:15px;height:15px;cursor:nwse-resize;
      touch-action:none;opacity:.12;background:linear-gradient(135deg,transparent 54%,#736a5666 55%,#736a5666 61%,transparent 62%)}
    .paper:hover .resize-handle,.paper:focus-within .resize-handle{opacity:.75}
    .note-menu{position:absolute;right:5px;top:29px;width:183px;max-height:calc(100vh - 20px);
      overflow-y:auto;padding:8px;background:#fffcf4;border:1px solid #e2d9c4;
      border-radius:8px;box-shadow:0 7px 21px #0003;z-index:8}
    .note-mode{color:#847a65;font-size:11px;padding:4px 5px 8px;margin-bottom:4px;
      border-bottom:1px solid #ece4d6}
    .colors{display:flex;gap:5px;padding:6px 4px 9px}.colors button{width:21px;height:21px;border-radius:50%;border:1px solid #0002;padding:0}
    .colors button[aria-pressed=true]{outline:2px solid #7567a1;outline-offset:2px}
    .font-label{font-size:11px;color:#857b68;margin:4px 4px 7px}
    .font-choices{display:flex;gap:4px;margin:0 3px 9px}
    .font-size{flex:1;background:transparent;border:1px solid #ded6c7;border-radius:5px;padding:5px;color:#595044}
    .font-size[aria-pressed=true]{background:#e6decf;border-color:#c8b9a2}
    .menu-action{display:block;text-align:left;width:100%;padding:7px;border-radius:5px;background:transparent;color:#4b463b}
    .menu-action:hover{background:#eee8d8}.menu-action.danger{color:#9b4440}
    .save-indicator{font-size:10px;color:#9b4141;pointer-events:none}
    .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1040;pointer-events:auto;
      background:#34302c;color:#fff;border-radius:8px;padding:9px 12px;box-shadow:0 3px 14px #0003;
      display:flex;gap:12px;align-items:center;max-width:min(440px,92vw);font-size:12px}
    .toast button{background:transparent;color:#ffe1a0;font-weight:600;padding:4px;border-radius:4px}
  `;
}
