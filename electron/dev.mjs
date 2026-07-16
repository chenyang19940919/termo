// Electron 開發啟動器：確保 vite dev server 起來後再開 electron。
// vite 已經在跑（例如同時開著 tauri dev）就直接沿用同一個 server。
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DEV_URL = "http://localhost:1420";

async function isServerUp() {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

let viteProc = null;
if (await isServerUp()) {
  console.log(`[electron:dev] 沿用已在執行的 dev server: ${DEV_URL}`);
} else {
  console.log("[electron:dev] 啟動 vite dev server...");
  viteProc = spawn("npm", ["run", "dev"], {
    stdio: "inherit",
    shell: true,
  });
  const deadline = Date.now() + 30_000;
  while (!(await isServerUp())) {
    if (Date.now() > deadline) {
      console.error("[electron:dev] 等不到 dev server，放棄");
      viteProc.kill();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

console.log("[electron:dev] 啟動 electron...");
const electronBin = require("electron");
const electronProc = spawn(electronBin, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
});

electronProc.on("exit", (code) => {
  viteProc?.kill();
  process.exit(code ?? 0);
});
