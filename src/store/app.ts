import { create } from "zustand";
import { getBackend } from "@/lib/backend";
import type {
  Command,
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
  relocatePane,
  removePane,
  setSplitSizes,
  splitPane,
} from "@/lib/layout";
import { disposeTerminal, sendToTerminal } from "@/lib/terminals";

const DEFAULT_FONT_FAMILY =
  '"Cascadia Mono", Consolas, "Courier New", monospace';
const DEFAULT_FONT_SIZE = 14;

export interface Settings {
  fontFamily: string;
  fontSize: number;
}

interface PersistedState {
  profiles: Profile[];
  folders?: Folder[];
  commands?: Command[];
  commandFolders?: Folder[];
  layout: LayoutNode | null;
  settings?: Settings;
}

interface ProfileExport {
  app: "termo";
  version: number;
  folders: Folder[];
  profiles: Profile[];
  commands?: Command[];
  commandFolders?: Folder[];
  settings?: Settings;
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

/** 濾掉缺少必要欄位（壞掉/不明來源）的資料夾，避免渲染時炸掉 */
function normalizeFolders(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is Folder =>
      !!f && typeof f.id === "string" && typeof f.name === "string",
  );
}

/** 濾掉缺少必要欄位的指令，避免渲染時炸掉 */
function normalizeCommands(raw: unknown): Command[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Command =>
      !!c &&
      typeof c.id === "string" &&
      typeof c.name === "string" &&
      typeof c.command === "string",
  );
}

/** 遞迴檢查版面結構是否完整；只要有一節點壞掉就整棵樹放棄，回上一個乾淨狀態 */
function isValidLayout(node: unknown): node is LayoutNode {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (n.type === "pane") {
    return typeof n.id === "string" && !!n.spec && typeof n.spec === "object";
  }
  if (n.type === "split") {
    return (
      typeof n.id === "string" &&
      (n.direction === "horizontal" || n.direction === "vertical") &&
      Array.isArray(n.children) &&
      n.children.every(isValidLayout) &&
      Array.isArray(n.sizes)
    );
  }
  return false;
}

export interface AppState {
  ready: boolean;
  shells: ShellInfo[];
  homeDir: string;
  profiles: Profile[];
  folders: Folder[];
  commands: Command[];
  commandFolders: Folder[];
  layout: LayoutNode | null;
  focusedPaneId: string | null;
  settings: Settings;

  init(): Promise<void>;
  updateSettings(s: Partial<Settings>): void;
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
  addCommand(name: string, command: string, folderId: string | null): void;
  updateCommand(c: Command): void;
  removeCommand(id: string): void;
  moveCommand(
    id: string,
    folderId: string | null,
    anchorId?: string | null,
    position?: "before" | "after",
  ): void;
  addCommandFolder(name: string, parentId: string | null): void;
  moveCommandFolder(
    id: string,
    parentId: string | null,
    anchorId?: string | null,
    position?: "before" | "after",
  ): void;
  renameCommandFolder(id: string, name: string): void;
  removeCommandFolder(id: string): void;
  toggleCommandFolder(id: string): void;
  runCommand(id: string): void;
  exportProfiles(): Promise<boolean>;
  importProfiles(): Promise<number>;
  openPane(spec: PaneSpec): void;
  openDefaultPane(): void;
  splitPane(paneId: string, direction: Direction): void;
  movePane(
    sourceId: string,
    targetId: string,
    direction: Direction,
    position: "before" | "after",
  ): void;
  closePane(paneId: string): void;
  setFocused(paneId: string): void;
  setSizes(splitId: string, sizes: number[]): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { profiles, folders, commands, commandFolders, layout, settings } =
      useAppStore.getState();
    void getBackend().then((b) =>
      b.persist({
        profiles,
        folders,
        commands,
        commandFolders,
        layout,
        settings,
      } satisfies PersistedState),
    );
  }, 500);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  shells: [],
  homeDir: "",
  profiles: [],
  folders: [],
  commands: [],
  commandFolders: [],
  layout: null,
  focusedPaneId: null,
  settings: { fontFamily: DEFAULT_FONT_FAMILY, fontSize: DEFAULT_FONT_SIZE },

  async init() {
    if (get().ready) return;
    const backend = await getBackend();
    const [shells, homeDir, persisted] = await Promise.all([
      backend.detectShells(),
      backend.homeDir(),
      backend.loadPersisted<PersistedState>().catch((err) => {
        // 設定檔損毀或格式不相容（例如舊版升級後讀不動）：
        // 視為沒有存檔，讓 app 照預設值正常開啟，而不是卡住或整包噴錯
        console.error("讀取設定檔失敗，改用預設值", err);
        return undefined;
      }),
    ]);
    const layout = isValidLayout(persisted?.layout) ? persisted!.layout : null;
    const fontFamily = persisted?.settings?.fontFamily || DEFAULT_FONT_FAMILY;
    const fontSize = persisted?.settings?.fontSize || DEFAULT_FONT_SIZE;
    const { applyFontFamily, applyFontSize } = await import("@/lib/terminals");
    applyFontFamily(fontFamily);
    applyFontSize(fontSize);
    set({
      ready: true,
      shells,
      homeDir,
      profiles: Array.isArray(persisted?.profiles)
        ? persisted.profiles.map(normalizeProfile)
        : [],
      folders: normalizeFolders(persisted?.folders),
      commands: normalizeCommands(persisted?.commands),
      commandFolders: normalizeFolders(persisted?.commandFolders),
      layout,
      focusedPaneId: collectPanes(layout)[0]?.id ?? null,
      settings: { fontFamily, fontSize },
    });
  },

  updateSettings(s) {
    set((prev) => ({ settings: { ...prev.settings, ...s } }));
    schedulePersist();
    void import("@/lib/terminals").then(({ applyFontFamily, applyFontSize }) => {
      const { fontFamily, fontSize } = get().settings;
      applyFontFamily(fontFamily);
      applyFontSize(fontSize);
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

  addCommand(name, command, folderId) {
    set((s) => ({
      commands: [...s.commands, { id: genId(), name, command, folderId }],
    }));
    schedulePersist();
  },

  updateCommand(c) {
    set((s) => ({
      commands: s.commands.map((x) => (x.id === c.id ? c : x)),
    }));
    schedulePersist();
  },

  removeCommand(id) {
    set((s) => ({ commands: s.commands.filter((c) => c.id !== id) }));
    schedulePersist();
  },

  moveCommand(id, folderId, anchorId = null, position = "before") {
    set((s) => {
      const dragged = s.commands.find((c) => c.id === id);
      if (!dragged) return s;
      const rest = s.commands.filter((c) => c.id !== id);
      const updated = { ...dragged, folderId };
      const idx = anchorId ? rest.findIndex((c) => c.id === anchorId) : -1;
      if (idx === -1) {
        rest.push(updated);
      } else {
        rest.splice(position === "after" ? idx + 1 : idx, 0, updated);
      }
      return { commands: rest };
    });
    schedulePersist();
  },

  addCommandFolder(name, parentId) {
    set((s) => ({
      commandFolders: [...s.commandFolders, { id: genId(), name, parentId }],
    }));
    schedulePersist();
  },

  moveCommandFolder(id, parentId, anchorId = null, position = "before") {
    set((s) => {
      const dragged = s.commandFolders.find((f) => f.id === id);
      if (!dragged) return s;
      // 防循環：不能把資料夾移到自己或自己的子孫底下
      let cursor = parentId;
      while (cursor) {
        if (cursor === id) return s;
        cursor = s.commandFolders.find((f) => f.id === cursor)?.parentId ?? null;
      }
      const rest = s.commandFolders.filter((f) => f.id !== id);
      const updated = { ...dragged, parentId };
      const idx = anchorId ? rest.findIndex((f) => f.id === anchorId) : -1;
      if (idx === -1) {
        rest.push(updated);
      } else {
        rest.splice(position === "after" ? idx + 1 : idx, 0, updated);
      }
      return { commandFolders: rest };
    });
    schedulePersist();
  },

  renameCommandFolder(id, name) {
    set((s) => ({
      commandFolders: s.commandFolders.map((f) =>
        f.id === id ? { ...f, name } : f,
      ),
    }));
    schedulePersist();
  },

  removeCommandFolder(id) {
    // 刪除資料夾時，裡面的指令與子資料夾移到上一層，不連帶刪除
    set((s) => {
      const target = s.commandFolders.find((f) => f.id === id);
      const parentId = target?.parentId ?? null;
      return {
        commandFolders: s.commandFolders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId } : f)),
        commands: s.commands.map((c) =>
          c.folderId === id ? { ...c, folderId: parentId } : c,
        ),
      };
    });
    schedulePersist();
  },

  toggleCommandFolder(id) {
    set((s) => ({
      commandFolders: s.commandFolders.map((f) =>
        f.id === id ? { ...f, collapsed: !f.collapsed } : f,
      ),
    }));
    schedulePersist();
  },

  runCommand(id) {
    const { commands, focusedPaneId } = get();
    if (!focusedPaneId) return;
    const cmd = commands.find((c) => c.id === id);
    if (!cmd) return;
    sendToTerminal(focusedPaneId, cmd.command + "\r");
  },

  async exportProfiles() {
    const { profiles, folders, commands, commandFolders, settings } = get();
    const backend = await getBackend();
    const path = await backend.saveDialog({
      defaultPath: "termo-profiles.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false;
    const data: ProfileExport = {
      app: "termo",
      version: 3,
      folders,
      profiles,
      commands,
      commandFolders,
      settings,
    };
    await backend.writeTextFile(path, JSON.stringify(data, null, 2));
    return true;
  },

  async importProfiles() {
    const backend = await getBackend();
    const path = await backend.openDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof path !== "string") return 0;
    const raw = await backend.readTextFile(path);
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

    const commandFolderIdMap = new Map<string, string>();
    const commandFolders = (data.commandFolders ?? []).map((f) => {
      const id = genId();
      commandFolderIdMap.set(f.id, id);
      return { ...f, id };
    });
    const remappedCommandFolders = commandFolders.map((f) => ({
      ...f,
      parentId: f.parentId ? (commandFolderIdMap.get(f.parentId) ?? null) : null,
    }));
    const commands = normalizeCommands(data.commands).map((c) => ({
      ...c,
      id: genId(),
      folderId: c.folderId ? (commandFolderIdMap.get(c.folderId) ?? null) : null,
    }));

    set((s) => ({
      folders: [...s.folders, ...remappedFolders],
      profiles: [...s.profiles, ...profiles],
      commandFolders: [...s.commandFolders, ...remappedCommandFolders],
      commands: [...s.commands, ...commands],
    }));
    if (data.settings?.fontFamily || data.settings?.fontSize) {
      get().updateSettings(data.settings);
    }
    schedulePersist();
    return profiles.length + commands.length;
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

  movePane(sourceId, targetId, direction, position) {
    const s = get();
    if (!s.layout || sourceId === targetId) return;
    set({ layout: relocatePane(s.layout, sourceId, targetId, direction, position) });
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
