import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchResultChangeEvent } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { getBackend } from "@/lib/backend";
import type { PaneSpec } from "@/types";

/**
 * xterm 實例與 DOM 容器活在 React 之外。
 * React 重新掛載（分割、調整版面）時只是把 container 重新 append，
 * buffer 與 PTY session 都保留；只有 closePane 才真正銷毀。
 */
interface TermHandle {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  container: HTMLDivElement;
  opened: boolean;
  spawned: boolean;
  cols: number;
  rows: number;
}

const handles = new Map<string, TermHandle>();

let exitListenerStarted = false;
function ensureExitListener() {
  if (exitListenerStarted) return;
  exitListenerStarted = true;
  void getBackend().then((backend) => {
    backend.onPtyExit((id) => {
      if (!handles.has(id)) return; // 已由 closePane 主動清掉
      void import("@/store/app").then(({ useAppStore }) => {
        useAppStore.getState().closePane(id);
      });
    });
  });
}

/**
 * xterm 對 ConPTY 的軟換行回報有專屬處理（windowsPty 選項），沒設的話窄視窗打超過寬度的指令
 * 換行資訊會遺失，resize 放大也救不回來、對照 VS Code 內建終端機才不會有這個問題。
 * buildNumber >= 21376 xterm 才信任 ConPTY 正確回報換行，用真實 build number 而非硬編，
 * 避免舊版 Windows（換行仍靠回退法回報）誤判成新版行為。
 */
let windowsPty: { backend: "conpty"; buildNumber: number } | undefined;
let windowsPtyStarted = false;
function ensureWindowsPty() {
  if (windowsPtyStarted) return;
  windowsPtyStarted = true;
  void getBackend()
    .then((b) => b.windowsBuild())
    .then((buildNumber) => {
      windowsPty = { backend: "conpty", buildNumber };
      for (const h of handles.values()) {
        h.term.options.windowsPty = windowsPty;
      }
    });
}

/** 有選取文字就複製，否則貼上剪貼簿內容——Ctrl+C/V 與右鍵共用同一套邏輯 */
function copyOrPaste(id: string) {
  const term = handles.get(id)?.term;
  if (!term) return;
  if (term.hasSelection()) {
    void navigator.clipboard.writeText(term.getSelection());
    term.clearSelection();
  } else {
    void navigator.clipboard.readText().then((text) => {
      if (text) term.paste(text);
    });
  }
}

function handleKey(id: string, ev: KeyboardEvent): boolean {
  if (ev.type !== "keydown") return true;
  const run = (fn: (s: import("@/store/app").AppState) => void) => {
    void import("@/store/app").then(({ useAppStore }) => fn(useAppStore.getState()));
    return false;
  };
  if (ev.altKey && ev.shiftKey && ev.code === "KeyD") {
    return run((s) => s.splitPane(id, "horizontal"));
  }
  if (ev.altKey && ev.shiftKey && ev.code === "KeyS") {
    return run((s) => s.splitPane(id, "vertical"));
  }
  if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyW") {
    return run((s) => s.closePane(id));
  }
  if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyM") {
    return run((s) => s.toggleMaximize(id));
  }
  if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === "KeyF") {
    ev.preventDefault();
    return run((s) => s.openSearch(id));
  }
  if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === "KeyC") {
    const term = handles.get(id)?.term;
    if (term?.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    return true;
  }
  if (ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === "KeyV") {
    // 一定要 preventDefault：否則瀏覽器仍會對 xterm 內部的隱藏 textarea 觸發原生
    // paste 事件，xterm 自己會再送一次進 pty，造成貼上內容重複兩次
    ev.preventDefault();
    const term = handles.get(id)?.term;
    void navigator.clipboard.readText().then((text) => {
      if (text) term?.paste(text);
    });
    return false;
  }
  return true;
}

let currentFontFamily: string | undefined;
let currentFontSize: number | undefined;

export function applyFontFamily(fontFamily: string) {
  currentFontFamily = fontFamily;
  for (const h of handles.values()) {
    h.term.options.fontFamily = fontFamily;
    if (h.opened) h.fit.fit();
  }
}

export function applyFontSize(fontSize: number) {
  currentFontSize = fontSize;
  for (const h of handles.values()) {
    h.term.options.fontSize = fontSize;
    if (h.opened) h.fit.fit();
  }
}

const DEFAULT_THEME: ITheme = {
  background: "#09090b",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  selectionBackground: "#3f3f46",
};
const DEFAULT_SCROLLBACK = 5000;

let currentTheme: ITheme = DEFAULT_THEME;
let currentScrollback = DEFAULT_SCROLLBACK;

export function applyTheme(theme: ITheme) {
  currentTheme = theme;
  for (const h of handles.values()) {
    h.term.options.theme = theme;
  }
}

export function applyScrollback(scrollback: number) {
  currentScrollback = scrollback;
  for (const h of handles.values()) {
    h.term.options.scrollback = scrollback;
  }
}

/** 開啟時就把輸入廣播給所有已啟動 pty，用來對多台機器同時打同一組指令 */
let broadcastEnabled = false;

export function setBroadcastMode(enabled: boolean) {
  broadcastEnabled = enabled;
}

export function attachTerminal(id: string, spec: PaneSpec, host: HTMLElement) {
  ensureExitListener();
  ensureWindowsPty();
  let h = handles.get(id);
  if (!h) {
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    const term = new Terminal({
      fontFamily:
        currentFontFamily ??
        '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: currentFontSize ?? 14,
      cursorBlink: true,
      scrollback: currentScrollback,
      windowsPty,
      theme: currentTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.onData((data) => {
      void getBackend().then((b) => {
        if (!broadcastEnabled) {
          void b.writePty(id, data);
          return;
        }
        for (const [otherId, other] of handles) {
          if (other.spawned) void b.writePty(otherId, data);
        }
      });
    });
    term.attachCustomKeyEventHandler((ev) => handleKey(id, ev));
    container.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      copyOrPaste(id);
    });
    h = { term, fit, search, container, opened: false, spawned: false, cols: 0, rows: 0 };
    handles.set(id, h);
  }

  if (h.container.parentElement !== host) {
    host.appendChild(h.container);
  }
  if (!h.opened) {
    h.term.open(h.container);
    h.opened = true;
    // WebGL renderer 需要在 open() 之後才能取得 canvas context；不支援的環境（例如
    // 部分虛擬機/遠端桌面）建構或掛載時會丟例外，接住後 xterm 自動退回內建 canvas renderer
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      h.term.loadAddon(webgl);
    } catch {
      /* 不支援 WebGL，維持預設 renderer */
    }
  }
  fitTerminal(id);

  if (!h.spawned) {
    h.spawned = true;
    const handle = h;
    handle.cols = handle.term.cols;
    handle.rows = handle.term.rows;
    void getBackend()
      .then((b) =>
        b.spawnPty({
          id,
          shell: spec.shellPath,
          args: spec.args,
          cwd: spec.cwd || null,
          cols: handle.term.cols || 80,
          rows: handle.term.rows || 24,
          onData: (data) => handle.term.write(data),
        }),
      )
      .catch((err) => {
        handle.term.write(`\r\n\x1b[31m無法啟動 shell：${err}\x1b[0m\r\n`);
      });
  }
}

export function detachTerminal(id: string, host: HTMLElement) {
  const h = handles.get(id);
  if (h && h.container.parentElement === host) {
    host.removeChild(h.container);
  }
}

export function fitTerminal(id: string) {
  const h = handles.get(id);
  if (!h || !h.opened || !h.container.isConnected) return;
  if (h.container.clientWidth === 0 || h.container.clientHeight === 0) return;
  h.fit.fit();
  const { cols, rows } = h.term;
  if (h.spawned && cols > 0 && rows > 0 && (cols !== h.cols || rows !== h.rows)) {
    h.cols = cols;
    h.rows = rows;
    void getBackend().then((b) => b.resizePty(id, cols, rows));
  }
}

export function focusTerminal(id: string) {
  handles.get(id)?.term.focus();
}

const SEARCH_DECORATIONS = {
  matchBackground: "#3f3f46",
  matchBorder: "#52525b",
  matchOverviewRuler: "#52525b",
  activeMatchBackground: "#854d0e",
  activeMatchBorder: "#f59e0b",
  activeMatchColorOverviewRuler: "#f59e0b",
};

export function searchNext(id: string, term: string): boolean {
  if (!term) return false;
  return (
    handles
      .get(id)
      ?.search.findNext(term, { incremental: true, decorations: SEARCH_DECORATIONS }) ?? false
  );
}

export function searchPrevious(id: string, term: string): boolean {
  if (!term) return false;
  return (
    handles.get(id)?.search.findPrevious(term, { decorations: SEARCH_DECORATIONS }) ?? false
  );
}

export function clearSearch(id: string) {
  handles.get(id)?.search.clearDecorations();
}

/** 訂閱搜尋結果數量變化（顯示「3/12」用），回傳取消訂閱函式 */
export function onSearchResults(
  id: string,
  cb: (e: ISearchResultChangeEvent) => void,
): () => void {
  const h = handles.get(id);
  if (!h) return () => {};
  const disposable = h.search.onDidChangeResults(cb);
  return () => disposable.dispose();
}

/** 把文字直接送進某個 pane 的 pty，用來執行已儲存的常用指令 */
export function sendToTerminal(id: string, data: string) {
  void getBackend().then((b) => b.writePty(id, data));
}

export function disposeTerminal(id: string) {
  const h = handles.get(id);
  if (!h) return;
  handles.delete(id);
  void getBackend().then((b) => b.killPty(id));
  h.term.dispose();
  h.container.remove();
}
