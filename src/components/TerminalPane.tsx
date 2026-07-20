import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  SquareSplitHorizontal,
  SquareSplitVertical,
  X,
} from "lucide-react";
import { useAppStore } from "@/store/app";
import {
  attachTerminal,
  detachTerminal,
  fitTerminal,
  focusTerminal,
  onSearchResults,
  searchNext,
  searchPrevious,
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

function SearchBar({ paneId }: { paneId: string }) {
  const [term, setTerm] = useState("");
  const [counts, setCounts] = useState<{ index: number; count: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return onSearchResults(paneId, (e) => {
      setCounts(e.resultCount > 0 ? { index: e.resultIndex, count: e.resultCount } : null);
    });
  }, [paneId]);

  function next() {
    if (term) searchNext(paneId, term);
  }
  function prev() {
    if (term) searchPrevious(paneId, term);
  }

  return (
    <div className="absolute right-2 top-9 z-20 flex items-center gap-1 rounded-md border border-border bg-popover px-1.5 py-1 text-popover-foreground shadow-md">
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => {
          const v = e.target.value;
          setTerm(v);
          if (v) searchNext(paneId, v);
          else setCounts(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) prev();
            else next();
          } else if (e.key === "Escape") {
            e.preventDefault();
            useAppStore.getState().closeSearch();
          }
        }}
        placeholder="搜尋…"
        className="h-6 w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <span className="min-w-8 text-center text-[11px] text-muted-foreground">
        {counts ? `${counts.index + 1}/${counts.count}` : term ? "0/0" : ""}
      </span>
      <button
        title="上一個 (Shift+Enter)"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        disabled={!term}
        onClick={prev}
      >
        <ChevronUp className="size-3.5" />
      </button>
      <button
        title="下一個 (Enter)"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        disabled={!term}
        onClick={next}
      >
        <ChevronDown className="size-3.5" />
      </button>
      <button
        title="關閉 (Esc)"
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => useAppStore.getState().closeSearch()}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function TerminalPane({ node }: { node: PaneNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const focused = useAppStore((s) => s.focusedPaneId === node.id);
  const maximized = useAppStore((s) => s.maximizedPaneId === node.id);
  const searchOpen = useAppStore((s) => s.searchPaneId === node.id);
  const background = useAppStore((s) => s.settings.theme.background);
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
        "relative flex h-full flex-col overflow-hidden",
        focused && "ring-1 ring-ring/70 ring-inset",
      )}
      style={{ backgroundColor: background }}
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
            title={maximized ? "還原 (Ctrl+Shift+M)" : "最大化 (Ctrl+Shift+M)"}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => useAppStore.getState().toggleMaximize(node.id)}
          >
            {maximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
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
      {searchOpen && <SearchBar paneId={node.id} />}
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  );
}
