namespace JP {
  export const PAPER_STYLES = `
    :host{all:initial;font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#37342e}
    *,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important}
    button{font:inherit;border:0;cursor:pointer} button:focus-visible,[contenteditable]:focus-visible{outline:2px solid #7461ae;outline-offset:2px}
    .launcher{position:fixed;top:14px;right:42px;display:flex;gap:3px;align-items:center;padding:3px;
      background:#fffdf8f0;border:1px solid #e8e3d8;border-radius:20px;box-shadow:0 4px 16px #0002;pointer-events:auto}
    .launcher button{width:29px;height:29px;border-radius:50%;background:transparent;color:#5f5b51;font-size:17px}
    .launcher button:hover{background:#eee9df} .launcher button#jp-new{font-size:21px;line-height:26px}
    .bubble{position:fixed;z-index:20;pointer-events:auto;transform:translateY(-100%)}
    .bubble button{width:31px;height:31px;border-radius:50%;background:#fff8df;color:#7a612a;box-shadow:0 2px 12px #0003;
      border:1px solid #e7d59e;font-size:16px;line-height:30px;padding:0;text-align:center}
    .bubble button:hover{background:#ffe7a1;transform:scale(1.06)}
    .rail{position:fixed;right:7px;top:50%;transform:translateY(-50%);height:68vh;max-height:730px;
      min-height:220px;width:27px;border-radius:16px;background:#fffdf9d9;
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail.with-conversation{width:33px}
    .rail.native-nav{right:42px}
    .rail-head{position:absolute;top:5px;left:50%;transform:translateX(-50%);width:23px;height:23px;
      border-radius:50%;font-size:14px;background:#f0ece2;color:#615a4b;padding:0;display:grid;place-items:center}
    .rail-head:hover,.rail-loose:hover{background:#e7e1d5}
    .rail-track{position:absolute;top:33px;bottom:16px;left:2px;right:2px}
    .rail.with-conversation .rail-track{bottom:25px;left:2px;right:2px}
    .rail-loose{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);height:18px;min-width:20px;
      padding:0 3px;background:#efe9df;border-radius:10px;color:#6d6659;font-size:11px}
    .rail-turn{position:absolute;right:2px;width:14px;height:3px;min-height:2px;padding:0;
      background:#c3c7cc;border-radius:8px;transform:translateY(-50%);
      transition:top .17s ease,width .12s ease,background .12s ease;z-index:1}
    .rail-turn:hover,.rail-turn:focus-visible{width:20px;background:#818894;z-index:6}
    .rail-turn[aria-current="location"]{width:19px;background:#717883}
    .rail.with-conversation .rail-pin{left:2px;width:13px;height:7px;z-index:3;border-radius:9px}
    /* Dense lens lives beside the rail. The overview never jumps on hover. */
    .rail-track.focused .rail-pin,.rail-track.focused .rail-turn{transition:none}
    .rail-lens{position:fixed;width:min(204px,64vw);max-height:min(320px,68vh);overflow:auto;
      pointer-events:auto;z-index:35;padding:5px;background:#fffdf9f7;
      border:1px solid #e5ddd1;border-radius:10px;box-shadow:0 8px 25px #0003}
    .rail-lens button{width:100%;height:28px;display:flex;align-items:center;gap:8px;
      background:transparent;color:#555049;padding:3px 7px;border-radius:6px;text-align:left;
      white-space:nowrap;overflow:hidden;font-size:12px}
    .rail-lens button:hover,.rail-lens button:focus-visible{background:#f1ede5}
    .rail-lens-turn{font-weight:600;border-bottom:1px solid #ede9e1!important;
      border-radius:5px 5px 0 0!important;}
    .rail-lens-dot{flex:0 0 12px;height:8px;border-radius:5px;border:1px solid #0002}
    .rail-lens-dot.missing{border:1px dashed #716b66;opacity:.85}
    .rail-lens-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .rail-pin{position:absolute;left:5px;width:11px;height:10px;border:1px solid #0002;border-radius:50%;
      box-shadow:0 1px 4px #0002;transform:translateY(-50%);padding:0;
      transition:top .17s ease,width .1s ease;cursor:pointer}
    .rail-pin.missing{border:1px dashed #716b66;opacity:.85}
    .rail-pin:hover,.rail-pin:focus-visible,.marker:hover{outline:2px solid #7562a4;outline-offset:2px;z-index:8}
    .turn-preview{position:fixed;max-width:252px;min-width:140px;z-index:40;pointer-events:none;
      border-radius:8px;padding:9px 11px;background:#fffefcf7;border:1px solid #e6e3dc;
      box-shadow:0 4px 18px #0002;font-size:12px;color:#37342e;overflow-wrap:anywhere}
    .turn-preview small{display:block;font-size:10px;color:#8d877d;margin-bottom:3px}
    .turn-preview span{display:block;line-height:1.5;max-height:6em;overflow:hidden;white-space:pre-line}
    .list{position:fixed;right:43px;top:19%;width:min(298px,78vw);max-height:69vh;overflow:auto;pointer-events:auto;
      background:#fffefaf7;border:1px solid #eae5da;border-radius:9px;box-shadow:0 8px 26px #0002;padding:6px}
    .list-header{display:flex;justify-content:space-between;align-items:center;padding:7px 7px 10px;font-weight:600}
    .list-header button{background:transparent;color:#777;margin:0 3px;font-size:16px}
    .list-caption{padding:3px 7px 8px;font-size:10px;color:#99938b}
    .entry{width:100%;background:transparent;padding:7px 7px;display:flex;align-items:center;gap:8px;
      border-top:1px solid #ece9e0;color:#34312e;text-align:left}
    .entry:hover{background:#f7f2e8}
    .entry .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;margin:0 1px}
    .list-section{font-size:11px;color:#827d74;letter-spacing:.025em;padding:8px 8px 3px}
    .turn-entry{gap:8px;font-size:12px;font-weight:520}
    .turn-entry span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .turn-order{color:#8e928f;flex:0 0 21px;font-variant-numeric:tabular-nums;text-align:right}
    .note-entry{min-height:29px;border-top:0;font-size:12px}
    .note-entry.nested{padding:5px 7px 5px 40px}
    .note-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1}
    .entry-pin{font-size:12px;color:#9a8551;flex:none}
    .entry-pin.unresolved{color:#aaa;text-decoration:underline dotted}
    @media (prefers-reduced-motion:reduce){.rail-turn,.rail-pin{transition:none!important}}
    .marker{position:fixed;z-index:4;width:19px;height:19px;pointer-events:auto;border-radius:50%;padding:0;
      box-shadow:0 2px 7px #0003;color:#755d24;font-size:11px;border:1px solid #fff9}
    .rail-note-cluster{width:16px!important;height:16px!important;left:-2px!important;
      font-size:10px;font-weight:650;color:#413626;text-align:center;line-height:14px}
    .note-popover{position:fixed;right:47px;width:min(235px,75vw);max-height:48vh;overflow-y:auto;
      padding:6px;pointer-events:auto;background:#fffefa;border-radius:9px;border:1px solid #e7dfcf;
      box-shadow:0 7px 22px #0002;z-index:40}
    .cluster-title{font-size:11px;padding:7px 9px;color:#89816f}
    .cluster-item{display:flex;gap:8px;align-items:center;width:100%;padding:9px 7px;border-radius:5px;
      background:transparent;text-align:left;font-size:12px;color:#37332c}
    .cluster-item:hover{background:#f4f1e9}
    .cluster-item span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cluster-item .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%}
    .paper{--paper:#fff1b8;--jp-font-size:14px;position:fixed;z-index:8;display:flex;flex-direction:column;
      background:var(--paper);border:1px solid #0000000d;border-radius:4px;box-shadow:0 5px 18px #0002;
      pointer-events:auto;min-width:180px;min-height:132px;overflow:hidden}
    .paper:focus-within{box-shadow:0 6px 24px #0003}.paper:hover{box-shadow:0 6px 21px #0003}
    .paper-head,.paper-foot{width:100%;display:flex;align-items:center;flex:0 0 28px;
      padding:2px 5px;user-select:none;border-color:transparent;transition:background .13s ease}
    .paper-head{justify-content:space-between;cursor:grab;touch-action:none}
    .paper-head:active{cursor:grabbing}
    .paper-foot{justify-content:flex-start;gap:2px;flex:0 0 27px}
    .paper:hover .paper-head,.paper:focus-within .paper-head{background:#00000006;border-bottom:1px solid #0000000b}
    .paper:hover .paper-foot,.paper:focus-within .paper-foot{background:#00000006;border-top:1px solid #0000000b}
    .paper-grab{flex:1;min-width:8px;pointer-events:none}
    .paper-pin{flex:0 0 22px;display:grid;place-items:center;color:#947235!important;
      opacity:.85!important;pointer-events:auto!important;cursor:pointer}
    .paper-pin[hidden]{display:none!important}
    .paper-pin:hover{background:#00000012!important;color:#60491c!important}
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
    .note-menu{position:absolute;right:5px;top:29px;width:183px;padding:8px;background:#fffcf4;
      border:1px solid #e2d9c4;border-radius:8px;box-shadow:0 7px 21px #0003;z-index:8}
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
    .toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;pointer-events:auto;
      background:#34302c;color:#fff;border-radius:8px;padding:9px 12px;box-shadow:0 3px 14px #0003;
      display:flex;gap:12px;align-items:center;max-width:min(440px,92vw);font-size:12px}
    .toast button{background:transparent;color:#ffe1a0;font-weight:600;padding:4px;border-radius:4px}
  `;
}
