import { useEffect } from "react";
import { SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import { LayoutRenderer } from "@/components/LayoutRenderer";
import { useAppStore } from "@/store/app";

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

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        {layout ? <LayoutRenderer node={layout} /> : <EmptyState />}
      </main>
    </div>
  );
}
