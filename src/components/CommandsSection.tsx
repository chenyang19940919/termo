import { useState } from "react";
import type { DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CommandDialog } from "@/components/CommandDialog";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import type { Command, Folder } from "@/types";

const DRAG_MIME = "application/x-termo-command";
const FOLDER_MIME = "application/x-termo-command-folder";

function isCommandDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(DRAG_MIME);
}

function isFolderDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(FOLDER_MIME);
}

function runCommand(c: Command) {
  useAppStore.getState().runCommand(c.id);
}

interface RowActionsProps {
  runDisabled: boolean;
  onRun(): void;
  onCopy(): void;
  onEdit(): void;
  onDelete(): void;
}

function RowActions({ runDisabled, onRun, onCopy, onEdit, onDelete }: RowActionsProps) {
  return (
    <>
      <button
        title={runDisabled ? "沒有 focus 的 terminal 可以執行" : "在目前 terminal 執行"}
        disabled={runDisabled}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        onClick={(e) => {
          e.stopPropagation();
          onRun();
        }}
      >
        <Play className="size-3" />
      </button>
      <button
        title="複製指令"
        className="rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
      >
        <Copy className="size-3" />
      </button>
      <button
        title="編輯"
        className="rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="size-3" />
      </button>
      <button
        title="刪除"
        className="rounded p-1 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3" />
      </button>
    </>
  );
}

interface CommandRowProps {
  command: Command;
  indent: React.CSSProperties;
  onEdit(): void;
}

function CommandRow({ command: c, indent, onEdit }: CommandRowProps) {
  const [dropPos, setDropPos] = useState<"before" | "after" | null>(null);
  const focusedPaneId = useAppStore((s) => s.focusedPaneId);

  return (
    <div
      draggable
      title={c.command}
      className="group flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-accent"
      style={{
        ...indent,
        boxShadow:
          dropPos === "before"
            ? "inset 0 2px 0 0 var(--ring)"
            : dropPos === "after"
              ? "inset 0 -2px 0 0 var(--ring)"
              : undefined,
      }}
      onDoubleClick={() => runCommand(c)}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!isCommandDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setDropPos(e.clientY < r.top + r.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => setDropPos(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData(DRAG_MIME);
        const pos = dropPos ?? "before";
        setDropPos(null);
        if (id && id !== c.id) {
          useAppStore.getState().moveCommand(id, c.folderId, c.id, pos);
        }
      }}
    >
      <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="h-scroll overflow-x-auto whitespace-nowrap text-sm">
          {c.name}
        </div>
        <div className="h-scroll overflow-x-auto whitespace-nowrap text-[11px] text-muted-foreground/70">
          {c.command}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <RowActions
          runDisabled={!focusedPaneId}
          onRun={() => runCommand(c)}
          onCopy={() => void navigator.clipboard.writeText(c.command)}
          onEdit={onEdit}
          onDelete={() => useAppStore.getState().removeCommand(c.id)}
        />
      </div>
    </div>
  );
}

interface FolderRowProps {
  folder: Folder;
  indent: React.CSSProperties;
  onRename(): void;
  onAddInFolder(): void;
}

type FolderDropZone = "before" | "into" | "after" | null;

function CommandFolderRow({
  folder: f,
  indent,
  onRename,
  onAddInFolder,
}: FolderRowProps) {
  const [dropZone, setDropZone] = useState<FolderDropZone>(null);

  return (
    <div
      draggable
      className={cn(
        "group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 hover:bg-accent",
        dropZone === "into" && "bg-accent ring-1 ring-ring",
      )}
      style={{
        ...indent,
        boxShadow:
          dropZone === "before"
            ? "inset 0 2px 0 0 var(--ring)"
            : dropZone === "after"
              ? "inset 0 -2px 0 0 var(--ring)"
              : undefined,
      }}
      onClick={() => useAppStore.getState().toggleCommandFolder(f.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData(FOLDER_MIME, f.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        const command = isCommandDrag(e);
        const folder = isFolderDrag(e);
        if (!command && !folder) return;
        e.preventDefault();
        e.stopPropagation();
        if (command) {
          setDropZone("into");
          return;
        }
        // 資料夾拖曳：上緣 25% 排到前面、下緣 25% 排到後面、中間移入
        const r = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - r.top) / r.height;
        setDropZone(ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into");
      }}
      onDragLeave={() => setDropZone(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const zone = dropZone ?? "into";
        setDropZone(null);
        const commandId = e.dataTransfer.getData(DRAG_MIME);
        if (commandId) {
          useAppStore.getState().moveCommand(commandId, f.id);
          return;
        }
        const folderId = e.dataTransfer.getData(FOLDER_MIME);
        if (!folderId || folderId === f.id) return;
        if (zone === "into") {
          useAppStore.getState().moveCommandFolder(folderId, f.id);
        } else {
          useAppStore
            .getState()
            .moveCommandFolder(folderId, f.parentId, f.id, zone);
        }
      }}
    >
      {f.collapsed ? (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <button
          title="在此資料夾新增指令"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddInFolder();
          }}
        >
          <Plus className="size-3" />
        </button>
        <button
          title="重新命名"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
        >
          <Pencil className="size-3" />
        </button>
        <button
          title="刪除"
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            useAppStore.getState().removeCommandFolder(f.id);
          }}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

interface TreeProps {
  parentId: string | null;
  depth: number;
  onEditCommand(c: Command): void;
  onRenameFolder(f: Folder): void;
  onAddInFolder(folderId: string): void;
}

function CommandTree({
  parentId,
  depth,
  onEditCommand,
  onRenameFolder,
  onAddInFolder,
}: TreeProps) {
  const folders = useAppStore((s) => s.commandFolders);
  const commands = useAppStore((s) => s.commands);

  const childFolders = folders.filter((f) => f.parentId === parentId);
  const childCommands = commands.filter((c) => c.folderId === parentId);
  const indent = { paddingLeft: `${8 + depth * 14}px` };

  return (
    <>
      {childFolders.map((f) => (
        <div key={f.id}>
          <CommandFolderRow
            folder={f}
            indent={indent}
            onRename={() => onRenameFolder(f)}
            onAddInFolder={() => onAddInFolder(f.id)}
          />
          {!f.collapsed && (
            <CommandTree
              parentId={f.id}
              depth={depth + 1}
              onEditCommand={onEditCommand}
              onRenameFolder={onRenameFolder}
              onAddInFolder={onAddInFolder}
            />
          )}
        </div>
      ))}
      {childCommands.map((c) => (
        <CommandRow
          key={c.id}
          command={c}
          indent={indent}
          onEdit={() => onEditCommand(c)}
        />
      ))}
    </>
  );
}

interface FolderDialogState {
  mode: "add" | "rename";
  folder?: Folder;
}

export function CommandsSection() {
  const commands = useAppStore((s) => s.commands);
  const commandFolders = useAppStore((s) => s.commandFolders);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Command | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(
    null,
  );
  const [folderName, setFolderName] = useState("");

  function submitFolderDialog() {
    const name = folderName.trim();
    if (!name || !folderDialog) return;
    if (folderDialog.mode === "add") {
      useAppStore.getState().addCommandFolder(name, null);
    } else if (folderDialog.folder) {
      useAppStore.getState().renameCommandFolder(folderDialog.folder.id, name);
    }
    setFolderDialog(null);
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-medium text-muted-foreground">
          常用指令
        </span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title="新增資料夾"
            onClick={() => {
              setFolderName("");
              setFolderDialog({ mode: "add" });
            }}
          >
            <FolderPlus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title="新增指令"
            onClick={() => {
              setEditing(null);
              setDefaultFolderId(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        onDragOver={(e) => {
          if (isCommandDrag(e) || isFolderDrag(e)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const commandId = e.dataTransfer.getData(DRAG_MIME);
          if (commandId) {
            useAppStore.getState().moveCommand(commandId, null);
            return;
          }
          const folderId = e.dataTransfer.getData(FOLDER_MIME);
          if (folderId) useAppStore.getState().moveCommandFolder(folderId, null);
        }}
      >
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          <CommandTree
            parentId={null}
            depth={0}
            onEditCommand={(c) => {
              setEditing(c);
              setDialogOpen(true);
            }}
            onRenameFolder={(f) => {
              setFolderName(f.name);
              setFolderDialog({ mode: "rename", folder: f });
            }}
            onAddInFolder={(folderId) => {
              setEditing(null);
              setDefaultFolderId(folderId);
              setDialogOpen(true);
            }}
          />
          {commands.length === 0 && commandFolders.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground/70">
              還沒有常用指令。按右上角 + 新增，雙擊或按執行鈕會送進目前 focus 的
              terminal。
            </p>
          )}
        </div>
      </ScrollArea>

      <CommandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        defaultFolderId={defaultFolderId}
      />

      <Dialog
        open={folderDialog !== null}
        onOpenChange={(o) => !o && setFolderDialog(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === "add" ? "新增資料夾" : "重新命名資料夾"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="資料夾名稱"
            onKeyDown={(e) => e.key === "Enter" && submitFolderDialog()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>
              取消
            </Button>
            <Button onClick={submitFolderDialog} disabled={!folderName.trim()}>
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
