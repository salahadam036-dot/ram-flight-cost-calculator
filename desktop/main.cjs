const { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const HOST = "127.0.0.1";
const PORT = 8000;
const ROOT = path.join(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const FRONTEND_DIST = app.isPackaged
  ? path.join(process.resourcesPath, "dist")
  : path.join(ROOT, "frontend", "dist");
const ICON = path.join(__dirname, "assets", "icon.png");
const PYTHON = process.env.RAM_PYTHON || (process.platform === "win32" ? "python" : "python3");

let backendProc = null;
let mainWindow = null;
let isMaximized = false;
let preMaximizeBounds = null;

// ── Zoom (echelle de l'interface) ─────────────────────────────────────────────
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
let zoomFactor = 1;

function zoomPath() {
  return path.join(app.getPath("userData"), "zoom.json");
}
function loadZoom() {
  try {
    const v = JSON.parse(fs.readFileSync(zoomPath(), "utf8")).zoom;
    return typeof v === "number" ? v : 1;
  } catch {
    return 1;
  }
}
function saveZoom(z) {
  try {
    fs.writeFileSync(zoomPath(), JSON.stringify({ zoom: z }));
  } catch {
    /* ignore */
  }
}
function applyZoom(z) {
  zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
  if (mainWindow) mainWindow.webContents.setZoomFactor(zoomFactor);
  saveZoom(zoomFactor);
  if (mainWindow) mainWindow.webContents.send("zoom:changed", zoomFactor);
}

// ── Instance unique ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.disableHardwareAcceleration();
app.setName("RAM Flight Cost Calculator");

// ── Backend ───────────────────────────────────────────────────────────────────
function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureBackend() {
  // Backend deja joignable (ex: conteneur Docker sur le port 8000).
  if (await healthCheck()) return true;

  // En developpement uniquement : on demarre le backend Python local.
  if (process.env.RAM_DEV !== "1") return false;

  backendProc = spawn(
    PYTHON,
    ["-m", "uvicorn", "app.main:app", "--host", HOST, "--port", String(PORT)],
    { cwd: BACKEND_DIR, stdio: "ignore", env: { ...process.env } },
  );
  backendProc.on("exit", () => {
    backendProc = null;
  });

  for (let i = 0; i < 60; i++) {
    if (await healthCheck()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Fenetre native ────────────────────────────────────────────────────────────
function createWindow() {
  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    maximizable: true,
    fullscreenable: true,
    resizable: true,
    frame: isMac, // frameless sur Windows/Linux, native (avec inset) sur macOS
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    autoHideMenuBar: true,
    backgroundColor: "#0B1220",
    icon: ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setZoomFactor(zoomFactor);

  mainWindow.loadFile(path.join(FRONTEND_DIST, "index.html"));

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Liens externes -> navigateur systeme
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("maximize", () => {
    isMaximized = true;
    mainWindow.webContents.send("window:maximized", true);
  });
  mainWindow.on("unmaximize", () => {
    isMaximized = false;
    preMaximizeBounds = null;
    mainWindow.webContents.send("window:maximized", false);
  });
  mainWindow.on("enter-full-screen", () => mainWindow.webContents.send("window:fullscreen", true));
  mainWindow.on("leave-full-screen", () => mainWindow.webContents.send("window:fullscreen", false));

  // Echap quitte le plein ecran, F11 le bascule
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "Escape" && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    } else if (input.key === "F11") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC contrôles de fenetre ──────────────────────────────────────────────────
ipcMain.on("window:minimize", () => mainWindow?.minimize());
function setMaximized(value) {
  if (!mainWindow) return;
  if (value) {
    preMaximizeBounds = mainWindow.getBounds();
    mainWindow.setBounds(screen.getDisplayMatching(preMaximizeBounds).workArea);
    isMaximized = true;
  } else {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else if (preMaximizeBounds) mainWindow.setBounds(preMaximizeBounds);
    preMaximizeBounds = null;
    isMaximized = false;
  }
  mainWindow.webContents.send("window:maximized", isMaximized);
}

ipcMain.on("window:maximize", () => setMaximized(!isMaximized));
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("window:isMaximized", () => isMaximized);
ipcMain.on("window:fullscreen", () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.handle("window:isFullScreen", () => mainWindow?.isFullScreen() ?? false);
ipcMain.on("zoom:in", () => applyZoom(zoomFactor + ZOOM_STEP));
ipcMain.on("zoom:out", () => applyZoom(zoomFactor - ZOOM_STEP));
ipcMain.on("zoom:reset", () => applyZoom(1));
ipcMain.handle("zoom:get", () => zoomFactor);

// ── Cycle de vie ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  zoomFactor = loadZoom();
  const backendReady = await ensureBackend();
  if (!backendReady) {
    dialog.showMessageBox({
      type: "warning",
      title: "Backend non demarre",
      message: "Le backend FastAPI n'est pas joignable sur le port 8000.",
      detail:
        "Demarrez-le avec Docker :\n\n" +
        "  docker compose up -d\n\n" +
        "puis relancez l'application.",
    });
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (backendProc) {
    backendProc.kill();
    backendProc = null;
  }
});
