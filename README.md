# Obsidian AI Transcriber

An Obsidian plugin that uses AI to record and transcribe audio into structured Markdown notes, with optional AI-based editing of transcripts.

## Features

- 🎤 **Record Audio**: Open a modal or click the ribbon icon to record audio within Obsidian.
- 🤖 **AI Transcription**: Transcribe recorded or imported audio files (`.webm`, `.m4a`) to text using OpenAI or Gemini models.
- ✍️ **AI Editing** (optional): Automatically refine raw transcripts into structured meeting notes with summary, key points, and cleaned transcript.
- 💾 **Flexible File Saving**: Save raw and/or edited transcripts to specified vault subdirectories.
- ⚙️ **Settings Tab**: Configure transcription and editing providers, models, prompts, temperature, and output directories.
- 🔄 **Context Menu**: Right-click an audio file in the file explorer to transcribe it directly.
- 📊 **Status Bar**: View plugin status (Idle, Recording…, Transcribing…, Editing…) in the status bar (bottom-right corner).

## Installation

1. Create a folder named `obsidian-ai-transcriber` in your vault's plugins directory: `YourVault/.obsidian/plugins/obsidian-ai-transcriber`
2. Copy the main.js, manifest.json, and styles.css files to the plugin folder
3. Reload Obsidian and enable the plugin in Settings

## Usage

### Recording Audio

- Click the microphone icon in the left ribbon or run the **"Record Audio"** command from the command palette.
- In the record modal, start recording. When done, you can choose to **Stop & Save** (saves the audio without transcribing) or **Stop & Transcribe** (saves audio and proceeds to transcription).

### Transcribing Existing Audio Files

- Right-click any `.webm` or `.m4a` file in the file explorer.
- Select **"Transcribe with AI"** to generate a transcript (raw or edited).

### Editing Existing Transcripts

- Open a raw transcript file, then run the **"Edit Transcript"** command from the command palette.
- The plugin will then use the configured AI editor settings to process and refine the selected transcript.

### Transcript Output

- Raw transcript: saved as `<audio_basename>_raw_transcript.md`
- Edited transcript: saved as `<audio_basename>_edited_transcript.md` (if AI Editing is enabled)
- Files are written to the **Transcript Directory** configured in settings.

## Settings

Open **Settings → Obsidian AI Transcriber** to configure:

- **Transcriber Settings**:
  - Provider: `openai` or `gemini`
  - API Key: your service key
  - Model: transcription model (e.g., `gpt-4o-transcribe`)
  - Prompt: custom system prompt for transcription
  - Temperature: sampling temperature
  - Audio Directory: where to save recorded audio
  - Transcript Directory: vault subfolder for transcripts

- **Editor Settings**:
  - Enable Editing: toggle AI post-editing
  - Provider / API Key / Model: settings for AI editor
  - System Prompt / User Prompt: prompts for structuring meeting notes
  - Temperature: sampling temperature
  - Keep Original: save raw transcript alongside edited version

## License

This plugin is released under the [Dynalist License](LICENSE).
