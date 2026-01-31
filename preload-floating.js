const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the floating button renderer
contextBridge.exposeInMainWorld("floatingAPI", {
  // Log to main process (so it appears in terminal)
  log: (...args) => ipcRenderer.invoke("renderer-log", args.join(" ")),

  // Recording controls
  startRecording: () => ipcRenderer.invoke("start-recording"),
  stopRecording: () => ipcRenderer.invoke("stop-recording"),

  // Transcription
  transcribe: (audioData) => ipcRenderer.invoke("transcribe", audioData),

  // Show main window
  showMainWindow: () => ipcRenderer.invoke("show-main-window"),

  // Move window (for dragging) - using send instead of invoke for better performance
  moveWindow: (deltaX, deltaY) => ipcRenderer.send("move-floating-window", deltaX, deltaY),

  // Quit app
  quitApp: () => ipcRenderer.invoke("quit-app"),

  // Get desktop capturer sources for system audio (via main process)
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),

  // Event listeners from main process
  onRecordingState: (callback) => {
    ipcRenderer.on("recording-state", (_event, state) => callback(state));
  },

  onTranscriptionStatus: (callback) => {
    ipcRenderer.on("transcription-status", (_event, status) => callback(status));
  },

  onTranscriptionResult: (callback) => {
    ipcRenderer.on("transcription-result", (_event, result) => callback(result));
  },
});
