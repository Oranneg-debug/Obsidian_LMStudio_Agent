# 🤖 Obsidian Agent — Local AI for Your Vault

> A fully agentic AI assistant that lives inside Obsidian. Browse the web, organize your vault, generate content, find related notes with semantic embeddings — all powered by local LLMs through LM Studio or any OpenAI-compatible provider.

Built on the [`@obsidian-ai-providers/sdk`](https://github.com/pfrankov/obsidian-ai-providers), giving you **full control** over which models run where — keep everything local, or mix in cloud providers.

---

## ✨ Features at a Glance

| Category | What it does |
|---|---|
| 💬 **Chat** | Sidebar chat with streaming, markdown rendering, code blocks, context-aware responses |
| 🔍 **Semantic Search** | BGE/embedding-powered related notes with real similarity scores |
| 🌐 **Web Browsing** | `fetch_url` and `web_search` via DuckDuckGo — no API keys needed |
| 🛠️ **File Management** | Read, edit, move, delete notes with a permission-based approval system |
| 🎨 **Canvas** | Read and create `.canvas` mind maps natively |
| 🏷️ **Auto-tag** | AI-suggested tags based on note content + your existing vault taxonomy |
| 📄 **Templates** | Apply templates with AI restructuring — content is reorganized to fit the template |
| 📝 **Create Notes** | Turn any AI answer into a new note with proper YAML frontmatter |
| 🔎 **Find Duplicates** | Embedding-based similarity search to surface near-duplicate notes |
| 📊 **Vault Analysis** | Full vault profile saved to a memory file: writing style, key topics, action items |
| 💡 **AI Suggestions** | Get 3 follow-up questions/tasks based on the active note |
| 📅 **Daily Notes** | One-click daily note context injection |
| 🎯 **Prompt Helper** | Meta-prompt engineering — AI helps you write better prompts |

---

## 📦 Installation

### Prerequisites

1. **[Obsidian](https://obsidian.md)** v0.15.0+
2. **[AI Providers plugin](https://github.com/pfrankov/obsidian-ai-providers)** — install from Obsidian Community Plugins
3. **[LM Studio](https://lmstudio.ai/)** (or any OpenAI-compatible API)

### Setup

1. **Install AI Providers** from Obsidian → Settings → Community Plugins → Browse
2. **Configure your providers** in AI Providers settings:
   - Add a **Chat provider** (e.g., LM Studio pointing to `http://localhost:1234/v1`)
   - Add an **Embedding provider** (e.g., `text-embedding-bge-m3` for semantic search)
3. **Install this plugin**:
   ```
   git clone https://github.com/Oranneg-debug/Obsidian_LMStudio_Agent.git
   cd Obsidian_LMStudio_Agent
   npm install
   npm run build
   ```
4. **Copy** `main.js`, `manifest.json`, and `styles.css` into:
   ```
   <your-vault>/.obsidian/plugins/obsidian-lmstudio-agent/
   ```
5. **Enable** the plugin in Obsidian → Settings → Community Plugins

---

## 🚀 Quick Start

### Chat

Open the agent sidebar via the robot icon in the left ribbon, or use the command palette: **"Open Agent Chat"**.

- **Type a message** and press Enter or click Send
- **`@` mention** — type `@` to search and attach vault notes as context
- **`[[` links** — type `[[` for native Obsidian link completion
- **`/` commands** — type `/` to insert custom system prompt presets

### Toggle Features

Above the chat area you'll find three toggles:

| Toggle | What it does |
|---|---|
| 🔍 **Semantic** | Enable embedding-based context retrieval for related notes |
| 🧠 **Memory** | Load the AI's vault memory file into the conversation |
| 📝 **Override** | Use a custom system prompt instead of the default |

### Tools Panel

Click **⚙ Tools** to expand the tools drawer with nine actions:

| Tool | Description |
|---|---|
| 📅 Daily Note | Add today's daily note to chat context |
| 🖼️ Image Gen | Generate images via ComfyUI (requires ComfyUI setup) |
| 🏷️ Auto-tag | AI suggests 5 tags based on note content and vault taxonomy |
| 📄 Templates | Apply a template to the active note — AI restructures the content to fit |
| 🔎 Duplicates | Find semantically similar notes using embeddings |
| 📊 Analyze | Deep vault analysis saved to a memory file |
| 📝 Summarize | Generate a concise summary of the active note |
| 💡 Suggestions | Get 3 AI-powered follow-up questions/tasks |
| 🎯 Prompt Help | Meta-prompt engineering assistant |

---

## ⚙️ Configuration

### Settings Overview

| Setting | Description | Default |
|---|---|---|
| **Chat Model** | Model for chat conversations | *(first available)* |
| **Editor Model** | Model for rewrite/autocomplete commands | *(first available)* |
| **Embedding Model** | Model for semantic search & related notes | *(none — optional)* |
| **RAG Folders** | Folders included in vault search | `/` (entire vault) |
| **Exclude Folders** | Folders excluded from search | `[]` |
| **Chat History Folder** | Where saved chats are stored | `AI Chats` |
| **Template Folder** | Folder containing your note templates | `Templates` |
| **Memory Folder** | Where vault analysis is saved | `""` |
| **Enable File Modifications** | Allow the agent to edit/move/delete files | `false` |
| **Enable Web Scraping** | Allow `fetch_url` and `web_search` tools | `false` |
| **Modify-Exclude Folders** | Folders the agent cannot modify | `[]` |
| **ComfyUI URL** | ComfyUI server for image generation | `http://127.0.0.1:8188` |
| **Auto-analyze on Startup** | Run vault analysis when Obsidian starts | `false` |

### System Prompts

Three customizable prompts are available in the settings (collapsed by default):

- **Chat Prompt** — The main system instruction for the sidebar agent
- **Rewrite Prompt** — Used by the editor "Rewrite" command
- **Autocomplete Prompt** — Used by the editor "Autocomplete" command

### Custom Commands

Define reusable prompt shortcuts accessible via `/` in the chat. Each command has a label and a prompt template.

---

## 🔍 Semantic Search & Embeddings

The plugin uses **direct embedding** with cosine similarity — no external vector database needed.

### How it works

1. When you open a note, the plugin extracts keywords, headings, and tags
2. It embeds the query text + the first 800 chars of up to 50 vault notes via your embedding model
3. Cosine similarity is computed locally to rank relevance
4. Top 8 results (>10% similarity) are displayed with percentage scores

### Recommended Embedding Models

| Model | Size | Notes |
|---|---|---|
| `text-embedding-bge-m3` | ~570MB | Excellent multilingual, 256-1024 dims |
| `nomic-embed-text` | ~270MB | Great English-only option |
| `all-MiniLM-L6-v2` | ~90MB | Lightweight, good for smaller vaults |

### Setup

1. Load an embedding model in LM Studio
2. In AI Providers settings, add a second provider pointing to LM Studio with the embedding model
3. In Agent settings, select this provider as your **Embedding Model**

---

## 🌐 Web Browsing

When **Enable Web Scraping** is turned on, the agent gains two tools:

### `web_search`
Ask the agent anything about current events. It will:
1. Query DuckDuckGo HTML
2. Parse the top results
3. Summarize findings in the chat

### `fetch_url`
Give the agent a URL and it will:
1. Bypass CORS via a server-side proxy
2. Extract the article text
3. Return clean readable content

> **No API keys required** — uses free DuckDuckGo search.

---

## 🛠️ Agentic File Management

When **Enable File Modifications** is turned on, the agent can:

| Tool | Description |
|---|---|
| `edit_file` | Modify note content (append, replace, rewrite) |
| `move_file` | Rename or relocate files within the vault |
| `delete_file` | Send files to system trash (not permanent delete) |
| `create_canvas` | Generate `.canvas` files with nodes and edges |

### Permission System

Every modification triggers a **real-time approval prompt** in the chat:
- ✅ **Approve Once** — Allow this single action
- 🔓 **Approve for Session** — Allow all modifications until Obsidian is restarted
- ❌ **Deny** — Block the action

### Safety

- Files in **Modify-Exclude Folders** are protected from changes
- Deletions go to your system's **Trash/Recycle Bin**, never permanently deleted
- The agent shows you exactly what it wants to do before you approve

---

## 🧠 Cognitive OS Integration

This plugin acts as the native front-end for your **Cognitive OS** local orchestrator.

### Setup

1. Make sure your Python Cognitive OS backend is running (`python -m src.api` or `start_services.bat`) on its default port `5000`.
2. Open the Obsidian plugin settings → **🧠 Cognitive OS**.
3. Verify the **API Endpoint** is set to `http://127.0.0.1:5000/process`.

### How to Use

Highlight text in any note, open the Command Palette (`Ctrl/Cmd + P`), and search for `Cognitive OS`:

| Command | Description |
|---|---|
| **Auto-Route Council** | Sends text as-is. The Python Sentry Router determines the best council path. |
| **Design Council** | Prepend `/design` to force the request to the Creative Council. |
| **Technical Council** | Prepend `/technical` to force the request to the Small/Tech Council. |
| **Boardroom** | Prepend `/boardroom` to force the request through the full 6-model sequential boardroom. |

*Note: The actual system prompts, temperatures, and model assignments for the councils are configured entirely within your `orchestrator.py` script.*

---

## ✏️ Editor Commands

Available via the Obsidian command palette (Ctrl/Cmd + P):

| Command | Description |
|---|---|
| **Rewrite Selection** | Highlight text → rewrite with AI for clarity and flow |
| **Autocomplete** | Place cursor → AI continues writing in your style |

Both commands use the **Editor Model** setting and their respective system prompts.

---

## 📎 Attachments

- Click the **`+`** button in the chat input area to attach files
- **Images** are encoded for vision-capable models
- **Text files** are read into context
- Attachments are saved to your vault's `media/` folder

---

## 🏷️ Auto-Tag

Click **🏷️ Auto-tag** in the Tools panel:

1. The agent reads the active note content
2. Scans your entire vault's existing tag taxonomy
3. Suggests 5 relevant tags as clickable buttons
4. Click a tag to add it to the note's YAML frontmatter

Tags are added intelligently:
- If the note has existing frontmatter → tags are merged
- If no frontmatter exists → a new `---` block is created

---

## 📄 Templates

Click **📄 Templates** in the Tools panel to see a menu of all `.md` files in your configured template folder.

### What happens when you apply a template:

1. **Structure merge** — The template's headings and frontmatter are merged with the note
2. **AI restructuring** — The LLM reorganizes your existing content to fit the template's sections
3. **Nothing is lost** — All original content is preserved and moved to the appropriate sections
4. Template sections with no matching content get `<!-- TODO -->` placeholders

### Setup

Set your template folder in Settings → **Template Folder** (default: `Templates`).

---

## 📊 Vault Analysis & Memory

Click **📊 Analyze Vault** in the Tools panel to generate a comprehensive vault profile:

- **Vault statistics** — Note count, folder structure, file types
- **Writing style** — AI analysis of your personal writing patterns
- **Key topics** — Main themes and knowledge areas
- **Top 10 notes** — Highest-leverage notes to work on next
- **Action items** — Suggested improvements and organization tips

The analysis is saved to your **Memory Folder** as `agent-memory.md` and can be loaded into future conversations via the 🧠 Memory toggle.

---

## 💬 Message Actions

Every AI response has three action buttons (hover to reveal):

| Button | Action |
|---|---|
| 📋 | Copy the full response to clipboard |
| ↙️ | Insert the response at the end of the active note |
| 📝 | Create a new note from the response with YAML frontmatter |

Right-click on selected text in any message for additional options:
- Copy selection
- Insert into active note
- Create new note from selection

---

## 🔧 Troubleshooting

### Embedding scores are all 0%
The AI Providers SDK's `retrieve()` function has a known bug where scores are always 0. This plugin works around it by using direct `embed()` calls with manual cosine similarity. If you see 0% scores:
- Make sure your **Embedding Model** is configured and loaded in LM Studio
- Check that the embedding provider in AI Providers settings has the correct URL

### Auto-tag shows an error
- Check DevTools console (Ctrl+Shift+I) for `Auto-tag raw response:` to see what the LLM returned
- The LLM must return a valid JSON array like `["#tag1", "#tag2"]`
- Some models struggle with structured output — try a larger model

### Templates aren't formatting correctly
- Make sure your template files have proper YAML frontmatter with `---` delimiters
- The AI restructuring step uses your Chat Model — ensure it's capable enough

### Web search doesn't work
- Enable **Web Scraping** in settings
- The DuckDuckGo proxy may be rate-limited — wait a moment and try again

### Chat model not responding
- Check that LM Studio is running and the model is loaded
- Verify the provider URL in AI Providers settings (default: `http://localhost:1234/v1`)
- Check DevTools console for error messages

---

## 🏗️ Development

```bash
# Clone
git clone https://github.com/Oranneg-debug/Obsidian_LMStudio_Agent.git
cd Obsidian_LMStudio_Agent

# Install
npm install

# Development (watch mode)
npm run dev

# Production build
npm run build

# Lint
npm run lint
```

### Project Structure

```
src/
├── main.ts            # Plugin entry, AI initialization, commands
├── chat-view.ts       # Sidebar chat UI, tools, embedding, all features
├── editor-commands.ts # Rewrite & autocomplete editor integrations
└── settings.ts        # Settings interface and tab
```

---

## 📄 License

[0-BSD](LICENSE) — Free to use, modify, and distribute.

---

## 🙏 Credits

- [Obsidian](https://obsidian.md) — The knowledge base that works on local Markdown files
- [AI Providers](https://github.com/pfrankov/obsidian-ai-providers) — Unified AI provider hub for Obsidian
- [LM Studio](https://lmstudio.ai/) — Local LLM inference server
- [DuckDuckGo](https://duckduckgo.com) — Free web search API
