import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ShellInfo } from "@/types";
import type { Backend } from "./backend";

export function createTauriBackend(): Backend {
  const persistStore = new LazyStore("termo-config.json");

  return {
    async spawnPty({ id, shell, args, cwd, cols, rows, onData }) {
      const channel = new Channel<ArrayBuffer>();
      channel.onmessage = (msg) => {
        if (typeof msg === "string") onData(msg);
        else onData(new Uint8Array(msg));
      };
      await invoke("spawn_pty", {
        id,
        shell,
        args,
        cwd,
        cols,
        rows,
        onData: channel,
      });
    },

    writePty(id, data) {
      return invoke("write_pty", { id, data });
    },

    resizePty(id, cols, rows) {
      return invoke("resize_pty", { id, cols, rows });
    },

    killPty(id) {
      return invoke("kill_pty", { id });
    },

    onPtyExit(cb) {
      void listen<string>("pty-exit", (e) => cb(e.payload));
    },

    detectShells() {
      return invoke<ShellInfo[]>("detect_shells");
    },

    homeDir() {
      return invoke<string>("home_dir");
    },

    windowsBuild() {
      return invoke<number>("windows_build_number");
    },

    async loadPersisted<T>() {
      return persistStore.get<T>("state");
    },

    async persist(state) {
      await persistStore.set("state", state);
      await persistStore.save();
    },

    async saveDialog(opts) {
      return (await save(opts)) ?? null;
    },

    async openDialog(opts) {
      const path = await open({ multiple: false, ...opts });
      return typeof path === "string" ? path : null;
    },

    readTextFile(path) {
      return invoke<string>("read_text_file", { path });
    },

    writeTextFile(path, contents) {
      return invoke("write_text_file", { path, contents });
    },

    async initialOpenPath() {
      return null;
    },

    onOpenPath() {},
  };
}
