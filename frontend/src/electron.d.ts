export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
      toggleFullscreen: () => void;
      isFullScreen: () => Promise<boolean>;
      onFullScreenChange: (cb: (fullscreen: boolean) => void) => () => void;
      zoomIn: () => void;
      zoomOut: () => void;
      zoomReset: () => void;
      getZoom: () => Promise<number>;
      onZoomChange: (cb: (zoom: number) => void) => () => void;
    };
  }
}
