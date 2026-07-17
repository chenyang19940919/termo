# Termo

Windows 上的分割視窗終端機工具。

---

# 功能說明

- **任意方向分割畫面**：左右、上下都可以，且可以巢狀分割（分割出來的分頁裡再繼續分割）
  - 快捷鍵：`Alt+Shift+D` 向右分割、`Alt+Shift+S` 向下分割、`Ctrl+Shift+W` 關閉目前分頁
  - 拖曳搬動：直接把某個分頁的標題列拖到另一個分頁上，放開時遊標離哪個邊最近，就會照那個方向分割（放左右邊 = 左右分割、放上下邊 = 上下分割），畫面上會即時預覽會落在哪一半
- **設定檔管理**：在側邊欄建立設定檔（名稱、shell、起始路徑、啟動參數、顏色標籤），雙擊即可開啟並自動切換到指定路徑
  - 可用資料夾分組整理（支援巢狀資料夾）
  - 設定檔與資料夾都可以拖曳排序、搬移
- **常用指令庫**：跟設定檔分開的獨立清單，用來存放常跑的指令（例如 `npm run dev`、`git status`）
  - 一樣支援資料夾分類與拖曳排序
  - 雙擊或按執行鈕，直接把指令送進目前使用中的分頁執行；也可以只複製到剪貼簿，貼到其他地方用
- **自動偵測系統上裝了哪些 shell**：PowerShell 7、Windows PowerShell、命令提示字元、Git Bash、WSL，偵測到的都會列在快速開啟清單
- **匯出 / 匯入**：設定檔跟常用指令（含資料夾結構）可以匯出成一個 JSON 檔分享或備份，換電腦也能直接匯入
- **Session 還原**：重開 App 會自動還原上次的分割版面，以及各分頁當時所在的路徑
- **字型與字級可自訂**：可自行填入任意已安裝字型（例如想搭配 Nerd Font 讓 oh-my-posh 之類的提示字元正常顯示）
- **自動更新**：偵測到新版會在背景下載，下載完會詢問是否立即重新啟動安裝

## 安裝

到 [Releases](../../releases) 頁面下載最新版安裝檔（`.exe`），執行後即可使用，不需要系統管理員權限。

- 安裝檔未經數位簽章，第一次執行 Windows 可能會跳出 SmartScreen 警告，點「其他資訊 → 仍要執行」即可
- 如果你的電腦上安裝完視窗完全沒有出現（例如公司電腦有防護軟體），Releases 頁面通常會附兩種安裝檔，可以改試另一個
- 之後有新版會自動偵測並提示更新，不需要每次手動重新下載安裝

---

# 開發用

## 技術堆疊

- 前端：React + TypeScript + Vite + shadcn/ui + xterm.js + zustand
- 桌面殼層：**Tauri v2**（`src-tauri/`，Rust + WebView2）與 **Electron**（`electron/`，並行維護的第二套殼層，繞過 WebView2 相依性）並存，共用同一份前端；`src/lib/backend.ts` 是執行期切換兩者的抽象層

## 開發環境需求

- Node.js 20+
- Rust（stable，`rustup` 安裝即可，只有跑 Tauri 版時需要）
- Windows 10 1809+（ConPTY 需求；WebView2 於 Win10/11 內建）

## 本機開發

```powershell
npm install

# Tauri 版
npm run tauri dev

# Electron 版
npm run electron:dev
```

Tauri 第一次會編譯整個 Rust 依賴樹（約 4-5 分鐘），之後增量編譯很快。前端變更走 Vite HMR 即時生效；`src-tauri/` 變更會自動重編並重啟視窗。`electron:dev` 會自動偵測並沿用已在跑的 Vite dev server（例如同時開著 `tauri dev`）。

## 打包發布

```powershell
npm run tauri build       # Tauri 版
npm run electron:build    # Electron 版
```

產出：

| 檔案 | 用途 |
|---|---|
| `src-tauri\target\release\bundle\nsis\Termo_<版本>_x64-setup.exe` | Tauri 版安裝檔 |
| `src-tauri\target\release\termo.exe` | Tauri 版免安裝單一執行檔 |
| `dist-electron\Termo_<版本>_x64-electron-setup.exe` | Electron 版安裝檔 |

### 發布步驟

1. 更新版本號：**同時**改 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的 `version`，三個要跟即將推的 tag 一致（CI 會擋不一致的情況）
2. commit、`git tag v<版本>`、`git push origin master --tags`
3. GitHub Actions（`.github/workflows/release.yml`）會自動在 windows runner 上打包 Tauri + Electron 兩份安裝檔，並建立附帶兩份安裝檔的 **draft release**
4. 到 GitHub Releases 頁面檢查後按 **Publish**——這一步很重要，Electron 版的自動更新（`electron-updater`）只會抓已發布（非 draft）的 release

手動發布（不走 CI）：

```powershell
gh release create v0.1.0 "src-tauri\target\release\bundle\nsis\Termo_0.1.0_x64-setup.exe" --title "Termo v0.1.0" --notes "更新內容"
```

### 安裝行為

- Tauri 版採 NSIS `currentUser` 模式：安裝到 `%LOCALAPPDATA%\Termo`，**不需要管理員權限**
- 新版直接覆蓋安裝即可升級，使用者設定不受影響
- 使用者設定存於 `%APPDATA%\com.termo.app\termo-config.json`（Tauri、Electron 兩版共用同一份格式）
- Electron 版開機會自動檢查更新（`checkForUpdates`），下載完會跳對話框詢問是否立即重啟安裝

### 注意事項

- 安裝檔未簽章，第一次執行會出現 SmartScreen 警告，按「其他資訊 → 仍要執行」
- 若偶發 release 編譯失敗（依賴 crate 編到一半中斷），重跑 `npm run tauri build` 會從中斷處續編
- 已知問題：部分公司電腦的端點防護軟體會攔截 Tauri 版的 WebView2 controller 初始化（`RPC_E_DISCONNECTED`），導致安裝版開不了視窗；`tauri dev` 模式不受影響。Electron 版不依賴 WebView2，可作為替代方案

## 專案結構

```
src/
  components/           UI 元件
    Sidebar.tsx          側邊欄（設定檔樹 + 常用指令區塊）
    CommandsSection.tsx  常用指令清單、資料夾樹、拖曳排序
    CommandDialog.tsx    新增/編輯常用指令
    ProfileDialog.tsx    新增/編輯設定檔
    TerminalPane.tsx     單一 terminal 分頁（含拖曳搬動/分割）
    LayoutRenderer.tsx   遞迴渲染分割版面樹
    SettingsDialog.tsx   字型/字級設定
  lib/
    backend.ts           Tauri / Electron 執行期抽象層
    backend-tauri.ts     Tauri 版後端實作（呼叫 invoke）
    backend-electron.ts  Electron 版後端實作（呼叫 preload 曝露的 IPC）
    terminals.ts         xterm 實例管理（活在 React 之外，分割/搬動時 buffer 不丟失）
    layout.ts            分割版面樹操作（split / extract / relocate）
  store/app.ts           zustand 狀態 + 設定持久化
src-tauri/
  src/pty.rs             PTY 管理（portable-pty / ConPTY）、shell 偵測
  src/fsio.rs            設定檔匯出入的檔案讀寫
electron/
  main.cjs               主程序：PTY、shell 偵測、IPC handlers、auto-updater
  preload.cjs            曝露給 renderer 的 IPC bridge（termoBridge）
  dev.mjs                開發模式啟動器（起 Vite + Electron）
```
