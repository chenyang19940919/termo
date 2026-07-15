import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  Direction,
  Folder,
  LayoutNode,
  PaneNode,
  PaneSpec,
  Profile,
  ShellInfo,
} from "@/types";
import {
  collectPanes,
  genId,
  removePane,
  setSplitSizes,
  splitPane,
} from "@/lib/layout";
import { disposeTerminal } from "@/lib/terminals";

const persistStore = new LazyStore("termo-config.json");

interface PersistedState {
  profiles: Profile[];
  folders?: Folder[];
  layout: LayoutNode | null;
}

interface ProfileExport {
  app: "termo";
  version: number;
  folders: Folder[];
  profiles: Profile[];
}

/** 舊版設定檔可能缺少後來新增的欄位，載入時補齊 */
function normalizeProfile(p: Partial<Profile>): Profile {
  return {
    id: p.id ?? genId(),
    name: p.name ?? "未命名",
    shellName: p.shellName ?? "",
    shellPath: p.shellPath ?? "",
    args: Array.isArray(p.args) ? p.args : [],
    cwd: p.cwd ?? "",
    color: p.color ?? null,
    folderId: p.folderId ?? null,
  };
}

export interface AppState {
  ready: boolean;
  shells: ShellInfo[];
  homeDir: string;
  profiles: Profile[];
  folders: Folder[];
  layout: LayoutNode | null;
  focusedPaneId: string | null;

  init(): Promise<void>;
  addProfile(p: Omit<Profile, "id">): void;
  updateProfile(p: Profile): void;
  removeProfile(id: string): void;
  moveProfile(
    id: string,
    folderId: string | null,
    anchorId?: string | null,
    position?: "before" | "after",
  ): void;
  addFolder(name: string, parentId: string | null): void;
  moveFolder(
    id: string,
    parentId: string | null,
    anchorId?: string | null,
    position?: "before" | "after",
  ): void;
  renameFolder(id: string, name: string): void;
  removeFolder(id: string): void;
  toggleFolder(id: string): void;
  exportProfiles(): Promise<boolean>;
  importProfiles(): Promise<number>;
  openPane(spec: PaneSpec): void;
  openDefaultPane(): void;
  splitPane(paneId: string, direction: Direction): void;
  closePane(paneId: string): void;
  setFocused(paneId: string): void;
  setSizes(splitId: string, sizes: number[]): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { profiles, folders, layout } = useAppStore.getState();
    void persistStore
      .set("state", { profiles, folders, layout } satisfies PersistedState)
      .then(() => persistStore.save());
  }, 500);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  shells: [],
  homeDir: "",
  profiles: [],
  folders: [],
  layout: null,
  focusedPaneId: null,

  async init() {
    if (get().ready) return;
    const [shells, homeDir, persisted] = await Promise.all([
      invoke<ShellInfo[]>("detect_shells"),
      invoke<string>("home_dir"),
      persistStore.get<PersistedState>("state"),
    ]);
    const layout = persisted?.layout ?? null;
    set({
      ready: true,
      shells,
      homeDir,
      profiles: (persisted?.profiles ?? []).map(normalizeProfile),
      folders: persisted?.folders ?? [],
      layout,
      focusedPaneId: collectPanes(layout)[0]?.id ?? null,
    });
  },

  addProfile(p) {
    set((s) => ({ profiles: [...s.profiles, { ...p, id: genId() }] }));
    schedulePersist();
  },

  updateProfile(p) {
    set((s) => ({
      profiles: s.profiles.map((x) => (x.id === p.id ? p : x)),
    }));
    schedulePersist();
  },

  removeProfile(id) {
    set((s) => ({ profiles: s.profiles.filter((x) => x.id !== id) }));
    schedulePersist();
  },

  moveProfile(id, folderId, anchorId = null, position = "before") {
    set((s) => {
      const dragged = s.profiles.find((p) => p.id === id);
      if (!dragged) return s;
      const rest = s.profiles.filter((p) => p.id !== id);
      const updated = { ...dragged, folderId };
      const idx = anchorId ? rest.findIndex((p) => p.id === anchorId) : -1;
      if (idx === -1) {
        rest.push(updated);
      } else {
        rest.splice(position === "after" ? idx + 1 : idx, 0, updated);
      }
      return { profiles: rest };
    });
    schedulePersist();
  },

  addFolder(name, parentId) {
    set((s) => ({
      folders: [...s.folders, { id: genId(), name, parentId }],
    }));
    schedulePersist();
  },

  moveFolder(id, parentId, anchorId = null, position = "before") {
    set((s) => {
      const dragged = s.folders.find((f) => f.id === id);
      if (!dragged) return s;
      // 防循環：不能把資料夾移到自己或自己的子孫底下
      let cursor = parentId;
      while (cursor) {
        if (cursor === id) return s;
        cursor = s.folders.find((f) => f.id === cursor)?.parentId ?? null;
      }
      const rest = s.folders.filter((f) => f.id !== id);
      const updated = { ...dragged, parentId };
      const idx = anchorId ? rest.findIndex((f) => f.id === anchorId) : -1;
      if (idx === -1) {
        rest.push(updated);
      } else {
        rest.splice(position === "after" ? idx + 1 : idx, 0, updated);
      }
      return { folders: rest };
    });
    schedulePersist();
  },

  renameFolder(id, name) {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
    schedulePersist();
  },

  removeFolder(id) {
    // 刪除資料夾時，裡面的設定檔與子資料夾移到上一層，不連帶刪除
    set((s) => {
      const target = s.folders.find((f) => f.id === id);
      const parentId = target?.parentId ?? null;
      return {
        folders: s.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId } : f)),
        profiles: s.profiles.map((p) =>
          p.folderId === id ? { ...p, folderId: parentId } : p,
        ),
      };
    });
    schedulePersist();
  },

  toggleFolder(id) {
    set((s) => ({
      folders: s.folders.map((f) =>
        f.id === id ? { ...f, collapsed: !f.collapsed } : f,
      ),
    }));
    schedulePersist();
  },

  async exportProfiles() {
    const { profiles, folders } = get();
    const path = await save({
      defaultPath: "termo-profiles.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false;
    const data: ProfileExport = { app: "termo", version: 1, folders, profiles };
    await invoke("write_text_file", {
      path,
      contents: JSON.stringify(data, null, 2),
    });
    return true;
  },

  async importProfiles() {
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return 0;
    const raw = await invoke<string>("read_text_file", { path });
    let data: ProfileExport;
    try {
      data = JSON.parse(raw);
    } catch {
      return 0;
    }
    if (data.app !== "termo" || !Array.isArray(data.profiles)) return 0;

    // 重新產生 id，避免與現有資料衝突；folder 對應關係照舊
    const folderIdMap = new Map<string, string>();
    const folders = (data.folders ?? []).map((f) => {
      const id = genId();
      folderIdMap.set(f.id, id);
      return { ...f, id };
    });
    const remappedFolders = folders.map((f) => ({
      ...f,
      parentId: f.parentId ? (folderIdMap.get(f.parentId) ?? null) : null,
    }));
    const profiles = data.profiles.map((p) => ({
      ...normalizeProfile(p),
      id: genId(),
      folderId: p.folderId ? (folderIdMap.get(p.folderId) ?? null) : null,
    }));

    set((s) => ({
      folders: [...s.folders, ...remappedFolders],
      profiles: [...s.profiles, ...profiles],
    }));
    schedulePersist();
    return profiles.length;
  },

  openPane(spec) {
    const pane: PaneNode = { type: "pane", id: genId(), spec };
    set((s) => {
      if (!s.layout) return { layout: pane, focusedPaneId: pane.id };
      const target =
        s.focusedPaneId ?? collectPanes(s.layout)[0]?.id ?? null;
      if (!target) return { layout: pane, focusedPaneId: pane.id };
      return {
        layout: splitPane(s.layout, target, "horizontal", pane),
        focusedPaneId: pane.id,
      };
    });
    schedulePersist();
  },

  openDefaultPane() {
    const { shells, homeDir } = get();
    const shell = shells[0];
    if (!shell) return;
    get().openPane({
      name: shell.name,
      shellPath: shell.path,
      args: shell.args,
      cwd: homeDir,
    });
  },

  splitPane(paneId, direction) {
    const s = get();
    if (!s.layout) return;
    const source = collectPanes(s.layout).find((p) => p.id === paneId);
    if (!source) return;
    const pane: PaneNode = { type: "pane", id: genId(), spec: { ...source.spec } };
    set({
      layout: splitPane(s.layout, paneId, direction, pane),
      focusedPaneId: pane.id,
    });
    schedulePersist();
  },

  closePane(paneId) {
    disposeTerminal(paneId);
    set((s) => {
      if (!s.layout) return s;
      const layout = removePane(s.layout, paneId);
      const focusedPaneId =
        s.focusedPaneId === paneId
          ? (collectPanes(layout)[0]?.id ?? null)
          : s.focusedPaneId;
      return { layout, focusedPaneId };
    });
    schedulePersist();
  },

  setFocused(paneId) {
    if (get().focusedPaneId !== paneId) set({ focusedPaneId: paneId });
  },

  setSizes(splitId, sizes) {
    const s = get();
    if (!s.layout) return;
    set({ layout: setSplitSizes(s.layout, splitId, sizes) });
    schedulePersist();
  },
}));
