import { useState } from "react";
import type { DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Plus,
  SquareTerminal,
  Terminal as TerminalIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProfileDialog } from "@/components/ProfileDialog";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import type { Folder, Profile, ShellInfo } from "@/types";

const DRAG_MIME = "application/x-termo-profile";
const FOLDER_MIME = "application/x-termo-folder";

function openProfile(p: Profile) {
  useAppStore.getState().openPane({
    name: p.name,
    shellPath: p.shellPath,
    args: p.args,
    cwd: p.cwd,
    color: p.color,
  });
}

function isProfileDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(DRAG_MIME);
}

function isFolderDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(FOLDER_MIME);
}

interface RowActionsProps {
  onEdit(): void;
  onDelete(): void;
}

function RowActions({ onEdit, onDelete }: RowActionsProps) {
  return (
    <>
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

interface ProfileRowProps {
  profile: Profile;
  indent: React.CSSProperties;
  onEdit(): void;
}

function ProfileRow({ profile: p, indent, onEdit }: ProfileRowProps) {
  const [dropPos, setDropPos] = useState<"before" | "after" | null>(null);

  return (
    <div
      draggable
      title="雙擊開啟"
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
      onDoubleClick={() => openProfile(p)}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!isProfileDrag(e)) return;
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
        if (id && id !== p.id) {
          useAppStore.getState().moveProfile(id, p.folderId, p.id, pos);
        }
      }}
    >
      <SquareTerminal
        className={cn("size-4 shrink-0", !p.color && "text-muted-foreground")}
        style={p.color ? { color: p.color } : undefined}
      />
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="truncate text-sm">{p.name}</div>
        <div className="truncate text-[11px] text-muted-foreground/70">
          {p.cwd || p.shellName}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <RowActions
          onEdit={onEdit}
          onDelete={() => useAppStore.getState().removeProfile(p.id)}
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

function FolderRow({ folder: f, indent, onRename, onAddInFolder }: FolderRowProps) {
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
      onClick={() => useAppStore.getState().toggleFolder(f.id)}
      onDragStart={(e) => {
        e.dataTransfer.setData(FOLDER_MIME, f.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        const profile = isProfileDrag(e);
        const folder = isFolderDrag(e);
        if (!profile && !folder) return;
        e.preventDefault();
        e.stopPropagation();
        if (profile) {
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
        const profileId = e.dataTransfer.getData(DRAG_MIME);
        if (profileId) {
          useAppStore.getState().moveProfile(profileId, f.id);
          return;
        }
        const folderId = e.dataTransfer.getData(FOLDER_MIME);
        if (!folderId || folderId === f.id) return;
        if (zone === "into") {
          useAppStore.getState().moveFolder(folderId, f.id);
        } else {
          useAppStore.getState().moveFolder(folderId, f.parentId, f.id, zone);
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
          title="在此資料夾新增設定檔"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onAddInFolder();
          }}
        >
          <Plus className="size-3" />
        </button>
        <RowActions
          onEdit={onRename}
          onDelete={() => useAppStore.getState().removeFolder(f.id)}
        />
      </div>
    </div>
  );
}

interface TreeProps {
  parentId: string | null;
  depth: number;
  onEditProfile(p: Profile): void;
  onRenameFolder(f: Folder): void;
  onAddInFolder(folderId: string): void;
}

function ProfileTree({
  parentId,
  depth,
  onEditProfile,
  onRenameFolder,
  onAddInFolder,
}: TreeProps) {
  const folders = useAppStore((s) => s.folders);
  const profiles = useAppStore((s) => s.profiles);

  const childFolders = folders.filter((f) => f.parentId === parentId);
  const childProfiles = profiles.filter((p) => p.folderId === parentId);
  const indent = { paddingLeft: `${8 + depth * 14}px` };

  return (
    <>
      {childFolders.map((f) => (
        <div key={f.id}>
          <FolderRow
            folder={f}
            indent={indent}
            onRename={() => onRenameFolder(f)}
            onAddInFolder={() => onAddInFolder(f.id)}
          />
          {!f.collapsed && (
            <ProfileTree
              parentId={f.id}
              depth={depth + 1}
              onEditProfile={onEditProfile}
              onRenameFolder={onRenameFolder}
              onAddInFolder={onAddInFolder}
            />
          )}
        </div>
      ))}
      {childProfiles.map((p) => (
        <ProfileRow
          key={p.id}
          profile={p}
          indent={indent}
          onEdit={() => onEditProfile(p)}
        />
      ))}
    </>
  );
}

interface FolderDialogState {
  mode: "add" | "rename";
  folder?: Folder;
}

export function Sidebar() {
  const shells = useAppStore((s) => s.shells);
  const homeDir = useAppStore((s) => s.homeDir);

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [defaultFolderId, setDefaultFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(
    null,
  );
  const [folderName, setFolderName] = useState("");

  function openShell(s: ShellInfo) {
    useAppStore.getState().openPane({
      name: s.name,
      shellPath: s.path,
      args: s.args,
      cwd: homeDir,
    });
  }

  function submitFolderDialog() {
    const name = folderName.trim();
    if (!name || !folderDialog) return;
    if (folderDialog.mode === "add") {
      useAppStore.getState().addFolder(name, null);
    } else if (folderDialog.folder) {
      useAppStore.getState().renameFolder(folderDialog.folder.id, name);
    }
    setFolderDialog(null);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-10 items-center gap-2 px-3">
        <SquareTerminal className="size-4" />
        <span className="text-sm font-semibold tracking-wide">Termo</span>
      </div>
      <Separator />

      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-medium text-muted-foreground">
          設定檔
        </span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title="匯入設定檔"
            onClick={() => void useAppStore.getState().importProfiles()}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title="匯出設定檔"
            onClick={() => void useAppStore.getState().exportProfiles()}
          >
            <Upload className="size-3.5" />
          </Button>
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
            title="新增設定檔"
            onClick={() => {
              setEditing(null);
              setDefaultFolderId(null);
              setProfileDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        onDragOver={(e) => {
          if (isProfileDrag(e) || isFolderDrag(e)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const profileId = e.dataTransfer.getData(DRAG_MIME);
          if (profileId) {
            useAppStore.getState().moveProfile(profileId, null);
            return;
          }
          const folderId = e.dataTransfer.getData(FOLDER_MIME);
          if (folderId) useAppStore.getState().moveFolder(folderId, null);
        }}
      >
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          <ProfileTree
            parentId={null}
            depth={0}
            onEditProfile={(p) => {
              setEditing(p);
              setProfileDialogOpen(true);
            }}
            onRenameFolder={(f) => {
              setFolderName(f.name);
              setFolderDialog({ mode: "rename", folder: f });
            }}
            onAddInFolder={(folderId) => {
              setEditing(null);
              setDefaultFolderId(folderId);
              setProfileDialogOpen(true);
            }}
          />
          <EmptyHint />
        </div>
      </ScrollArea>

      <Separator />
      <div className="px-3 pt-2 pb-1">
        <span className="text-xs font-medium text-muted-foreground">
          快速開啟
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-2 pb-3">
        {shells.map((s) => (
          <button
            key={s.path}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => openShell(s)}
          >
            <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </div>

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
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
    </aside>
  );
}

function EmptyHint() {
  const profiles = useAppStore((s) => s.profiles);
  const folders = useAppStore((s) => s.folders);
  if (profiles.length > 0 || folders.length > 0) return null;
  return (
    <p className="px-1 py-2 text-xs text-muted-foreground/70">
      還沒有設定檔。按右上角 + 新增，設定名稱、shell、起始路徑與顏色。雙擊設定檔開啟 terminal。
    </p>
  );
}
