import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getBackend } from "@/lib/backend";
import type { PaneSpec } from "@/types";

/**
 * xterm 實例與 DOM 容器活在 React 生命週期之外。
 * React 重新掛載（分割、調整版面）時只是把 container 重新 append，
 * buffer 與 PTY session 都保留；只有 closePane 才真正銷毀。
 */
interface TermHandle {
  term: Terminal;
  fit: FitAddon;
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

export function attachTerminal(id: string, spec: PaneSpec, host: HTMLElement) {
  ensureExitListener();
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
      scrollback: 5000,
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3f3f46",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.onData((data) => {
      void getBackend().then((b) => b.writePty(id, data));
    });
    term.attachCustomKeyEventHandler((ev) => handleKey(id, ev));
    container.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      copyOrPaste(id);
    });
    h = { term, fit, container, opened: false, spawned: false, cols: 0, rows: 0 };
    handles.set(id, h);
  }

  if (h.container.parentElement !== host) {
    host.appendChild(h.container);
  }
  if (!h.opened) {
    h.term.open(h.container);
    h.opened = true;
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

export function disposeTerminal(id: string) {
  const h = handles.get(id);
  if (!h) return;
  handles.delete(id);
  void getBackend().then((b) => b.killPty(id));
  h.term.dispose();
  h.container.remove();
}
