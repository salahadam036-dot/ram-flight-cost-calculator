const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizedChange: (cb) => {
    const listener = (_event, value) => cb(value);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  toggleFullscreen: () => ipcRenderer.send("window:fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
  onFullScreenChange: (cb) => {
    const listener = (_event, value) => cb(value);
    ipcRenderer.on("window:fullscreen", listener);
    return () => ipcRenderer.removeListener("window:fullscreen", listener);
  },
  zoomIn: () => ipcRenderer.send("zoom:in"),
  zoomOut: () => ipcRenderer.send("zoom:out"),
  zoomReset: () => ipcRenderer.send("zoom:reset"),
  getZoom: () => ipcRenderer.invoke("zoom:get"),
  onZoomChange: (cb) => {
    const listener = (_event, value) => cb(value);
    ipcRenderer.on("zoom:changed", listener);
    return () => ipcRenderer.removeListener("zoom:changed", listener);
  },
});
