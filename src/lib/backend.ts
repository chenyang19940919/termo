import type { ShellInfo } from "@/types";

/**
 * 桌面外殼抽象層：同一份前端同時支援 Tauri 與 Electron。
 * 執行時偵測環境，動態載入對應實作；新增能力時先改這個介面。
 */

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface SpawnPtyOptions {
  id: string;
  shell: string;
  args: string[];
  cwd: string | null;
  cols: number;
  rows: number;
  onData(data: string | Uint8Array): void;
}

export interface Backend {
  spawnPty(opts: SpawnPtyOptions): Promise<void>;
  writePty(id: string, data: string): Promise<void>;
  resizePty(id: string, cols: number, rows: number): Promise<void>;
  killPty(id: string): Promise<void>;
  /** 註冊 PTY 結束事件（shell 自行 exit 時觸發），整個 app 生命週期只需註冊一次 */
  onPtyExit(cb: (id: string) => void): void;
  detectShells(): Promise<ShellInfo[]>;
  homeDir(): Promise<string>;
  /** 讀取持久化的 app 狀態（設定檔的 "state" 鍵），檔案不存在或損毀時回 undefined */
  loadPersisted<T>(): Promise<T | undefined>;
  persist(state: unknown): Promise<void>;
  saveDialog(opts: {
    defaultPath?: string;
    filters?: DialogFilter[];
  }): Promise<string | null>;
  openDialog(opts: { filters?: DialogFilter[] }): Promise<string | null>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isElectron =
  typeof window !== "undefined" && "termoBridge" in window;

let backendPromise: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = isTauri
      ? import("./backend-tauri").then((m) => m.createTauriBackend())
      : import("./backend-electron").then((m) => m.createElectronBackend());
  }
  return backendPromise;
}
