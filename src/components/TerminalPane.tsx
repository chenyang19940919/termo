import { useEffect, useRef } from "react";
import { SquareSplitHorizontal, SquareSplitVertical, X } from "lucide-react";
import { useAppStore } from "@/store/app";
import {
  attachTerminal,
  detachTerminal,
  fitTerminal,
  focusTerminal,
} from "@/lib/terminals";
import { cn } from "@/lib/utils";
import type { PaneNode } from "@/types";

export function TerminalPane({ node }: { node: PaneNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const focused = useAppStore((s) => s.focusedPaneId === node.id);

  useEffect(() => {
    const host = hostRef.current!;
    attachTerminal(node.id, node.spec, host);
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => fitTerminal(node.id));
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      detachTerminal(node.id, host);
    };
    // spec 是開啟當下的快照，pane 存續期間不變
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useEffect(() => {
    if (focused) focusTerminal(node.id);
  }, [focused, node.id]);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden bg-[#09090b]",
        focused && "ring-1 ring-ring/70 ring-inset",
      )}
      onMouseDown={() => useAppStore.getState().setFocused(node.id)}
    >
      <div
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 px-2 text-xs",
          focused ? "text-foreground" : "text-muted-foreground",
        )}
        style={
          node.spec.color
            ? { boxShadow: `inset 3px 0 0 0 ${node.spec.color}` }
            : undefined
        }
      >
        {node.spec.color && (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: node.spec.color }}
          />
        )}
        <span className="truncate font-medium">{node.spec.name}</span>
        <span className="truncate text-muted-foreground/70">
          {node.spec.cwd}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            title="向右分割 (Alt+Shift+D)"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => useAppStore.getState().splitPane(node.id, "horizontal")}
          >
            <SquareSplitHorizontal className="size-3.5" />
          </button>
          <button
            title="向下分割 (Alt+Shift+S)"
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => useAppStore.getState().splitPane(node.id, "vertical")}
          >
            <SquareSplitVertical className="size-3.5" />
          </button>
          <button
            title="關閉 (Ctrl+Shift+W)"
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            onClick={() => useAppStore.getState().closePane(node.id)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  );
}
