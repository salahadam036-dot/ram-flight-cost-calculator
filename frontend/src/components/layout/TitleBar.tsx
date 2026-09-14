import { useEffect, useState } from "react";
import { Copy, Maximize2, Minus, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const api = window.electronAPI;
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!api) return;
    api.isMaximized().then(setMaximized);
    api.isFullScreen().then(setFullscreen);
    api.getZoom().then(setZoom);
    const offMax = api.onMaximizedChange(setMaximized);
    const offFs = api.onFullScreenChange(setFullscreen);
    const offZoom = api.onZoomChange(setZoom);
    return () => {
      offMax();
      offFs();
      offZoom();
    };
  }, [api]);

  // Rendu uniquement dans Electron, pas sur macOS (traffic lights natifs).
  if (!api || api.platform === "darwin") return null;

  // En plein ecran, la titlebar disparait (Echap pour quitter).
  if (fullscreen) return null;

  const pct = `${Math.round(zoom * 100)}%`;

  return (
    <div
      className="drag-region flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-card"
      onDoubleClick={() => api.toggleMaximize()}
    >
      <div className="flex items-center gap-3 px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
            RAM
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Royal Air Maroc — Flight Cost Calculator
          </span>
        </div>

        <div className="no-drag flex items-center overflow-hidden rounded-md border border-border">
          <button
            type="button"
            title="Zoom arrière"
            aria-label="Zoom arrière"
            onClick={() => api.zoomOut()}
            className="flex h-6 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Réinitialiser le zoom"
            onClick={() => api.zoomReset()}
            className="h-6 w-12 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {pct}
          </button>
          <button
            type="button"
            title="Zoom avant"
            aria-label="Zoom avant"
            onClick={() => api.zoomIn()}
            className="flex h-6 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="no-drag flex h-full items-center">
        <WindowButton label="Minimiser" onClick={() => api.minimize()}>
          <Minus className="h-4 w-4" />
        </WindowButton>
        <WindowButton
          label={maximized ? "Restaurer" : "Agrandir"}
          onClick={() => api.toggleMaximize()}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </WindowButton>
        <WindowButton label="Plein écran" onClick={() => api.toggleFullscreen()}>
          <Maximize2 className="h-4 w-4" />
        </WindowButton>
        <WindowButton
          label="Fermer"
          onClick={() => api.close()}
          className="hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-4 w-4" />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  children,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
