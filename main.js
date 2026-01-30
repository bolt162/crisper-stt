const {
  app,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  clipboard,
  shell,
  screen,
  dialog,
  desktopCapturer,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { execSync } = require("child_process");
const FormData = require("form-data");
const { uIOhook, UiohookKey } = require("uiohook-napi");

// Suppress ALL error dialogs
dialog.showErrorBox = () => {};

// Catch uncaught exceptions silently
process.on("uncaughtException", () => {});

let mainWindow;
let floatingButton;
let isRecording = false;
let GROQ_API_KEY = null;
let currentPttKey = "AltRight"; // Default PTT key

// Config file path for storing settings
const configPath = path.join(app.getPath("userData"), "config.json");

// Map of key codes from browser to uiohook
const keyCodeMap = {
  "AltRight": UiohookKey.AltRight,
  "AltLeft": UiohookKey.AltLeft,
  "ControlRight": UiohookKey.CtrlRight,
  "ControlLeft": UiohookKey.CtrlLeft,
  "ShiftRight": UiohookKey.ShiftRight,
  "ShiftLeft": UiohookKey.ShiftLeft,
  "MetaRight": UiohookKey.MetaRight,
  "MetaLeft": UiohookKey.MetaLeft,
  "Space": UiohookKey.Space,
  "CapsLock": UiohookKey.CapsLock,
  "Tab": UiohookKey.Tab,
  "Backquote": UiohookKey.Backquote,
};

// Load config from file
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      GROQ_API_KEY = config.apiKey || null;
      currentPttKey = config.pttKey || "AltRight";
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
}

// Save config to file
function saveConfig(updates) {
  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    config = { ...config, ...updates };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save config:", error);
    return false;
  }
}

// Load API key from config file
function loadApiKey() {
  loadConfig();
  return GROQ_API_KEY;
}

// Save API key to config file
function saveApiKey(apiKey) {
  const success = saveConfig({ apiKey });
  if (success) {
    GROQ_API_KEY = apiKey;
  }
  return success;
}

// Get PTT key setting
function getPttKey() {
  return currentPttKey;
}

// Set PTT key setting
function setPttKey(keyCode) {
  const success = saveConfig({ pttKey: keyCode });
  if (success) {
    currentPttKey = keyCode;
    // Re-register push-to-talk with new key
    reregisterPushToTalk();
  }
  return success;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 500,
    resizable: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");

  // Quit app when main window is closed
  mainWindow.on("close", () => {
    app.isQuitting = true;
    app.quit();
  });
}

function createFloatingButton() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  floatingButton = new BrowserWindow({
    width: 100,
    height: 100,
    x: Math.round(width / 2 - 50),
    y: height - 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-floating.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  floatingButton.loadFile("floating.html");

  // Make the window draggable but still clickable
  floatingButton.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Prevent closing the floating button
  floatingButton.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
    }
  });
}

// Check accessibility permission using AppleScript (more reliable real-time check)
function checkAccessibilityPermission() {
  try {
    // Try to perform a simple accessibility action
    // If it succeeds without error, we have permission
    execSync(
      `osascript -e 'tell application "System Events" to return name of first process'`,
      { timeout: 2000, stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    // If it fails, check if it's a permission error or something else
    // Also fall back to Electron's check
    return systemPreferences.isTrustedAccessibilityClient(false);
  }
}

// Check screen recording permission by actually testing it
async function checkScreenRecordingPermission() {
  try {
    // Try to get sources - this will fail or return empty if permission not granted
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    return sources && sources.length > 0;
  } catch (e) {
    return false;
  }
}

// Get current permission status without prompting
async function getPermissionStatus() {
  const micStatus = systemPreferences.getMediaAccessStatus("microphone");
  const screenGranted = await checkScreenRecordingPermission();
  const accessibilityEnabled = checkAccessibilityPermission();

  return {
    microphone: micStatus === "granted",
    screen: screenGranted,
    accessibility: accessibilityEnabled,
  };
}

// Request microphone permission (will prompt user)
async function requestMicrophonePermission() {
  const currentStatus = systemPreferences.getMediaAccessStatus("microphone");

  if (currentStatus === "granted") {
    return { granted: true, status: "granted" };
  }

  // "not-determined" means the user hasn't been asked yet - dialog will appear
  // "denied" means user denied it before - need to go to System Preferences
  // "restricted" means parental controls or MDM restricts it
  if (currentStatus === "denied" || currentStatus === "restricted") {
    // Can't show dialog again, need to open System Preferences
    shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
    );
    return { granted: false, status: currentStatus, openedSettings: true };
  }

  // This will trigger the system permission dialog (only works if "not-determined")
  const granted = await systemPreferences.askForMediaAccess("microphone");
  return { granted, status: granted ? "granted" : "denied" };
}

// Open screen recording settings in System Preferences
function openScreenRecordingSettings() {
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  );
}

// Open accessibility settings in System Preferences
function openAccessibilitySettings() {
  // This opens System Preferences to the Accessibility pane
  // The 'true' parameter will prompt user if not already trusted
  systemPreferences.isTrustedAccessibilityClient(true);

  // Also open the System Preferences directly
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
  );
}

// Get the uiohook key code for the current PTT key
function getPttKeyCode() {
  return keyCodeMap[currentPttKey] || UiohookKey.AltRight;
}

// Get display name for current PTT key
function getPttKeyDisplayName() {
  const keyNames = {
    "AltRight": "Right Option",
    "AltLeft": "Left Option",
    "ControlRight": "Right Control",
    "ControlLeft": "Left Control",
    "ShiftRight": "Right Shift",
    "ShiftLeft": "Left Shift",
    "MetaRight": "Right Command",
    "MetaLeft": "Left Command",
    "Space": "Space",
    "CapsLock": "Caps Lock",
    "Tab": "Tab",
    "Backquote": "` (Backtick)",
  };
  return keyNames[currentPttKey] || currentPttKey;
}

function registerPushToTalk() {
  const pttKeyCode = getPttKeyCode();

  uIOhook.on("keydown", (event) => {
    if (event.keycode === pttKeyCode && !isRecording) {
      console.log(`${getPttKeyDisplayName()} pressed - starting recording`);
      startRecording(true);
    }
  });

  uIOhook.on("keyup", (event) => {
    if (event.keycode === pttKeyCode && isRecording) {
      console.log(`${getPttKeyDisplayName()} released - stopping recording`);
      stopRecording(true);
    }
  });

  // Start the hook
  uIOhook.start();

  console.log(`Push-to-talk registered: Hold ${getPttKeyDisplayName()} key to record`);
}

function reregisterPushToTalk() {
  // Stop and restart uIOhook with new key
  uIOhook.stop();

  // Remove all listeners
  uIOhook.removeAllListeners("keydown");
  uIOhook.removeAllListeners("keyup");

  // Get the new key code
  const pttKeyCode = getPttKeyCode();

  // Re-add listeners with new key
  uIOhook.on("keydown", (event) => {
    if (event.keycode === pttKeyCode && !isRecording) {
      console.log(`${getPttKeyDisplayName()} pressed - starting recording`);
      startRecording(true);
    }
  });

  uIOhook.on("keyup", (event) => {
    if (event.keycode === pttKeyCode && isRecording) {
      console.log(`${getPttKeyDisplayName()} released - stopping recording`);
      stopRecording(true);
    }
  });

  // Restart the hook
  uIOhook.start();

  console.log(`Push-to-talk updated: Hold ${getPttKeyDisplayName()} key to record`);
}

// Helper to safely send to a window
function safeSend(win, channel, data) {
  try {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, data);
    }
  } catch (e) {
    // Window was destroyed, ignore
  }
}

function startRecording(fromHotkey = false) {
  if (isRecording) return;
  isRecording = true;
  console.log("Starting recording...");
  // Send to floating button to start recording
  safeSend(floatingButton, "recording-state", { recording: true, fromHotkey });
  // Send to main window for UI update only
  safeSend(mainWindow, "recording-state", { recording: true, fromHotkey });
}

function stopRecording(fromHotkey = false) {
  if (!isRecording) return;
  isRecording = false;
  console.log("Stopping recording...");
  // Send to floating button to stop recording
  safeSend(floatingButton, "recording-state", { recording: false, fromHotkey });
  // Send to main window for UI update only
  safeSend(mainWindow, "recording-state", { recording: false, fromHotkey });
}

async function transcribeAudio(audioBuffer) {
  return new Promise((resolve, reject) => {
    if (!GROQ_API_KEY) {
      reject(new Error("API key not configured. Please set your Groq API key."));
      return;
    }

    // Save buffer to temp file
    const tempPath = path.join(app.getPath("temp"), `recording-${Date.now()}.webm`);
    fs.writeFileSync(tempPath, audioBuffer);

    const form = new FormData();
    form.append("file", fs.createReadStream(tempPath), {
      filename: "audio.webm",
      contentType: "audio/webm",
    });
    form.append("model", "whisper-large-v3");

    const options = {
      hostname: "api.groq.com",
      port: 443,
      path: "/openai/v1/audio/transcriptions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        ...form.getHeaders(),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.error("Failed to delete temp file:", e);
        }

        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve(response.text);
          } catch (e) {
            reject(new Error("Failed to parse response"));
          }
        } else {
          console.error("API Error:", res.statusCode, data);
          // Parse error and return user-friendly message
          let errorMessage = "Transcription failed";
          try {
            const errorData = JSON.parse(data);
            if (errorData.error) {
              if (errorData.error.code === "invalid_api_key" || res.statusCode === 401) {
                errorMessage = "Invalid API key";
              } else if (errorData.error.message) {
                errorMessage = errorData.error.message;
              }
            }
          } catch (e) {
            if (res.statusCode === 401) {
              errorMessage = "Invalid API key";
            } else if (res.statusCode === 429) {
              errorMessage = "Rate limit exceeded. Please try again.";
            }
          }
          reject(new Error(errorMessage));
        }
      });
    });

    req.on("error", (error) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        console.error("Failed to delete temp file:", e);
      }
      reject(error);
    });

    form.pipe(req);
  });
}

function typeText(text) {
  // Copy to clipboard
  clipboard.writeText(text);
  console.log("Text copied to clipboard:", text.substring(0, 50));

  // Try auto-paste with a small delay to let focus return to the previous app
  setTimeout(() => {
    autoPasteWithRetry(3);
  }, 150);

  // Send to renderer for display
  safeSend(mainWindow, "transcription-result", { text });
  safeSend(floatingButton, "transcription-result", { text });
}

function autoPasteWithRetry(retriesLeft) {
  if (retriesLeft <= 0) {
    console.log("Auto-paste failed after all retries. Text is in clipboard - paste manually with Cmd+V");
    return;
  }

  try {
    console.log(`Attempting auto-paste (${retriesLeft} tries left)...`);

    // Use a more robust AppleScript that checks for frontmost app first
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        if frontApp is not "Electron" and frontApp is not "whisper-clone" then
          keystroke "v" using command down
        end if
      end tell
    `;

    execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      timeout: 2000,
      stdio: 'pipe'
    });
    console.log("Auto-paste successful");
  } catch (e) {
    console.log(`Auto-paste attempt failed: ${e.message}`);
    // Retry after a short delay
    setTimeout(() => {
      autoPasteWithRetry(retriesLeft - 1);
    }, 200);
  }
}

// IPC Handlers
ipcMain.handle("start-recording", () => {
  startRecording();
});

ipcMain.handle("stop-recording", () => {
  stopRecording();
});

ipcMain.handle("transcribe", async (_event, audioData) => {
  try {
    safeSend(mainWindow, "transcription-status", { status: "transcribing" });
    safeSend(floatingButton, "transcription-status", { status: "transcribing" });
    const buffer = Buffer.from(audioData);
    const text = await transcribeAudio(buffer);
    typeText(text);
    return { success: true, text };
  } catch (error) {
    console.error("Transcription error:", error);
    safeSend(mainWindow, "transcription-status", { status: "error", error: error.message });
    return { success: false, error: error.message };
  }
});

// Permission handlers
ipcMain.handle("get-permission-status", async () => {
  return await getPermissionStatus();
});

ipcMain.handle("request-microphone-permission", async () => {
  return await requestMicrophonePermission();
});

ipcMain.handle("open-accessibility-settings", () => {
  openAccessibilitySettings();
  return { opened: true };
});

ipcMain.handle("open-screen-recording-settings", () => {
  openScreenRecordingSettings();
  return { opened: true };
});

// API Key handlers
ipcMain.handle("get-api-key-status", () => {
  loadApiKey();
  return { hasApiKey: !!GROQ_API_KEY };
});

ipcMain.handle("save-api-key", (event, apiKey) => {
  const success = saveApiKey(apiKey);
  return { success };
});

// PTT Key handlers
ipcMain.handle("get-ptt-key", () => {
  return { pttKey: getPttKey() };
});

ipcMain.handle("set-ptt-key", (event, keyCode) => {
  const success = setPttKey(keyCode);
  return { success };
});

ipcMain.handle("open-external-url", (event, url) => {
  shell.openExternal(url);
});

// Handler to show main window
ipcMain.handle("show-main-window", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Handler to move floating window (for dragging) - using 'on' instead of 'handle' for better performance
ipcMain.on("move-floating-window", (_event, deltaX, deltaY) => {
  if (floatingButton && !floatingButton.isDestroyed()) {
    const [x, y] = floatingButton.getPosition();
    floatingButton.setPosition(x + deltaX, y + deltaY);
  }
});

// Handler to quit the app
ipcMain.handle("quit-app", () => {
  app.isQuitting = true;
  app.quit();
});

// Handler for renderer logging (so we can see logs in terminal)
ipcMain.handle("renderer-log", (_event, message) => {
  console.log("[Renderer]", message);
});

// Handler for getting desktop sources (for system audio capture)
ipcMain.handle("get-desktop-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 }
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (error) {
    console.error("Failed to get desktop sources:", error);
    return [];
  }
});

// App lifecycle
app.whenReady().then(() => {
  // Load config (API key and PTT key) before creating windows
  loadConfig();

  createWindow();
  createFloatingButton();
  registerPushToTalk();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on("window-all-closed", () => {
  // Don't quit on macOS when windows are closed
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  uIOhook.stop();
});
