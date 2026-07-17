import type { ShellInfo } from "@/types";
import type { Backend, DialogFilter, SpawnPtyOptions } from "./backend";

/** preload.cjs 用 contextBridge 掛在 window 上的橋接介面 */
interface TermoBridge {
  spawnPty(opts: {
    id: string;
    shell: string;
    args: string[];
    cwd: string | null;
    cols: number;
    rows: number;
  }): Promise<void>;
  writePty(id: string, data: string): void;
  resizePty(id: string, cols: number, rows: number): Promise<void>;
  killPty(id: string): Promise<void>;
  onPtyData(cb: (id: string, data: string | Uint8Array) => void): void;
  onPtyExit(cb: (id: string) => void): void;
  detectShells(): Promise<ShellInfo[]>;
  homeDir(): Promise<string>;
  windowsBuild(): Promise<number>;
  loadConfig(): Promise<unknown>;
  saveConfig(state: unknown): Promise<void>;
  saveDialog(opts: {
    defaultPath?: string;
    filters?: DialogFilter[];
  }): Promise<string | null>;
  openDialog(opts: { filters?: DialogFilter[] }): Promise<string | null>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

declare global {
  interface Window {
    termoBridge?: TermoBridge;
  }
}

export function createElectronBackend(): Backend {
  const bridge = window.termoBridge;
  if (!bridge) {
    throw new Error("termoBridge 不存在——不是在 Electron 環境或 preload 沒載入");
  }

  // pty:data 只有一條 IPC 通道，這裡按 pane id 分流給各自的 xterm
  const dataHandlers = new Map<string, SpawnPtyOptions["onData"]>();
  bridge.onPtyData((id, data) => {
    dataHandlers.get(id)?.(data);
  });

  return {
    async spawnPty({ onData, ...opts }) {
      dataHandlers.set(opts.id, onData);
      try {
        await bridge.spawnPty(opts);
      } catch (err) {
        dataHandlers.delete(opts.id);
        throw err;
      }
    },

    async writePty(id, data) {
      bridge.writePty(id, data);
    },

    resizePty(id, cols, rows) {
      return bridge.resizePty(id, cols, rows);
    },

    async killPty(id) {
      dataHandlers.delete(id);
      await bridge.killPty(id);
    },

    onPtyExit(cb) {
      bridge.onPtyExit((id) => {
        dataHandlers.delete(id);
        cb(id);
      });
    },

    detectShells() {
      return bridge.detectShells();
    },

    homeDir() {
      return bridge.homeDir();
    },

    windowsBuild() {
      return bridge.windowsBuild();
    },

    async loadPersisted<T>() {
      return (await bridge.loadConfig()) as T | undefined;
    },

    persist(state) {
      return bridge.saveConfig(state);
    },

    saveDialog(opts) {
      return bridge.saveDialog(opts);
    },

    openDialog(opts) {
      return bridge.openDialog(opts);
    },

    readTextFile(path) {
      return bridge.readTextFile(path);
    },

    writeTextFile(path, contents) {
      return bridge.writeTextFile(path, contents);
    },
  };
}
