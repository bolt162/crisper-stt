const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Recording controls
  startRecording: () => ipcRenderer.invoke("start-recording"),
  stopRecording: () => ipcRenderer.invoke("stop-recording"),

  // Transcription
  transcribe: (audioData) => ipcRenderer.invoke("transcribe", audioData),

  // Permissions
  getPermissionStatus: () => ipcRenderer.invoke("get-permission-status"),
  requestMicrophonePermission: () => ipcRenderer.invoke("request-microphone-permission"),
  openScreenRecordingSettings: () => ipcRenderer.invoke("open-screen-recording-settings"),
  openAccessibilitySettings: () => ipcRenderer.invoke("open-accessibility-settings"),

  // API Key
  getApiKeyStatus: () => ipcRenderer.invoke("get-api-key-status"),
  saveApiKey: (apiKey) => ipcRenderer.invoke("save-api-key", apiKey),

  // PTT Key
  getPttKey: () => ipcRenderer.invoke("get-ptt-key"),
  setPttKey: (keyCode) => ipcRenderer.invoke("set-ptt-key", keyCode),

  // External URLs
  openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url),

  // Event listeners from main process
  onPermissionStatus: (callback) => {
    ipcRenderer.on("permission-status", (_event, status) => callback(status));
  },

  onRecordingState: (callback) => {
    ipcRenderer.on("recording-state", (_event, state) => callback(state));
  },

  onTranscriptionStatus: (callback) => {
    ipcRenderer.on("transcription-status", (_event, status) => callback(status));
  },

  onTranscriptionResult: (callback) => {
    ipcRenderer.on("transcription-result", (_event, result) => callback(result));
  },

  // Accessibility permission events
  onAccessibilityRelaunchNeeded: (callback) => {
    ipcRenderer.on("accessibility-relaunch-needed", () => callback());
  },
  onAccessibilityGranted: (callback) => {
    ipcRenderer.on("accessibility-granted", () => callback());
  },

  // Quit app
  quitApp: () => ipcRenderer.invoke("quit-app"),
});
