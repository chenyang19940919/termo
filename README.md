# Termo

分割視窗終端機工具（Windows）。以 Tauri v2 + React + TypeScript + shadcn/ui + xterm.js 開發。

## 功能

- 分割畫面：任意巢狀的水平/垂直分割（`Alt+Shift+D` 向右、`Alt+Shift+S` 向下、`Ctrl+Shift+W` 關閉 pane）
- 設定檔管理：sidebar 建立設定檔（名稱、shell、起始路徑、啟動參數、顏色），雙擊開啟即自動 cd 到指定路徑
- 目錄結構：設定檔可用資料夾分組（支援巢狀），設定檔與資料夾皆可拖曳排序/搬移
- 匯出/匯入：設定檔（含資料夾結構）可匯出成 JSON 分享
- Session 還原：重開 app 自動還原上次的版面與各 pane 的路徑
- 自動偵測系統 shell：PowerShell 7、Windows PowerShell、cmd、Git Bash、WSL

## 開發環境需求

- Node.js 20+
- Rust（stable，`rustup` 安裝即可）
- Windows 10 1809+（ConPTY 需求；WebView2 於 Win10/11 內建）

## 開發

```powershell
npm install
npm run tauri dev
```

第一次會編譯整個 Rust 依賴樹（約 4-5 分鐘），之後增量編譯很快。前端變更走 Vite HMR 即時生效；`src-tauri/` 變更會自動重編並重啟視窗。

## 打包發布

```powershell
npm run tauri build
```

產出（在 `src-tauri\target\release\`）：

| 檔案 | 用途 |
|---|---|
| `bundle\nsis\Termo_<版本>_x64-setup.exe` | 發布用安裝檔（約 2 MB） |
| `termo.exe` | 免安裝單一執行檔 |

### 發布步驟

1. 更新版本號：改 `src-tauri/tauri.conf.json` 的 `version`
2. 執行 `npm run tauri build`
3. 將 `Termo_<版本>_x64-setup.exe` 發給使用者

### GitHub Release

已設定 GitHub Actions（`.github/workflows/release.yml`）：推上 `v*` 開頭的 tag 就會自動在
windows runner 上打包，並建立附帶安裝檔的 **draft release**，到 GitHub 上檢查後按 Publish 即可。

```powershell
# 版本號改好、commit 後：
git tag v0.1.0
git push origin v0.1.0
```

手動發布（不走 CI）：

```powershell
gh release create v0.1.0 "src-tauri\target\release\bundle\nsis\Termo_0.1.0_x64-setup.exe" --title "Termo v0.1.0" --notes "更新內容"
```

### 安裝行為

- 採 NSIS `currentUser` 模式：安裝到 `%LOCALAPPDATA%\Termo`，**不需要管理員權限**
- 新版直接覆蓋安裝即可升級，使用者設定不受影響
- 使用者設定存於 `%APPDATA%\com.termo.app\termo-config.json`

### 注意事項

- 安裝檔未簽章，第一次執行會出現 SmartScreen 警告，按「其他資訊 → 仍要執行」
- 若偶發 release 編譯失敗（依賴 crate 編到一半中斷），重跑 `npm run tauri build` 會從中斷處續編

## 專案結構

```
src/
  components/      UI 元件（Sidebar、TerminalPane、LayoutRenderer、ProfileDialog）
  lib/terminals.ts xterm 實例管理（活在 React 之外，分割時 buffer 不丟失）
  lib/layout.ts    分割版面樹操作
  store/app.ts     zustand 狀態 + 設定持久化
src-tauri/
  src/pty.rs       PTY 管理（portable-pty / ConPTY）、shell 偵測
  src/fsio.rs      設定檔匯出入的檔案讀寫
```
