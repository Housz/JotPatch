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
    .rail{position:fixed;right:7px;top:20%;height:60%;width:26px;border-radius:16px;background:#fffdf9dc;
      border:1px solid #e7e2d7;box-shadow:0 2px 10px #0001;pointer-events:auto}
    .rail-head{position:absolute;top:3px;left:2px;width:20px;height:20px;border-radius:50%;font-size:11px;
      background:#f0ece2;color:#615a4b;padding:0}
    .rail-track{position:absolute;top:28px;bottom:12px;left:3px;right:3px}
    .rail.with-conversation{width:32px}
    .rail.native-nav{right:42px}
    .rail.with-conversation .rail-track{left:3px;right:3px}
    .rail.with-conversation .rail-pin{left:0;width:9px;height:9px;z-index:2}
    .rail-turn{position:absolute;right:0;width:13px;height:5px;min-height:2px;padding:0;
      background:#c3c7cc;border-radius:8px;transform:translateY(-50%);transition:width .11s ease,background .11s ease}
    .rail-turn:hover,.rail-turn:focus-visible{width:19px;background:#818894}
    .rail-turn[aria-current="location"]{width:19px;background:#717883}
    .turn-preview{position:fixed;max-width:238px;min-width:140px;z-index:40;pointer-events:none;
      border-radius:8px;padding:9px 11px;background:#fffefcf7;border:1px solid #e6e3dc;
      box-shadow:0 4px 18px #0002;font-size:12px;color:#37342e;overflow-wrap:anywhere}
    .turn-preview small{display:block;font-size:10px;color:#8d877d;margin-bottom:3px}
    .turn-preview span{display:block;line-height:1.5;max-height:5.9em;overflow:hidden}
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
    .list-section{font-size:11px;color:#827d74;letter-spacing:.025em;padding:8px 8px 3px}
    .turn-entry{align-items:center;gap:8px;font-size:12px}
    .turn-entry span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .turn-order{color:#8e928f;flex:0 0 21px;font-variant-numeric:tabular-nums;text-align:right}
    .entry strong{display:block;font-weight:550;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .entry small{display:block;color:#8b8477;font-size:11px}
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
    .scan-history{display:block;width:calc(100% - 12px);margin:4px 6px 7px;padding:7px;
      font-size:11px;border-radius:6px;color:#635c4d;background:#f1ece3}
    .scan-history:hover{background:#eae2d3}
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
    .paper-grab{width:20px;font-size:15px;line-height:1;text-align:center;color:#6d625433;pointer-events:none}
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
