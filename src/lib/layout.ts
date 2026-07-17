import type { Direction, LayoutNode, PaneNode } from "@/types";

export function genId(): string {
  return crypto.randomUUID();
}

function evenSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

export function collectPanes(node: LayoutNode | null): PaneNode[] {
  if (!node) return [];
  if (node.type === "pane") return [node];
  return node.children.flatMap(collectPanes);
}

/** 從樹中移除指定 pane，只剩單一子節點的 split 會被攤平 */
export function removePane(node: LayoutNode, id: string): LayoutNode | null {
  if (node.type === "pane") return node.id === id ? null : node;
  const children = node.children
    .map((c) => removePane(c, id))
    .filter((c): c is LayoutNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  if (children.length === node.children.length) {
    return { ...node, children };
  }
  return { ...node, children, sizes: evenSizes(children.length) };
}

/**
 * 在 targetId 這個 pane 旁邊插入 newPane（position 決定插在前面還是後面）。
 * 若 target 的父 split 方向相同就直接插進去，否則把 target 包成新的 split。
 */
export function splitPane(
  node: LayoutNode,
  targetId: string,
  direction: Direction,
  newPane: PaneNode,
  position: "before" | "after" = "after",
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== targetId) return node;
    return {
      type: "split",
      id: genId(),
      direction,
      children: position === "before" ? [newPane, node] : [node, newPane],
      sizes: [50, 50],
    };
  }
  const idx = node.children.findIndex(
    (c) => c.type === "pane" && c.id === targetId,
  );
  if (idx !== -1 && node.direction === direction) {
    const children = [...node.children];
    children.splice(position === "before" ? idx : idx + 1, 0, newPane);
    return { ...node, children, sizes: evenSizes(children.length) };
  }
  return {
    ...node,
    children: node.children.map((c) =>
      splitPane(c, targetId, direction, newPane, position),
    ),
  };
}

/** 從樹中取出並移除某個 pane，回傳 [移除後的樹, 被取出的 pane]；找不到就回傳 [node, null] */
export function extractPane(
  node: LayoutNode,
  id: string,
): [LayoutNode | null, PaneNode | null] {
  if (node.type === "pane") {
    return node.id === id ? [null, node] : [node, null];
  }
  let extracted: PaneNode | null = null;
  const children = node.children
    .map((c) => {
      const [next, found] = extractPane(c, id);
      if (found) extracted = found;
      return next;
    })
    .filter((c): c is LayoutNode => c !== null);
  if (!extracted) return [node, null];
  if (children.length === 0) return [null, extracted];
  if (children.length === 1) return [children[0], extracted];
  return [{ ...node, children, sizes: evenSizes(children.length) }, extracted];
}

/** 把 sourceId 這個既有 pane 搬到 targetId 旁邊（保留 pane id，讓底下的 terminal session 跟著搬過去） */
export function relocatePane(
  root: LayoutNode,
  sourceId: string,
  targetId: string,
  direction: Direction,
  position: "before" | "after",
): LayoutNode {
  if (sourceId === targetId) return root;
  const [rest, source] = extractPane(root, sourceId);
  if (!rest || !source) return root;
  return splitPane(rest, targetId, direction, source, position);
}

export function setSplitSizes(
  node: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId) return { ...node, sizes };
  return {
    ...node,
    children: node.children.map((c) => setSplitSizes(c, splitId, sizes)),
  };
}
