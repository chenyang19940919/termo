export interface ShellInfo {
  name: string;
  path: string;
  args: string[];
}

export interface Profile {
  id: string;
  name: string;
  shellName: string;
  shellPath: string;
  args: string[];
  cwd: string;
  /** 視覺識別色（hex），null 表示未設定 */
  color: string | null;
  /** 所屬資料夾 id，null 表示在根目錄 */
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  collapsed?: boolean;
}

/** 儲存的常用指令，跟 profile 無關——點了就送進目前 focus 的 terminal */
export interface Command {
  id: string;
  name: string;
  command: string;
  folderId: string | null;
}

/** 一個 pane 開啟當下的設定快照，profile 之後被改或刪不影響已開啟的 pane */
export interface PaneSpec {
  name: string;
  shellPath: string;
  args: string[];
  cwd: string;
  color?: string | null;
}

export type Direction = "horizontal" | "vertical";

export interface PaneNode {
  type: "pane";
  id: string;
  spec: PaneSpec;
}

export interface SplitNode {
  type: "split";
  id: string;
  direction: Direction;
  children: LayoutNode[];
  sizes: number[];
}

export type LayoutNode = PaneNode | SplitNode;
