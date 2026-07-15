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

export function SettingsDialog({ open, onOpenChange }: Props) {
  const settings = useAppStore((s) => s.settings);
  const [fontFamily, setFontFamily] = useState("");
  const [fontSize, setFontSize] = useState("");

  useEffect(() => {
    if (open) {
      setFontFamily(settings.fontFamily);
      setFontSize(String(settings.fontSize));
    }
  }, [open, settings]);

  function save() {
    const family = fontFamily.trim();
    const size = Number(fontSize);
    if (family) useAppStore.getState().updateSettings({ fontFamily: family });
    if (Number.isFinite(size) && size > 0) {
      useAppStore.getState().updateSettings({ fontSize: size });
    }
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
        </div>
        <DialogFooter>
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
