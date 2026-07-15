import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import type { Folder, Profile } from "@/types";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const ROOT = "__root__";

function flattenFolders(
  folders: Folder[],
  parentId: string | null = null,
  depth = 0,
): { folder: Folder; depth: number }[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .flatMap((f) => [
      { folder: f, depth },
      ...flattenFolders(folders, f.id, depth + 1),
    ]);
}

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 有值代表編輯，否則是新增 */
  initial?: Profile | null;
  /** 新增時預設放進哪個資料夾 */
  defaultFolderId?: string | null;
}

export function ProfileDialog({
  open,
  onOpenChange,
  initial,
  defaultFolderId = null,
}: Props) {
  const shells = useAppStore((s) => s.shells);
  const homeDir = useAppStore((s) => s.homeDir);
  const folders = useAppStore((s) => s.folders);

  const [name, setName] = useState("");
  const [shellPath, setShellPath] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setShellPath(initial.shellPath);
      setArgs(initial.args.join(" "));
      setCwd(initial.cwd);
      setColor(initial.color);
      setFolderId(initial.folderId);
    } else {
      const first = shells[0];
      setName("");
      setShellPath(first?.path ?? "");
      setArgs((first?.args ?? []).join(" "));
      setCwd(homeDir);
      setColor(null);
      setFolderId(defaultFolderId);
    }
  }, [open, initial, shells, homeDir, defaultFolderId]);

  const shellName =
    shells.find((s) => s.path === shellPath)?.name ?? shellPath;

  function saveProfile() {
    const data = {
      name: name.trim() || shellName,
      shellName,
      shellPath,
      args: args.trim() ? args.trim().split(/\s+/) : [],
      cwd: cwd.trim(),
      color,
      folderId,
    };
    if (initial) {
      useAppStore.getState().updateProfile({ ...data, id: initial.id });
    } else {
      useAppStore.getState().addProfile(data);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "編輯設定檔" : "新增設定檔"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">名稱</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：前端專案"
            />
          </div>
          <div className="grid gap-2">
            <Label>Shell</Label>
            <Select
              value={shellPath}
              onValueChange={(path) => {
                setShellPath(path);
                const shell = shells.find((s) => s.path === path);
                if (shell) setArgs(shell.args.join(" "));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇 shell" />
              </SelectTrigger>
              <SelectContent>
                {shells.map((s) => (
                  <SelectItem key={s.path} value={s.path}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-cwd">起始路徑</Label>
            <Input
              id="profile-cwd"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="D:\repo\my-project"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-args">啟動參數</Label>
            <Input
              id="profile-args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="-NoLogo"
            />
          </div>
          <div className="grid gap-2">
            <Label>資料夾</Label>
            <Select
              value={folderId ?? ROOT}
              onValueChange={(v) => setFolderId(v === ROOT ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT}>（根目錄）</SelectItem>
                {flattenFolders(folders).map(({ folder, depth }) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {"　".repeat(depth) + folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>顏色</Label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="不設定"
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border border-border text-muted-foreground",
                  color === null && "ring-2 ring-ring",
                )}
                onClick={() => setColor(null)}
              >
                <span className="text-[10px]">無</span>
              </button>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full",
                    color === c && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check className="size-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={saveProfile} disabled={!shellPath}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
