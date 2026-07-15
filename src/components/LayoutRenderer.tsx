import { Fragment } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TerminalPane } from "@/components/TerminalPane";
import { useAppStore } from "@/store/app";
import type { LayoutNode } from "@/types";

export function LayoutRenderer({ node }: { node: LayoutNode }) {
  if (node.type === "pane") {
    return <TerminalPane node={node} />;
  }

  const fallback = 100 / node.children.length;
  const defaultLayout = Object.fromEntries(
    node.children.map((c, i) => [c.id, node.sizes[i] ?? fallback]),
  );

  return (
    <ResizablePanelGroup
      id={node.id}
      orientation={node.direction}
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction) return;
        useAppStore
          .getState()
          .setSizes(
            node.id,
            node.children.map((c) => layout[c.id] ?? fallback),
          );
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <ResizableHandle />}
          <ResizablePanel
            id={child.id}
            minSize="8"
            style={{ overflow: "hidden" }}
          >
            <LayoutRenderer node={child} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}
