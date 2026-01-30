// DOM Elements - Screens
const apiKeyScreen = document.getElementById("apiKeyScreen");
const microphoneScreen = document.getElementById("microphoneScreen");
const screenRecordingScreen = document.getElementById("screenRecordingScreen");
const accessibilityScreen = document.getElementById("accessibilityScreen");
const mainScreen = document.getElementById("mainScreen");

// DOM Elements - API Key Screen
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyError = document.getElementById("apiKeyError");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const getApiKeyLink = document.getElementById("getApiKeyLink");
const step0Dot = document.getElementById("step0Dot");

// DOM Elements - Microphone Screen
const requestMicBtn = document.getElementById("requestMicBtn");
const micPermissionStatus = document.getElementById("micPermissionStatus");
const micStatusText = document.getElementById("micStatusText");
const micWaiting = document.getElementById("micWaiting");
const step1Dot = document.getElementById("step1Dot");
const step2Dot = document.getElementById("step2Dot");
const step3Dot = document.getElementById("step3Dot");

// DOM Elements - Screen Recording Screen
const openScreenRecordingBtn = document.getElementById("openScreenRecordingBtn");
const screenPermissionStatus = document.getElementById("screenPermissionStatus");
const screenStatusText = document.getElementById("screenStatusText");
const screenWaiting = document.getElementById("screenWaiting");

// DOM Elements - Accessibility Screen
const openAccessibilityBtn = document.getElementById("openAccessibilityBtn");
const accessPermissionStatus = document.getElementById("accessPermissionStatus");
const accessStatusText = document.getElementById("accessStatusText");
const accessWaiting = document.getElementById("accessWaiting");

// DOM Elements - Main Screen
const recordBtn = document.getElementById("recordBtn");
const statusMessage = document.getElementById("statusMessage");
const transcriptionResult = document.getElementById("transcriptionResult");
const micStatus = document.getElementById("micStatus");
const screenStatus = document.getElementById("screenStatus");
const accessStatus = document.getElementById("accessStatus");
const pttKeyShortcut = document.getElementById("pttKeyShortcut");

// DOM Elements - Sidebar
const sidebar = document.getElementById("sidebar");
const homeBtn = document.getElementById("homeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");

// DOM Elements - Settings Panel
const settingsApiKeyInput = document.getElementById("settingsApiKeyInput");
const saveSettingsApiKeyBtn = document.getElementById("saveSettingsApiKeyBtn");
const apiKeySaveSuccess = document.getElementById("apiKeySaveSuccess");
const keyCaptureBtn = document.getElementById("keyCaptureBtn");
const currentKeyDisplay = document.getElementById("currentKeyDisplay");
const pttKeySaveSuccess = document.getElementById("pttKeySaveSuccess");

// State
let isRecording = false;
let permissionPollInterval = null;
let currentScreen = "apiKey";
let isCapturingKey = false;
let currentPttKey = "AltRight"; // Default key

// Permission states
let permissions = {
  microphone: false,
  screen: false,
  accessibility: false
};

// Initialize
async function init() {
  // Check if API key is already saved
  const apiStatus = await window.electronAPI.getApiKeyStatus();

  if (apiStatus.hasApiKey) {
    // Skip to permissions flow
    currentScreen = "microphone";
    transitionToScreen("microphone");
  }

  // Set up button listeners
  saveApiKeyBtn.addEventListener("click", saveApiKey);
  getApiKeyLink.addEventListener("click", openGroqConsole);
  requestMicBtn.addEventListener("click", handleMicButtonClick);
  openScreenRecordingBtn.addEventListener("click", handleScreenRecordingButtonClick);
  openAccessibilityBtn.addEventListener("click", handleAccessibilityButtonClick);

  // Allow Enter key to submit API key
  apiKeyInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveApiKey();
    }
  });

  // Set up sidebar buttons
  setupSidebar();

  // Set up settings panel
  setupSettingsPanel();

  // Load current PTT key setting
  loadPttKeySetting();

  // Set up IPC listeners
  setupIPCListeners();

  // Check initial permission status
  const status = await window.electronAPI.getPermissionStatus();
  updatePermissionState(status);

  // Start polling for permission changes
  startPermissionPolling();
}

// Set up sidebar navigation
function setupSidebar() {
  homeBtn.addEventListener("click", () => {
    homeBtn.classList.add("active");
    settingsBtn.classList.remove("active");
    settingsPanel.classList.remove("active");
  });

  settingsBtn.addEventListener("click", () => {
    settingsBtn.classList.add("active");
    homeBtn.classList.remove("active");
    settingsPanel.classList.add("active");
  });
}

// Set up settings panel functionality
function setupSettingsPanel() {
  // API Key save button
  saveSettingsApiKeyBtn.addEventListener("click", async () => {
    const apiKey = settingsApiKeyInput.value.trim();

    if (!apiKey || !apiKey.startsWith("gsk_") || apiKey.length < 20) {
      settingsApiKeyInput.style.borderColor = "#ff6b6b";
      return;
    }

    settingsApiKeyInput.style.borderColor = "";
    saveSettingsApiKeyBtn.disabled = true;
    saveSettingsApiKeyBtn.textContent = "Saving...";

    try {
      const result = await window.electronAPI.saveApiKey(apiKey);
      if (result.success) {
        apiKeySaveSuccess.classList.add("visible");
        settingsApiKeyInput.value = "";
        setTimeout(() => apiKeySaveSuccess.classList.remove("visible"), 3000);
      }
    } catch (error) {
      console.error("Error saving API key:", error);
    }

    saveSettingsApiKeyBtn.disabled = false;
    saveSettingsApiKeyBtn.textContent = "Save Key";
  });

  // PTT Key capture button
  keyCaptureBtn.addEventListener("click", startKeyCapture);
}

// Load current PTT key setting
async function loadPttKeySetting() {
  try {
    const config = await window.electronAPI.getPttKey();
    if (config && config.pttKey) {
      currentPttKey = config.pttKey;
      updatePttKeyDisplay(config.pttKey);
    }
  } catch (error) {
    console.error("Error loading PTT key:", error);
  }
}

// Update the PTT key display
function updatePttKeyDisplay(keyCode) {
  const keyName = getKeyDisplayName(keyCode);
  if (currentKeyDisplay) currentKeyDisplay.textContent = keyName;
  if (pttKeyShortcut) pttKeyShortcut.textContent = keyName;
}

// Get a human-readable name for the key code
function getKeyDisplayName(keyCode) {
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
  return keyNames[keyCode] || keyCode;
}

// Start capturing key press for PTT
function startKeyCapture() {
  isCapturingKey = true;
  keyCaptureBtn.textContent = "Press any key...";
  keyCaptureBtn.classList.add("capturing");

  // Listen for keydown event
  const handleKeyDown = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Get the key code
    const keyCode = e.code;

    // Only allow modifier keys and a few others for PTT
    const allowedKeys = [
      "AltRight", "AltLeft",
      "ControlRight", "ControlLeft",
      "ShiftRight", "ShiftLeft",
      "MetaRight", "MetaLeft",
      "Space", "CapsLock", "Tab", "Backquote"
    ];

    if (!allowedKeys.includes(keyCode)) {
      keyCaptureBtn.textContent = "Use a modifier key (Option, Control, Shift, Command)";
      setTimeout(() => {
        keyCaptureBtn.textContent = "Press any key...";
      }, 2000);
      return;
    }

    // Save the new PTT key
    try {
      const result = await window.electronAPI.setPttKey(keyCode);
      if (result.success) {
        currentPttKey = keyCode;
        updatePttKeyDisplay(keyCode);
        pttKeySaveSuccess.classList.add("visible");
        setTimeout(() => pttKeySaveSuccess.classList.remove("visible"), 3000);
      }
    } catch (error) {
      console.error("Error saving PTT key:", error);
    }

    // Stop capturing
    isCapturingKey = false;
    keyCaptureBtn.textContent = "Click to set new key";
    keyCaptureBtn.classList.remove("capturing");

    // Remove this listener
    document.removeEventListener("keydown", handleKeyDown, true);
  };

  document.addEventListener("keydown", handleKeyDown, true);

  // Cancel if clicked again
  const cancelCapture = () => {
    if (isCapturingKey) {
      isCapturingKey = false;
      keyCaptureBtn.textContent = "Click to set new key";
      keyCaptureBtn.classList.remove("capturing");
      document.removeEventListener("keydown", handleKeyDown, true);
    }
    keyCaptureBtn.removeEventListener("click", cancelCapture);
  };

  // Allow cancel by clicking button again after a short delay
  setTimeout(() => {
    keyCaptureBtn.addEventListener("click", cancelCapture);
  }, 100);
}

// Open Groq Console to get API key
function openGroqConsole() {
  window.electronAPI.openExternalUrl("https://console.groq.com/keys");
}

// Save API key
async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();

  // Validate API key format (basic check)
  if (!apiKey || !apiKey.startsWith("gsk_") || apiKey.length < 20) {
    apiKeyError.classList.add("visible");
    apiKeyInput.style.borderColor = "#ff6b6b";
    return;
  }

  apiKeyError.classList.remove("visible");
  apiKeyInput.style.borderColor = "";
  saveApiKeyBtn.disabled = true;
  saveApiKeyBtn.textContent = "Saving...";

  try {
    const result = await window.electronAPI.saveApiKey(apiKey);

    if (result.success) {
      step0Dot.classList.add("completed");
      transitionToScreen("microphone");
    } else {
      apiKeyError.textContent = "Failed to save API key. Please try again.";
      apiKeyError.classList.add("visible");
    }
  } catch (error) {
    console.error("Error saving API key:", error);
    apiKeyError.textContent = "Error saving API key.";
    apiKeyError.classList.add("visible");
  }

  saveApiKeyBtn.disabled = false;
  saveApiKeyBtn.textContent = "Save & Continue";
}

// Start polling for permission status changes
function startPermissionPolling() {
  // Poll every 500ms to detect permission changes in real-time
  permissionPollInterval = setInterval(async () => {
    const status = await window.electronAPI.getPermissionStatus();
    updatePermissionState(status);
  }, 500);
}

// Update permission state and UI
function updatePermissionState(status) {
  permissions.microphone = status.microphone;
  permissions.screen = status.screen;
  permissions.accessibility = status.accessibility;

  // Update microphone screen UI
  updateMicrophoneUI();

  // Update screen recording screen UI
  updateScreenRecordingUI();

  // Update accessibility screen UI
  updateAccessibilityUI();

  // Update main screen status dots
  if (micStatus) micStatus.classList.toggle("granted", permissions.microphone);
  if (screenStatus) screenStatus.classList.toggle("granted", permissions.screen);
  if (accessStatus) accessStatus.classList.toggle("granted", permissions.accessibility);

  // Don't auto-transition - let user click Continue button to proceed
}

// Button click handlers that check permission state
function handleMicButtonClick() {
  if (permissions.microphone) {
    transitionToScreen("screenRecording");
  } else {
    requestMicrophonePermission();
  }
}

function handleScreenRecordingButtonClick() {
  if (permissions.screen) {
    transitionToScreen("accessibility");
  } else {
    openScreenRecordingSettings();
  }
}

function handleAccessibilityButtonClick() {
  if (permissions.accessibility) {
    transitionToScreen("main");
  } else {
    openAccessibilitySettings();
  }
}

// Update microphone permission UI
function updateMicrophoneUI() {
  if (!micPermissionStatus) return;

  if (permissions.microphone) {
    micPermissionStatus.classList.remove("denied");
    micPermissionStatus.classList.add("granted");
    micStatusText.innerHTML = '<svg class="check-icon" viewBox="0 0 24 24"><path fill="#2ed573" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Granted';
    requestMicBtn.textContent = "Continue";
    micWaiting.style.display = "none";
    if (step1Dot) step1Dot.classList.add("completed");
  } else {
    micPermissionStatus.classList.remove("granted");
    micStatusText.innerHTML = '<svg class="x-icon" viewBox="0 0 24 24"><path fill="#ff4757" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> Not granted';
    requestMicBtn.textContent = "Grant Microphone Access";
  }
}

// Update screen recording permission UI
function updateScreenRecordingUI() {
  if (!screenPermissionStatus) return;

  if (permissions.screen) {
    screenPermissionStatus.classList.remove("denied");
    screenPermissionStatus.classList.add("granted");
    screenStatusText.innerHTML = '<svg class="check-icon" viewBox="0 0 24 24"><path fill="#2ed573" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Granted';
    openScreenRecordingBtn.textContent = "Continue";
    screenWaiting.style.display = "none";
    if (step2Dot) step2Dot.classList.add("completed");
  } else {
    screenPermissionStatus.classList.remove("granted");
    screenStatusText.innerHTML = '<svg class="x-icon" viewBox="0 0 24 24"><path fill="#ff4757" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> Not granted';
    openScreenRecordingBtn.textContent = "Open System Preferences";
  }
}

// Update accessibility permission UI
function updateAccessibilityUI() {
  if (!accessPermissionStatus) return;

  if (permissions.accessibility) {
    accessPermissionStatus.classList.remove("denied");
    accessPermissionStatus.classList.add("granted");
    accessStatusText.innerHTML = '<svg class="check-icon" viewBox="0 0 24 24"><path fill="#2ed573" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Granted';
    openAccessibilityBtn.textContent = "Continue to App";
    accessWaiting.style.display = "none";
    if (step3Dot) step3Dot.classList.add("completed");
  } else {
    accessPermissionStatus.classList.remove("granted");
    accessStatusText.innerHTML = '<svg class="x-icon" viewBox="0 0 24 24"><path fill="#ff4757" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> Not granted';
    openAccessibilityBtn.textContent = "Open System Preferences";
  }
}

// Transition between screens
function transitionToScreen(screen) {
  currentScreen = screen;

  // Hide all screens
  apiKeyScreen.classList.remove("active");
  microphoneScreen.classList.remove("active");
  screenRecordingScreen.classList.remove("active");
  accessibilityScreen.classList.remove("active");
  mainScreen.classList.remove("active");

  // Show target screen
  if (screen === "apiKey") {
    apiKeyScreen.classList.add("active");
  } else if (screen === "microphone") {
    microphoneScreen.classList.add("active");
    if (step0Dot) step0Dot.classList.add("completed");
    if (step1Dot) step1Dot.classList.add("active");
  } else if (screen === "screenRecording") {
    screenRecordingScreen.classList.add("active");
    if (step1Dot) step1Dot.classList.add("completed");
    if (step2Dot) step2Dot.classList.add("active");
  } else if (screen === "accessibility") {
    accessibilityScreen.classList.add("active");
    if (step2Dot) step2Dot.classList.add("completed");
    if (step3Dot) step3Dot.classList.add("active");
  } else if (screen === "main") {
    mainScreen.classList.add("active");
    setupRecordButton();
  }
}

// Request microphone permission
async function requestMicrophonePermission() {
  micWaiting.style.display = "flex";
  requestMicBtn.disabled = true;

  try {
    const result = await window.electronAPI.requestMicrophonePermission();

    if (result.granted) {
      permissions.microphone = true;
      updateMicrophoneUI();
    } else if (result.openedSettings) {
      // Permission was previously denied, opened System Preferences
      micWaiting.querySelector("span").textContent = "Please enable microphone access in System Preferences...";
      requestMicBtn.textContent = "Open System Preferences";
    } else {
      micWaiting.querySelector("span").textContent = "Permission denied. Click to open Settings.";
      requestMicBtn.textContent = "Open System Preferences";
    }
  } catch (error) {
    console.error("Error requesting microphone permission:", error);
    micWaiting.querySelector("span").textContent = "Error requesting permission.";
  }

  requestMicBtn.disabled = false;
}

// Open screen recording settings
async function openScreenRecordingSettings() {
  screenWaiting.style.display = "flex";
  screenWaiting.querySelector("span").textContent = "Opening System Preferences...";

  await window.electronAPI.openScreenRecordingSettings();

  screenWaiting.querySelector("span").textContent = "Waiting for permission to be granted...";
}

// Open accessibility settings
async function openAccessibilitySettings() {
  accessWaiting.style.display = "flex";
  accessWaiting.querySelector("span").textContent = "Opening System Preferences...";

  await window.electronAPI.openAccessibilitySettings();

  accessWaiting.querySelector("span").textContent = "Waiting for permission to be granted...";
}

// Set up record button with mouse/touch events
function setupRecordButton() {
  if (!recordBtn) return;

  // Mouse events
  recordBtn.addEventListener("mousedown", startRecording);
  recordBtn.addEventListener("mouseup", stopRecording);
  recordBtn.addEventListener("mouseleave", () => {
    if (isRecording) stopRecording();
  });

  // Touch events for trackpad
  recordBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startRecording();
  });
  recordBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopRecording();
  });
}

// Set up IPC listeners from main process
function setupIPCListeners() {
  // Permission status updates (pushed from main)
  window.electronAPI.onPermissionStatus((status) => {
    updatePermissionState(status);
  });

  // Recording state changes (from global hotkey)
  // Main window no longer handles hotkey recording - floating button does
  // Just update the UI state to reflect what's happening
  window.electronAPI.onRecordingState((state) => {
    if (currentScreen !== "main") return;

    // Only update UI, don't start/stop recording from hotkey
    // The floating window handles all hotkey-triggered recording
    if (state.recording) {
      if (recordBtn) recordBtn.classList.add("recording");
      setStatus("Recording...", "");
    } else {
      if (recordBtn) recordBtn.classList.remove("recording");
    }
  });

  // Transcription status updates
  window.electronAPI.onTranscriptionStatus((status) => {
    if (status.status === "transcribing") {
      setStatus("Transcribing...", "");
    } else if (status.status === "error") {
      setStatus(`${status.error}`, "error");
    }
  });

  // Transcription results
  window.electronAPI.onTranscriptionResult((result) => {
    setStatus("Copied to clipboard!", "success");
    showTranscription(result.text);
  });
}

// Start recording - just notify main process, floating button handles actual recording
async function startRecording() {
  if (isRecording) return;
  isRecording = true;
  if (recordBtn) recordBtn.classList.add("recording");
  setStatus("Recording...", "");
  // Notify main process - floating button will do actual recording
  window.electronAPI.startRecording();
}

// Stop recording - just notify main process
function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (recordBtn) recordBtn.classList.remove("recording");
  setStatus("Processing...", "");
  // Notify main process - floating button will stop and transcribe
  window.electronAPI.stopRecording();
}

// Update status message
function setStatus(message, type) {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = "status-message";
  if (type) {
    statusMessage.classList.add(type);
  }
}

// Show transcription result
function showTranscription(text) {
  if (!transcriptionResult) return;
  transcriptionResult.textContent = text;
  transcriptionResult.classList.add("visible");

  // Auto-hide after 5 seconds
  setTimeout(() => {
    transcriptionResult.classList.remove("visible");
  }, 5000);
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);
