# Crisper

A lightweight macOS app for instant voice-to-text transcription using Groq's Whisper API. Hold a key, speak, release - your words are transcribed and pasted automatically.

![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Push-to-Talk** - Hold a configurable hotkey to record, release to transcribe
- **Instant Transcription** - Uses Groq's blazing-fast Whisper API
- **Auto-Paste** - Transcribed text is automatically pasted where your cursor is
- **Floating Button** - Draggable, translucent recording indicator that stays out of your way
- **System Audio Support** - Optionally capture system audio along with microphone
- **Configurable Hotkey** - Choose from Right/Left Option, Control, Shift, Command, Space, and more

## Screenshot & Demo

<img width="493" height="528" alt="Screenshot 2026-01-30 at 11 59 04 AM" src="https://github.com/user-attachments/assets/79089666-51c6-4dfb-82e3-7ae8404b066f" />


Demo link : [Click here](https://drive.google.com/file/d/1jWz14aWJaCT9kiqyaLNrnStnCm9RfdET/view?usp=drive_link)

## Installation

### Download (Recommended)

Download the latest release from the [Releases page](https://github.com/bolt162/crisper/releases/latest).

1. Download `Crisper-1.0.0-arm64.dmg`
2. Open the DMG and drag Crisper to your Applications folder
3. On first launch, right-click the app and select "Open" to bypass Gatekeeper (since the app is ad-hoc signed)

### Prerequisites

- macOS 11.0 or later
- A free [Groq API key](https://console.groq.com/keys)

### From Source (Development)

Requires [Node.js](https://nodejs.org/) 18.0 or later.

```bash
# Clone the repository
git clone https://github.com/bolt162/crisper.git
cd crisper

# Install dependencies
npm install

# Run the app
npm start
```

### Build for Distribution

```bash
# Package the app
npm run make
```

The built app will be in the `out/` directory.

## Setup

1. **Get a Groq API Key**
   - Visit [console.groq.com/keys](https://console.groq.com/keys)
   - Create a free account and generate an API key
   - The free tier includes generous usage limits

2. **Grant Permissions**

   Crisper requires the following macOS permissions:
   - **Microphone** - To record your voice
   - **Screen Recording** - To capture system audio (optional)
   - **Accessibility** - For global hotkey and auto-paste functionality
   - **Automation** - For auto pasting the transcribed audio
   - **Input Monitoring** - For push-to-talk hotkey detection

3. **Configure Settings**
   - Open settings from the sidebar
   - Enter your Groq API key
   - Optionally change the push-to-talk hotkey (default: Right Option)

## Usage

1. **Using the Hotkey (Recommended)**
   - Hold your configured push-to-talk key (default: Right Option)
   - Speak clearly
   - Release the key
   - Your speech is transcribed and pasted automatically

2. **Using the Floating Button**
   - Click and hold the floating microphone button
   - Speak clearly
   - Release to transcribe

3. **Visual Indicators**
   - Gray button: Ready to record
   - Red glowing: Recording in progress
   - Blue pulsing: Transcribing

## Configuration

### Changing the Push-to-Talk Key

1. Click the Settings icon in the sidebar
2. Under "Push-to-Talk", click "Click to set new key"
3. Press your desired key

**Supported Keys:**
- Right/Left Option (Alt)
- Right/Left Control
- Right/Left Shift
- Right/Left Command
- Space
- Caps Lock
- Tab
- Backtick (`)

### Updating the API Key

1. Click the Settings icon in the sidebar
2. Enter your new Groq API key
3. Click "Save Key"

## Troubleshooting

### Push-to-talk not working

- Ensure **Input Monitoring** permission is granted in System Settings > Privacy & Security > Input Monitoring
- Try restarting the app after granting permissions

### Auto-paste not working

- Ensure **Accessibility** and **Automation** permissions are granted in: 

System Settings > Privacy & Security > Accessibility

System Settings > Privacy & Security > Automation
- The app you're pasting into must be in focus

### "Invalid API key" error

- Verify your API key is correct in Settings
- Ensure your Groq API key starts with `gsk_`
- Check your Groq account for any usage limits

### Recording not starting

- Ensure **Microphone** permission is granted
- Check that no other app is exclusively using the microphone

## Tech Stack

- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [Groq API](https://groq.com/) - Fast AI inference for Whisper
- [uiohook-napi](https://github.com/SnosMe/uiohook-napi) - Global keyboard hooks

## Project Structure

```
crisper/
├── main.js              # Main Electron process
├── preload.js           # Preload script for main window
├── preload-floating.js  # Preload script for floating button
├── renderer.js          # Main window renderer
├── floating-renderer.js # Floating button renderer
├── index.html           # Main window UI
├── floating.html        # Floating button UI
└── package.json
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- [Groq](https://groq.com/) for their incredibly fast Whisper API
- The Electron team for making cross-platform desktop apps accessible
