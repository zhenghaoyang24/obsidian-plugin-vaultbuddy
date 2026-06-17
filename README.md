<div align="right">

[中文](https://github.com/zhenghaoyang24/obsidian-plugin-vaultbuddy/blob/master/README.zh.md) | English

</div>

# VaultBuddy

AI-powered chat assistant for Obsidian. Chat with your entire vault as context.

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian)](https://obsidian.md/plugins)

<img 
  alt="20260614015448_35_10" 
  src="https://github.com/user-attachments/assets/388f05cb-7f90-4eb9-9235-ea51bd54f18c" 
  style="width: 100%; height: auto; display: block;" 
/>
<img 
  alt="20260614015503_36_10" 
  src="https://github.com/user-attachments/assets/f9eac27b-703c-40fa-944c-50320372d7fd" 
  style="width: 100%; height: auto; display: block;" 
/>

## Features

- **📖 Vault-Grounded Q&A** — Ask a question, and the AI automatically retrieves relevant content from your notes as context, providing answers grounded in your own materials.
- **📄 Full-Note Context** — The note you're currently editing is included in full, so you can summarize, improve, or discuss it with complete awareness.
- **🔗 Cross-Note Discovery** — Connect ideas across different notes; the AI finds related content even from separate files.
- **✏️ Note Editing** — AI can suggest edits to your notes with a visual diff preview. Review changes line-by-line, then accept or reject with one click.
- **🎯 Custom Skills** — Create reusable skills with specific instructions that activate automatically based on your messages. Perfect for repetitive tasks like translation, formatting, or summarization.
- **🤖 Multi-Model Support** — Configure multiple OpenAI-compatible models (DeepSeek, OpenAI, Groq, etc.) and switch between them on the fly.
- **🔒 Local & Secure** — API keys are encrypted and stored locally using Web Crypto API. All conversations are automatically saved.

## Data Storage

- **API Keys** — Encrypted and stored locally using Web Crypto API. They are never synced or uploaded to any server.
- **Personal Data** — Chat history, skill configurations, plugin settings, and model settings are saved in a `data.json` file.

If you use Obsidian across multiple devices, it's recommended to sync the `data.json` file via Git. If your `.gitignore` ignores the entire plugins directory, you can exclude `data.json` like this:

```gitignore
.obsidian/plugins/*
!.obsidian/plugins/vaultbuddy/
!.obsidian/plugins/vaultbuddy/data.json
```

## How It Works

VaultBuddy uses a **two-stage retrieval** approach to find the most relevant notes for your question.

### Stage 1: Lightweight Indexing (Fast Scan)

When you ask a question, VaultBuddy first builds a lightweight index of **every file in your vault** using Obsidian's built-in metadata cache — no need to read the full content of each file. It extracts key information from each note:

- **Title** — from frontmatter `title` or filename
- **Headings** — all `#` titles in the note
- **Tags** — any `#tag` used in the note
- **Aliases** — from frontmatter `aliases`
- **Creation time** — from file system or frontmatter date

These lightweight "file cards" are then scored against your question using keyword matching and synonym expansion, and the top-ranked files are selected as candidates.

### Stage 2: Full-Content Reading (Deep Dive)

Only the candidate files are fully read and split into **chunks** (paragraphs grouped by headings). Each chunk is re-scored against your question, and the most relevant chunks are assembled into the AI's context window — fitting within the model's token limit.

### Priority: Your Current Note

If you have a note open when you ask a question, its **full content is always included first**, ensuring the AI has complete context for tasks like summarizing or improving the note you're working on.

> **Tip**: The richer your note metadata (descriptive titles, meaningful tags, clear headings), the better VaultBuddy can match your notes to your questions.

## Installation

### From Obsidian Community Store (once published)

1. Open Obsidian → Settings → Community Plugins → Browse
2. Search for **VaultBuddy**
3. Click Install → Enable

### Manual Installation

1. Go to [GitHub Releases](https://github.com/zhenghaoyang24/obsidian-plugin-vaultbuddy/releases) and download these 3 files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create a folder `.obsidian/plugins/vaultbuddy/` inside your vault
3. Put the 3 files into that folder
4. Enable the plugin in Settings → Community Plugins

## Quick Start

### Add a Model

Open **Settings → VaultBuddy** and click **+ Add Model**. Fill in:

| Field          | Example                                     |
| -------------- | ------------------------------------------- |
| Display Name   | `DeepSeek`                                  |
| Base URL       | `https://api.deepseek.com/chat/completions` |
| API Key        | `sk-...`                                    |
| Model ID       | `deepseek-chat`                             |
| Context Window | `131072`                                    |

> The **Base URL** must be a cURL-compatible chat completions endpoint (e.g. `https://api.openai.com/v1/chat/completions`).

Click **Save Model**, then select your model as the **Default Model** in the dropdown below.

## Configuration

| Setting                  | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| Models                   | Add, edit, delete, and test API model configurations   |
| Default Model            | Which model to use for new conversations               |
| Max Response Tokens      | Maximum length of AI responses (recommended 4096-8192) |
| Custom Rules             | Extra instructions appended to the system prompt       |
| Skills                   | Create, edit, and delete custom skills                 |
| Resume Last Conversation | Automatically reload the previous chat on startup      |


## Compatibility

- ✅ **Desktop** — Obsidian v0.15.0+
- ✅ **Mobile** — Fully supported (`isDesktopOnly: false`)
- ✅ **API** — OpenAI-compatible endpoints (DeepSeek, OpenAI, Groq, etc.)

## Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** — Open an issue with steps to reproduce
2. **Suggest features** — Share your ideas in the Discussions tab
3. **Submit PRs** — Fork the repo, create a branch, and submit a pull request

Please follow the existing code style and include tests when applicable.

## License

[MIT](LICENSE)
