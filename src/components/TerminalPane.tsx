import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
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

const PANE_DRAG_MIME = "application/x-termo-pane";

type DropZone = "top" | "bottom" | "left" | "right";

/** 依游標離哪個邊最近，決定要往哪個方向分割 */
function computeDropZone(e: DragEvent<HTMLElement>): DropZone {
  const r = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const candidates: [DropZone, number][] = [
    ["top", y],
    ["bottom", r.height - y],
    ["left", x],
    ["right", r.width - x],
  ];
  return candidates.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

function dropZoneStyle(zone: DropZone): CSSProperties {
  switch (zone) {
    case "top":
      return { top: 0, left: 0, right: 0, height: "50%" };
    case "bottom":
      return { bottom: 0, left: 0, right: 0, height: "50%" };
    case "left":
      return { top: 0, bottom: 0, left: 0, width: "50%" };
    case "right":
      return { top: 0, bottom: 0, right: 0, width: "50%" };
  }
}

export function TerminalPane({ node }: { node: PaneNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const focused = useAppStore((s) => s.focusedPaneId === node.id);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

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
        "relative flex h-full flex-col overflow-hidden bg-[#09090b]",
        focused && "ring-1 ring-ring/70 ring-inset",
      )}
      onMouseDown={() => useAppStore.getState().setFocused(node.id)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PANE_DRAG_MIME)) return;
        e.preventDefault();
        setDropZone(computeDropZone(e));
      }}
      onDragLeave={() => setDropZone(null)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(PANE_DRAG_MIME)) return;
        e.preventDefault();
        const zone = dropZone;
        setDropZone(null);
        const sourceId = e.dataTransfer.getData(PANE_DRAG_MIME);
        if (!sourceId || sourceId === node.id || !zone) return;
        const direction =
          zone === "top" || zone === "bottom" ? "vertical" : "horizontal";
        const position = zone === "top" || zone === "left" ? "before" : "after";
        useAppStore.getState().movePane(sourceId, node.id, direction, position);
      }}
    >
      {dropZone && (
        <div
          className="pointer-events-none absolute z-10 border-2 border-ring bg-ring/25"
          style={dropZoneStyle(dropZone)}
        />
      )}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PANE_DRAG_MIME, node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={cn(
          "flex h-7 shrink-0 cursor-grab items-center gap-1.5 border-b border-border/60 px-2 text-xs active:cursor-grabbing",
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
        <div
          draggable={false}
          className="ml-auto flex items-center gap-0.5"
          onDragStart={(e) => e.stopPropagation()}
        >
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
