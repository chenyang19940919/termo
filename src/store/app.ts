import { create } from "zustand";
import type { ITheme } from "@xterm/xterm";
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
  Workspace,
} from "@/types";
import {
  collectPanes,
  genId,
  relocatePane,
  removePane,
  setSplitSizes,
  splitPane,
} from "@/lib/layout";
import { disposeTerminal, sendToTerminal, setBroadcastMode } from "@/lib/terminals";

const DEFAULT_FONT_FAMILY =
  '"Cascadia Mono", Consolas, "Courier New", monospace';
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_THEME: ITheme = {
  background: "#09090b",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  selectionBackground: "#3f3f46",
};
const DEFAULT_SCROLLBACK = 5000;

export interface Settings {
  fontFamily: string;
  fontSize: number;
  theme: ITheme;
  scrollback: number;
}

/** 舊版設定檔可能沒有 theme/scrollback 欄位，載入時補齊 */
function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  return {
    fontFamily: s?.fontFamily || DEFAULT_FONT_FAMILY,
    fontSize: s?.fontSize || DEFAULT_FONT_SIZE,
    theme: { ...DEFAULT_THEME, ...s?.theme },
    scrollback: s?.scrollback || DEFAULT_SCROLLBACK,
  };
}

interface PersistedState {
  profiles: Profile[];
  folders?: Folder[];
  commands?: Command[];
  commandFolders?: Folder[];
  /** 舊格式（v3 以前）單一版面樹，只在遷移時讀，之後一律用 workspaces */
  layout?: LayoutNode | null;
  workspaces?: unknown;
  activeWorkspaceId?: string | null;
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

/**
 * 載入分頁清單；v4 以前的設定檔沒有分頁概念，只有單一 layout——
 * 遷移時把它包成第一個分頁，讓舊使用者升級後版面不會消失。
 */
function normalizeWorkspaces(persisted: PersistedState | undefined): {
  workspaces: Workspace[];
  activeWorkspaceId: string;
} {
  const raw = persisted?.workspaces;
  if (Array.isArray(raw)) {
    const workspaces = raw
      .filter(
        (w): w is { id: string; name: string; layout: unknown } =>
          !!w && typeof w.id === "string" && typeof w.name === "string",
      )
      .map((w): Workspace => {
        const layout = isValidLayout(w.layout) ? w.layout : null;
        return {
          id: w.id,
          name: w.name,
          layout,
          focusedPaneId: collectPanes(layout)[0]?.id ?? null,
        };
      });
    if (workspaces.length > 0) {
      const activeWorkspaceId =
        typeof persisted?.activeWorkspaceId === "string" &&
        workspaces.some((w) => w.id === persisted.activeWorkspaceId)
          ? persisted.activeWorkspaceId
          : workspaces[0].id;
      return { workspaces, activeWorkspaceId };
    }
  }
  const layout = isValidLayout(persisted?.layout) ? persisted!.layout : null;
  const id = genId();
  return {
    workspaces: [
      { id, name: "分頁 1", layout, focusedPaneId: collectPanes(layout)[0]?.id ?? null },
    ],
    activeWorkspaceId: id,
  };
}

export interface AppState {
  ready: boolean;
  shells: ShellInfo[];
  homeDir: string;
  profiles: Profile[];
  folders: Folder[];
  commands: Command[];
  commandFolders: Folder[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  layout: LayoutNode | null;
  focusedPaneId: string | null;
  maximizedPaneId: string | null;
  searchPaneId: string | null;
  broadcastMode: boolean;
  settings: Settings;

  init(): Promise<void>;
  updateSettings(s: Partial<Settings>): void;
  resetSettings(): void;
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
  openPathHere(cwd: string): void;
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
  toggleMaximize(paneId: string): void;
  openSearch(paneId: string): void;
  closeSearch(): void;
  toggleBroadcast(): void;
  addWorkspace(): void;
  closeWorkspace(id: string): void;
  switchWorkspace(id: string): void;
  renameWorkspace(id: string, name: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { profiles, folders, commands, commandFolders, workspaces, activeWorkspaceId, settings } =
      useAppStore.getState();
    void getBackend().then((b) =>
      b.persist({
        profiles,
        folders,
        commands,
        commandFolders,
        // focusedPaneId 是執行期狀態，不用存
        workspaces: workspaces.map(({ id, name, layout }) => ({ id, name, layout })),
        activeWorkspaceId,
        settings,
      } satisfies PersistedState),
    );
  }, 500);
}

type PanePatch = Partial<
  Pick<AppState, "layout" | "focusedPaneId" | "maximizedPaneId" | "searchPaneId">
>;

/**
 * 版面類動作（開/關/搬移 pane）統一走這裡：除了更新頂層 layout/focusedPaneId
 * （既有元件都是讀這兩個欄位），同時把結果鏡射進目前分頁在 workspaces 裡的紀錄，
 * 這樣切分頁時才能還原到正確版面。
 */
function setPane(patch: PanePatch | ((s: AppState) => PanePatch)) {
  useAppStore.setState((s) => {
    const p = typeof patch === "function" ? patch(s) : patch;
    const touchesLayout = "layout" in p || "focusedPaneId" in p;
    const workspaces =
      touchesLayout && s.activeWorkspaceId
        ? s.workspaces.map((w) =>
            w.id === s.activeWorkspaceId
              ? {
                  ...w,
                  layout: "layout" in p ? (p.layout ?? null) : w.layout,
                  focusedPaneId:
                    "focusedPaneId" in p ? (p.focusedPaneId ?? null) : w.focusedPaneId,
                }
              : w,
          )
        : s.workspaces;
    return { ...p, workspaces };
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  shells: [],
  homeDir: "",
  profiles: [],
  folders: [],
  commands: [],
  commandFolders: [],
  workspaces: [],
  activeWorkspaceId: null,
  layout: null,
  focusedPaneId: null,
  maximizedPaneId: null,
  searchPaneId: null,
  broadcastMode: false,
  settings: normalizeSettings(undefined),

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
    const { workspaces, activeWorkspaceId } = normalizeWorkspaces(persisted);
    const active = workspaces.find((w) => w.id === activeWorkspaceId)!;
    const settings = normalizeSettings(persisted?.settings);
    const { applyFontFamily, applyFontSize, applyTheme, applyScrollback } =
      await import("@/lib/terminals");
    applyFontFamily(settings.fontFamily);
    applyFontSize(settings.fontSize);
    applyTheme(settings.theme);
    applyScrollback(settings.scrollback);
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
      workspaces,
      activeWorkspaceId,
      layout: active.layout,
      focusedPaneId: active.focusedPaneId,
      settings,
    });

    const initialPath = await backend.initialOpenPath();
    if (initialPath) get().openPathHere(initialPath);
    backend.onOpenPath((p) => get().openPathHere(p));
  },

  updateSettings(s) {
    set((prev) => ({ settings: { ...prev.settings, ...s } }));
    schedulePersist();
    void import("@/lib/terminals").then(
      ({ applyFontFamily, applyFontSize, applyTheme, applyScrollback }) => {
        const { fontFamily, fontSize, theme, scrollback } = get().settings;
        applyFontFamily(fontFamily);
        applyFontSize(fontSize);
        applyTheme(theme);
        applyScrollback(scrollback);
      },
    );
  },

  resetSettings() {
    get().updateSettings(normalizeSettings(undefined));
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
    if (data.settings) {
      get().updateSettings(data.settings);
    }
    schedulePersist();
    return profiles.length + commands.length;
  },

  openPane(spec) {
    const pane: PaneNode = { type: "pane", id: genId(), spec };
    setPane((s) => {
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

  // Explorer 右鍵選單「在 Termo 開啟」的進入點：不管是啟動時就帶路徑、
  // 還是已經在跑時收到系統殼層轉發的新路徑，都在目前分頁的 focused pane
  // 旁邊向右分割開一個新 pane、cd 到該路徑（走跟 Sidebar 開 profile 一樣的 openPane 邏輯）
  openPathHere(cwd) {
    const shell = get().shells[0];
    if (!shell) return;
    get().openPane({
      name: shell.name,
      shellPath: shell.path,
      args: shell.args,
      cwd,
    });
  },

  splitPane(paneId, direction) {
    const s = get();
    if (!s.layout) return;
    const source = collectPanes(s.layout).find((p) => p.id === paneId);
    if (!source) return;
    const pane: PaneNode = { type: "pane", id: genId(), spec: { ...source.spec } };
    setPane({
      layout: splitPane(s.layout, paneId, direction, pane),
      focusedPaneId: pane.id,
      // 分割後版面改變了，還鎖在單一 pane 全螢幕裡看不到新 pane，直接還原
      maximizedPaneId: null,
    });
    schedulePersist();
  },

  movePane(sourceId, targetId, direction, position) {
    const s = get();
    if (!s.layout || sourceId === targetId) return;
    setPane({ layout: relocatePane(s.layout, sourceId, targetId, direction, position) });
    schedulePersist();
  },

  closePane(paneId) {
    disposeTerminal(paneId);
    setPane((s) => {
      if (!s.layout) return {};
      const layout = removePane(s.layout, paneId);
      const focusedPaneId =
        s.focusedPaneId === paneId
          ? (collectPanes(layout)[0]?.id ?? null)
          : s.focusedPaneId;
      const maximizedPaneId =
        s.maximizedPaneId === paneId ? null : s.maximizedPaneId;
      const searchPaneId = s.searchPaneId === paneId ? null : s.searchPaneId;
      return { layout, focusedPaneId, maximizedPaneId, searchPaneId };
    });
    schedulePersist();
  },

  setFocused(paneId) {
    if (get().focusedPaneId !== paneId) setPane({ focusedPaneId: paneId });
  },

  setSizes(splitId, sizes) {
    const s = get();
    if (!s.layout) return;
    setPane({ layout: setSplitSizes(s.layout, splitId, sizes) });
    schedulePersist();
  },

  toggleMaximize(paneId) {
    set((s) => ({ maximizedPaneId: s.maximizedPaneId === paneId ? null : paneId }));
  },

  openSearch(paneId) {
    set({ searchPaneId: paneId, focusedPaneId: paneId });
  },

  closeSearch() {
    const { searchPaneId } = get();
    if (searchPaneId) {
      void import("@/lib/terminals").then(({ clearSearch, focusTerminal }) => {
        clearSearch(searchPaneId);
        focusTerminal(searchPaneId);
      });
    }
    set({ searchPaneId: null });
  },

  toggleBroadcast() {
    const enabled = !get().broadcastMode;
    setBroadcastMode(enabled);
    set({ broadcastMode: enabled });
  },

  addWorkspace() {
    const ws: Workspace = {
      id: genId(),
      name: `分頁 ${get().workspaces.length + 1}`,
      layout: null,
      focusedPaneId: null,
    };
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      activeWorkspaceId: ws.id,
      layout: null,
      focusedPaneId: null,
      maximizedPaneId: null,
      searchPaneId: null,
    }));
    schedulePersist();
  },

  switchWorkspace(id) {
    const s = get();
    if (s.activeWorkspaceId === id) return;
    const target = s.workspaces.find((w) => w.id === id);
    if (!target) return;
    set({
      activeWorkspaceId: id,
      layout: target.layout,
      focusedPaneId: target.focusedPaneId,
      maximizedPaneId: null,
      searchPaneId: null,
    });
  },

  closeWorkspace(id) {
    const s = get();
    const idx = s.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;
    // 分頁裡開著的 terminal 一併真正結束掉，不留殭屍 pty
    for (const pane of collectPanes(s.workspaces[idx].layout)) {
      disposeTerminal(pane.id);
    }
    let remaining = s.workspaces.filter((w) => w.id !== id);
    let activeWorkspaceId = s.activeWorkspaceId;
    if (remaining.length === 0) {
      const fresh: Workspace = { id: genId(), name: "分頁 1", layout: null, focusedPaneId: null };
      remaining = [fresh];
      activeWorkspaceId = fresh.id;
    } else if (s.activeWorkspaceId === id) {
      activeWorkspaceId = (s.workspaces[idx - 1] ?? s.workspaces[idx + 1]).id;
    }
    const active = remaining.find((w) => w.id === activeWorkspaceId) ?? remaining[0];
    set({
      workspaces: remaining,
      activeWorkspaceId: active.id,
      layout: active.layout,
      focusedPaneId: active.focusedPaneId,
      maximizedPaneId: null,
      searchPaneId: null,
    });
    schedulePersist();
  },

  renameWorkspace(id, name) {
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    }));
    schedulePersist();
  },
}));
