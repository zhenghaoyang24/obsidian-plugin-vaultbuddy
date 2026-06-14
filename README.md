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

**VaultBuddy** turns your Obsidian vault into an intelligent Q&A system. Simply ask a question, and the AI automatically retrieves the most relevant passages from your notes as context to provide grounded answers. It helps you locate scattered information, connect ideas across different notes, or generate summaries and suggestions—with automatic source citations. Compatible with any API endpoint that supports curl calls, you can configure multiple models and switch between them on the fly. API keys are stored locally with encryption, and all conversations are automatically saved.

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
| Resume Last Conversation | Automatically reload the previous chat on startup      |

## Development

```bash
# Install dependencies
npm install

# Watch mode (auto-rebuild)
npm run dev

# Production build
npm run build

# Type check only
tsc --noEmit
```

### Project Structure

```
vaultbuddy/
├── manifest.json
├── package.json
├── styles.css
├── build/                  # Build output
└── src/
    ├── core/               # Plugin entry & types
    │   ├── main.ts
    │   ├── types.ts
    │   └── i18n.ts         # Multi-language module
    ├── services/           # Business logic
    │   ├── aiService.ts    # API calls & streaming
    │   ├── contextBuilder.ts # Vault content compression
    │   └── storage.ts      # Conversation persistence
    ├── ui/                 # UI components
    │   ├── view.ts         # Chat panel
    │   └── settings.ts     # Settings tab
    └── utils/
        └── sourceManager.ts
```

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
