import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-input px-2 py-1.5 text-sm">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-5 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const settings = useAppStore((s) => s.settings);
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState("");
  const [background, setBackground] = useState("#09090b");
  const [foreground, setForeground] = useState("#e4e4e7");
  const [cursorColor, setCursorColor] = useState("#e4e4e7");
  const [selectionBackground, setSelectionBackground] = useState("#3f3f46");
  const [scrollback, setScrollback] = useState("");

  useEffect(() => {
    if (open) {
      setFontFamily(settings.fontFamily);
      setFontSize(String(settings.fontSize));
      setBackground(settings.theme.background ?? "#09090b");
      setForeground(settings.theme.foreground ?? "#e4e4e7");
      setCursorColor(settings.theme.cursor ?? "#e4e4e7");
      setSelectionBackground(settings.theme.selectionBackground ?? "#3f3f46");
      setScrollback(String(settings.scrollback));
    }
  }, [open, settings]);

  function save() {
    const family = fontFamily.trim();
    const size = Number(fontSize);
    const lines = Number(scrollback);
    useAppStore.getState().updateSettings({
      ...(family && { fontFamily: family }),
      ...(Number.isFinite(size) && size > 0 && { fontSize: size }),
      ...(Number.isFinite(lines) && lines >= 0 && { scrollback: lines }),
      theme: {
        background,
        foreground,
        cursor: cursorColor,
        selectionBackground,
      },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="settings-font">終端機字型</Label>
            <Input
              id="settings-font"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder='"MesloLGM Nerd Font Mono", Consolas, monospace'
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <p className="text-xs text-muted-foreground">
              填入電腦上已安裝的字型名稱（例如你自己的 Nerd Font），可用逗號分隔多個
              fallback 字型。
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-font-size">字型大小</Label>
            <Input
              id="settings-font-size"
              type="number"
              min={1}
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-scrollback">Scrollback 行數</Label>
            <Input
              id="settings-scrollback"
              type="number"
              min={0}
              value={scrollback}
              onChange={(e) => setScrollback(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div className="grid gap-2">
            <Label>終端機配色</Label>
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="背景" value={background} onChange={setBackground} />
              <ColorField label="文字" value={foreground} onChange={setForeground} />
              <ColorField label="游標" value={cursorColor} onChange={setCursorColor} />
              <ColorField
                label="選取範圍"
                value={selectionBackground}
                onChange={setSelectionBackground}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="mr-auto text-muted-foreground"
            onClick={() => useAppStore.getState().resetSettings()}
          >
            重設為預設值
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={save}
            disabled={!fontFamily.trim() || !(Number(fontSize) > 0)}
          >
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
