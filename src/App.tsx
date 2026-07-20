import { useEffect } from "react";
import { SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import { LayoutRenderer } from "@/components/LayoutRenderer";
import { TerminalPane } from "@/components/TerminalPane";
import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { useAppStore } from "@/store/app";
import { collectPanes } from "@/lib/layout";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <SquareTerminal className="size-12 opacity-40" />
      <p className="text-sm">從左側 sidebar 開啟設定檔，或直接開一個終端機</p>
      <Button onClick={() => useAppStore.getState().openDefaultPane()}>
        開啟新終端機
      </Button>
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const layout = useAppStore((s) => s.layout);
  const maximizedPaneId = useAppStore((s) => s.maximizedPaneId);

  useEffect(() => {
    void useAppStore.getState().init();
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        載入中…
      </div>
    );
  }

  const maximizedNode =
    maximizedPaneId && layout
      ? (collectPanes(layout).find((p) => p.id === maximizedPaneId) ?? null)
      : null;

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <WorkspaceTabs />
        <div className="min-h-0 flex-1">
          {!layout ? (
            <EmptyState />
          ) : maximizedNode ? (
            <TerminalPane node={maximizedNode} />
          ) : (
            <LayoutRenderer node={layout} />
          )}
        </div>
      </main>
    </div>
  );
}
