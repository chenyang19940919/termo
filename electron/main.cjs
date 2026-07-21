// Electron 主程序：與 src-tauri 平行的第二個桌面外殼。
// 前端經由 preload.cjs 的 termoBridge 呼叫這裡的 IPC handlers，
// 功能面向對齊 src-tauri/src/pty.rs 與 fsio.rs。
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  shell: electronShell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const pty = require("node-pty");
const { autoUpdater } = require("electron-updater");

// Explorer 右鍵選單「在 Termo 開啟」寫入的 command 是 `Termo.exe --open-path "%V"`。
// 用明確 flag 而不是取最後一個參數，是因為 dev 模式用 `electron .` 啟動，argv 最後一個
// 元素會是 "."（一個合法目錄），若照位置取值會誤判成使用者要開啟的路徑。
function extractOpenPath(argv) {
  const eq = argv.find((a) => a.startsWith("--open-path="));
  const flagIdx = argv.indexOf("--open-path");
  const raw = eq ? eq.slice("--open-path=".length) : flagIdx !== -1 ? argv[flagIdx + 1] : null;
  if (!raw) return null;
  try {
    return fs.statSync(raw).isDirectory() ? raw : null;
  } catch {
    return null;
  }
}

// 開啟時就先讀一次自己的 argv：如果是「已有實例在跑」，這個值不會被用到
// （下面 requestSingleInstanceLock 失敗就直接 quit），只有真的變成主程序時才有意義。
let pendingOpenPath = extractOpenPath(process.argv);

// 確保同時間只有一個 Termo 視窗：拿不到鎖代表已經有實例在跑，
// 這個新程序把自己的路徑透過 OS 轉發給既有實例（見下面 second-instance），然後結束自己。
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

/** @type {Map<string, import("node-pty").IPty>} */
const sessions = new Map();

/** 與 Tauri 版共用同一份設定檔（tauri-plugin-store 的 JSON 格式：{ "state": {...} }） */
function configPath() {
  return path.join(app.getPath("appData"), "com.termo.app", "termo-config.json");
}

function findInPath(exe) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, exe);
    try {
      // statSync 對 Windows Store 版的 App Execution Alias（例如 pwsh.exe）會回 EACCES，
      // 只有 accessSync 抓得到這種只能透過 alias 執行、無法直接 stat 的安裝方式
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      /* not found in this dir */
    }
  }
  return null;
}

// 與 pty.rs 的 detect_shells 保持同一份清單與順序
function detectShells() {
  const shells = [];
  const pwsh = findInPath("pwsh.exe");
  if (pwsh) shells.push({ name: "PowerShell 7", path: pwsh, args: ["-NoLogo"] });
  const powershell = findInPath("powershell.exe");
  if (powershell)
    shells.push({ name: "Windows PowerShell", path: powershell, args: ["-NoLogo"] });
  const cmd = findInPath("cmd.exe");
  if (cmd) shells.push({ name: "命令提示字元", path: cmd, args: [] });
  for (const candidate of [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) {
        shells.push({ name: "Git Bash", path: candidate, args: ["-i", "-l"] });
        break;
      }
    } catch {
      /* not installed */
    }
  }
  const wsl = findInPath("wsl.exe");
  if (wsl) shells.push({ name: "WSL", path: wsl, args: [] });
  return shells;
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Termo",
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    icon: path.join(__dirname, "..", "src-tauri", "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Quake 主控台風格的全域喚醒鍵：視窗有焦點就隱藏，否則顯示並搶焦點
// （最小化或被其他視窗蓋住都算「沒有焦點」，一律用 show()+focus() 拉到最前面）
function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

ipcMain.handle("pty:spawn", (_e, { id, shell, args, cwd, cols, rows }) => {
  if (sessions.has(id)) return;
  let dir = cwd && cwd.trim() ? cwd : os.homedir();
  try {
    if (!fs.statSync(dir).isDirectory()) dir = os.homedir();
  } catch {
    dir = os.homedir();
  }
  const proc = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: Math.max(cols || 80, 2),
    rows: Math.max(rows || 24, 2),
    cwd: dir,
    env: process.env,
    useConpty: true,
  });
  sessions.set(id, proc);
  proc.onData((data) => {
    mainWindow?.webContents.send("pty:data", { id, data });
  });
  proc.onExit(() => {
    if (sessions.delete(id)) {
      mainWindow?.webContents.send("pty:exit", id);
    }
  });
});

// 高頻鍵盤輸入走 on（fire-and-forget），避免每個按鍵一趟 round-trip
ipcMain.on("pty:write", (_e, { id, data }) => {
  sessions.get(id)?.write(data);
});

ipcMain.handle("pty:resize", (_e, { id, cols, rows }) => {
  sessions.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 2));
});

ipcMain.handle("pty:kill", (_e, id) => {
  const proc = sessions.get(id);
  if (proc) {
    sessions.delete(id); // 先移除，onExit 就不會再發 pty:exit
    proc.kill();
  }
});

ipcMain.handle("shells:detect", () => detectShells());

ipcMain.handle("home:dir", () => os.homedir());

// renderer 開機 init() 完成、shells 都 detect 好之後才會來拉這個值，
// 所以不用擔心 App 還沒 ready 就被塞一個 open-path 事件的 race
ipcMain.handle("path:initial", () => {
  const p = pendingOpenPath;
  pendingOpenPath = null;
  return p;
});

// os.release() 在 Windows 上是 "10.0.<build>"，直接取 build number 給 xterm 的 windowsPty 選項用
ipcMain.handle("os:windows-build", () => Number(os.release().split(".")[2]) || 0);

ipcMain.handle("config:load", async () => {
  try {
    const raw = await fsp.readFile(configPath(), "utf-8");
    return JSON.parse(raw).state;
  } catch {
    return undefined;
  }
});

ipcMain.handle("config:save", async (_e, state) => {
  const file = configPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ state }), "utf-8");
});

ipcMain.handle("dialog:save", async (_e, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts?.defaultPath,
    filters: opts?.filters,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle("dialog:open", async (_e, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: opts?.filters,
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("fs:read", (_e, p) => fsp.readFile(p, "utf-8"));

ipcMain.handle("fs:write", (_e, { path: p, contents }) =>
  fsp.writeFile(p, contents, "utf-8"),
);

// 已有實例在跑時，第二次啟動（另一次右鍵「在 Termo 開啟」）會走到這裡：
// 把既有視窗拉到前面，並把新路徑轉發給 renderer 開一個新分頁，而不是開第二個視窗
app.on("second-instance", (_event, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  const targetPath = extractOpenPath(argv);
  if (targetPath) mainWindow.webContents.send("open-path", targetPath);
});

// 外部連結一律交給系統瀏覽器，不在殼內開新視窗
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void electronShell.openExternal(url);
    return { action: "deny" };
  });
});

// GitHub release 是 draft 時 electron-updater 抓不到，要等手動 publish release 後才會生效
autoUpdater.on("error", (err) => {
  console.error("[updater] error:", err);
});

autoUpdater.on("update-downloaded", (info) => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["立即重啟安裝", "下次啟動再裝"],
      defaultId: 0,
      cancelId: 1,
      title: "Termo 更新",
      message: `已下載新版本 ${info.version}，是否立即重啟安裝？`,
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
});

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] check failed:", err);
    });
  }
  if (!globalShortcut.register("Control+Alt+T", toggleWindowVisibility)) {
    console.error("[hotkey] Ctrl+Alt+T 註冊失敗，可能被其他程式占用");
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  for (const proc of sessions.values()) proc.kill();
  sessions.clear();
  app.quit();
});
