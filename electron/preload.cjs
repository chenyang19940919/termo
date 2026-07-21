const { contextBridge, ipcRenderer } = require("electron");

// 對應 src/lib/backend-electron.ts 的 TermoBridge 介面
contextBridge.exposeInMainWorld("termoBridge", {
  spawnPty: (opts) => ipcRenderer.invoke("pty:spawn", opts),
  writePty: (id, data) => ipcRenderer.send("pty:write", { id, data }),
  resizePty: (id, cols, rows) =>
    ipcRenderer.invoke("pty:resize", { id, cols, rows }),
  killPty: (id) => ipcRenderer.invoke("pty:kill", id),
  onPtyData: (cb) =>
    ipcRenderer.on("pty:data", (_e, { id, data }) => cb(id, data)),
  onPtyExit: (cb) => ipcRenderer.on("pty:exit", (_e, id) => cb(id)),
  detectShells: () => ipcRenderer.invoke("shells:detect"),
  homeDir: () => ipcRenderer.invoke("home:dir"),
  windowsBuild: () => ipcRenderer.invoke("os:windows-build"),
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (state) => ipcRenderer.invoke("config:save", state),
  saveDialog: (opts) => ipcRenderer.invoke("dialog:save", opts),
  openDialog: (opts) => ipcRenderer.invoke("dialog:open", opts),
  readTextFile: (p) => ipcRenderer.invoke("fs:read", p),
  writeTextFile: (p, contents) =>
    ipcRenderer.invoke("fs:write", { path: p, contents }),
  initialOpenPath: () => ipcRenderer.invoke("path:initial"),
  onOpenPath: (cb) => ipcRenderer.on("open-path", (_e, path) => cb(path)),
});
