import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

export function WorkspaceTabs() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  function commitRename() {
    const trimmed = name.trim();
    if (trimmed && renamingId) {
      useAppStore.getState().renameWorkspace(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-sidebar px-1.5">
      {workspaces.map((w) => (
        <div
          key={w.id}
          title="雙擊重新命名"
          className={cn(
            "group flex h-6 max-w-40 items-center gap-1.5 rounded px-2 text-xs cursor-pointer select-none",
            w.id === activeWorkspaceId
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-accent/60",
          )}
          onClick={() => useAppStore.getState().switchWorkspace(w.id)}
          onDoubleClick={() => {
            setRenamingId(w.id);
            setName(w.name);
          }}
        >
          {renamingId === w.id ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="h-5 w-24 bg-transparent text-xs outline-none"
            />
          ) : (
            <span className="min-w-0 truncate">{w.name}</span>
          )}
          {workspaces.length > 1 && (
            <button
              title="關閉分頁"
              className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                useAppStore.getState().closeWorkspace(w.id);
              }}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      <button
        title="新增分頁"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => useAppStore.getState().addWorkspace()}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
