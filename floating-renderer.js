const container = document.getElementById("container");
const floatingBtn = document.getElementById("floatingBtn");
const settingsBtn = document.getElementById("settingsBtn");
const snackbar = document.getElementById("snackbar");

let isRecording = false;
let snackbarTimeout = null;

// Show snackbar with message and type (success/error)
function showSnackbar(message, type = "success") {
  // Clear any existing timeout
  if (snackbarTimeout) {
    clearTimeout(snackbarTimeout);
  }

  // Set content and type
  snackbar.textContent = message;
  snackbar.className = "snackbar " + type;

  // Show snackbar
  requestAnimationFrame(() => {
    snackbar.classList.add("visible");
  });

  // Auto-hide after 2.5 seconds
  snackbarTimeout = setTimeout(() => {
    snackbar.classList.remove("visible");
  }, 2500);
}
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let micStream = null;
let systemStream = null;

// Custom drag handling for buttons
// This allows dragging the window by any button while preserving click functionality
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasMoved = false;
let activeButton = null;
const DRAG_THRESHOLD = 5; // pixels of movement before considered a drag

function setupDraggableButton(button, onClick) {
  button.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    hasMoved = false;
    activeButton = button;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    e.preventDefault();
  });

  button._onClick = onClick;
}

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const deltaX = e.screenX - dragStartX;
  const deltaY = e.screenY - dragStartY;

  if (!hasMoved && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
    hasMoved = true;
  }

  if (hasMoved) {
    window.floatingAPI.moveWindow(deltaX, deltaY);
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

document.addEventListener("mouseup", (e) => {
  if (!isDragging) return;
  isDragging = false;

  if (!hasMoved && e.button === 0 && activeButton?._onClick) {
    activeButton._onClick();
  }
  activeButton = null;
});

// Setup draggable buttons with their click handlers
setupDraggableButton(floatingBtn, () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

setupDraggableButton(settingsBtn, () => {
  window.floatingAPI.showMainWindow();
});

// Listen for recording state changes from main process (via hotkey or main window)
window.floatingAPI.onRecordingState((state) => {
  // Respond to external triggers (hotkey or main window button)
  // The floating button handles all actual recording
  if (state.recording && !isRecording) {
    startRecording();
  } else if (!state.recording && isRecording) {
    stopRecording();
  }
});

// Listen for transcription status
window.floatingAPI.onTranscriptionStatus((status) => {
  if (status.status === "transcribing") {
    floatingBtn.classList.add("transcribing");
  } else {
    floatingBtn.classList.remove("transcribing");
    // Show error snackbar if there's an error
    if (status.status === "error" && status.error) {
      showSnackbar(status.error, "error");
    }
  }
});

// Listen for transcription results (success)
window.floatingAPI.onTranscriptionResult?.((_result) => {
  showSnackbar("Copied to clipboard", "success");
});

// Helper to log to terminal via main process
const log = (...args) => window.floatingAPI.log(...args);

async function startRecording() {
  if (isRecording) return;

  // Set flag immediately to prevent duplicate calls
  isRecording = true;
  floatingBtn.classList.add("recording");
  container.classList.add("recording");
  log("=== Starting Recording ===");

  try {
    // Get microphone stream
    log("Requesting microphone access...");
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("Microphone stream obtained:", micStream.getAudioTracks().length, "audio tracks");
    micStream.getAudioTracks().forEach((track, i) => {
      log(`  Mic track ${i}: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}`);
    });

    // Try to get system audio via screen capture
    let combinedStream;
    let hasSystemAudio = false;
    try {
      log("Getting desktop sources...");
      const sources = await window.floatingAPI.getDesktopSources();
      log("Desktop sources found:", sources ? sources.length : 0);
      if (sources) {
        sources.forEach((s, i) => log(`  Source ${i}: ${s.name} (${s.id})`));
      }

      if (sources && sources.length > 0) {
        log("Requesting system audio via getUserMedia...");
        // Get system audio from screen capture
        systemStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "desktop"
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              minWidth: 1,
              maxWidth: 1,
              minHeight: 1,
              maxHeight: 1
            }
          }
        });

        log("System stream obtained");
        log("  Video tracks:", systemStream.getVideoTracks().length);
        log("  Audio tracks:", systemStream.getAudioTracks().length);

        systemStream.getAudioTracks().forEach((track, i) => {
          log(`  System audio track ${i}: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}`);
        });

        // Remove video track - we only need audio
        systemStream.getVideoTracks().forEach(track => {
          log("Stopping video track:", track.label);
          track.stop();
        });

        if (systemStream.getAudioTracks().length > 0) {
          hasSystemAudio = true;
          // Mix both audio streams using Web Audio API
          log("Creating AudioContext to mix streams...");
          audioContext = new AudioContext();
          log("AudioContext state:", audioContext.state, "sampleRate:", audioContext.sampleRate);

          const micSource = audioContext.createMediaStreamSource(micStream);
          const systemSource = audioContext.createMediaStreamSource(systemStream);
          const destination = audioContext.createMediaStreamDestination();

          // Connect both sources to the destination
          micSource.connect(destination);
          systemSource.connect(destination);

          combinedStream = destination.stream;
          log("Combined stream created with", combinedStream.getAudioTracks().length, "audio tracks");
          log("=== Recording with MIC + SYSTEM AUDIO ===");
        } else {
          log("WARNING: System stream has no audio tracks!");
          combinedStream = micStream;
          log("=== Recording with MIC ONLY (no system audio tracks) ===");
        }
      } else {
        // No screen sources, fall back to mic only
        combinedStream = micStream;
        log("=== Recording with MIC ONLY (no screen sources) ===");
      }
    } catch (systemAudioError) {
      // System audio capture failed, fall back to mic only
      log("System audio capture ERROR:", systemAudioError.name, systemAudioError.message);
      combinedStream = micStream;
      log("=== Recording with MIC ONLY (system audio failed) ===");
    }

    log("Has system audio:", hasSystemAudio);

    // Check supported MIME types and pick the best one for Groq/Whisper compatibility
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    let selectedMimeType = null;
    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }
    log("Selected MIME type:", selectedMimeType || "browser default");

    const recorderOptions = selectedMimeType ? { mimeType: selectedMimeType } : {};
    mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
    log("MediaRecorder actual MIME type:", mediaRecorder.mimeType);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
        micStream = null;
      }
      if (systemStream) {
        systemStream.getTracks().forEach((track) => track.stop());
        systemStream = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      // Show transcribing state
      floatingBtn.classList.add("transcribing");

      const MIN_AUDIO_SIZE = 4096; // 4KB minimum to ensure valid audio data

      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        log("Audio blob size:", audioBlob.size, "bytes, type:", audioBlob.type);

        if (audioBlob.size < MIN_AUDIO_SIZE) {
          log("WARNING: Recording too short, skipping transcription");
          showSnackbar("Recording too short", "error");
          floatingBtn.classList.remove("transcribing");
          return;
        }

        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Send to main process for transcription
        await window.floatingAPI.transcribe(Array.from(uint8Array));
      }

      floatingBtn.classList.remove("transcribing");
    };

    mediaRecorder.start(100);

    // Notify main process
    window.floatingAPI.startRecording();
  } catch (error) {
    console.error("Failed to start recording:", error);
    isRecording = false;
    floatingBtn.classList.remove("recording");
    // Clean up any streams
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
    }
    if (systemStream) {
      systemStream.getTracks().forEach((track) => track.stop());
      systemStream = null;
    }
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;

  isRecording = false;
  floatingBtn.classList.remove("recording");
  container.classList.remove("recording");

  if (mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  // Notify main process
  window.floatingAPI.stopRecording();
}
