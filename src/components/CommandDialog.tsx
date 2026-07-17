import { useEffect, useState } from "react";
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
import type { Command, Folder } from "@/types";

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
  initial?: Command | null;
  /** 新增時預設放進哪個資料夾 */
  defaultFolderId?: string | null;
}

export function CommandDialog({
  open,
  onOpenChange,
  initial,
  defaultFolderId = null,
}: Props) {
  const commandFolders = useAppStore((s) => s.commandFolders);

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setCommand(initial.command);
      setFolderId(initial.folderId);
    } else {
      setName("");
      setCommand("");
      setFolderId(defaultFolderId);
    }
  }, [open, initial, defaultFolderId]);

  function save() {
    const data = { name: name.trim() || command.trim(), command: command.trim(), folderId };
    if (initial) {
      useAppStore.getState().updateCommand({ ...data, id: initial.id });
    } else {
      useAppStore.getState().addCommand(data.name, data.command, data.folderId);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "編輯指令" : "新增指令"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="command-name">名稱</Label>
            <Input
              id="command-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：啟動開發伺服器"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="command-text">指令</Label>
            <Input
              id="command-text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
              onKeyDown={(e) => e.key === "Enter" && command.trim() && save()}
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
                {flattenFolders(commandFolders).map(({ folder, depth }) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {"　".repeat(depth) + folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={!command.trim()}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
