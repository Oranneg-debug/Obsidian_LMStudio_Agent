# Obsidian Agent (Powered by AI Providers)

Obsidian Agent is an advanced, fully agentic AI assistant integrated directly into your Obsidian Vault. It goes beyond simple chat by acting as an intelligent partner that can browse the web, read your notes, organize your vault, and even create Canvas mind maps natively.

By leveraging the `@obsidian-ai-providers/sdk`, this plugin allows you to seamlessly plug in local models (like LM Studio or Ollama) or cloud providers, giving you full control over your AI experience.

## ✨ Key Features

### 🧠 Intelligent Vault Context
- **Active Context Ribbon**: Type `@` to instantly search and attach notes or `.canvas` files to the context ribbon.
- **Inline Linking**: Type `[[` to trigger native Obsidian auto-complete, allowing you to easily link notes directly in your prompts. The AI's responses that contain paths are also automatically converted back into clickable wiki-links.
- **Smart Related Notes**: When you open a note or chat with the agent, it extracts key semantic concepts and automatically surfaces up to 8 highly relevant related notes from your vault—**all without needing a heavy local embedding model!**

### 🌐 Free Web Browsing & Scraping
Enable "Agentic Capabilities" in the settings to allow your AI to browse the internet safely and for free:
- **`fetch_url`**: Feed the agent a link, and it will bypass CORS restrictions to scrape and read the raw text of the article directly.
- **`web_search`**: Ask the agent a question about current events, and it will silently query DuckDuckGo, parse the HTML results, and summarize the top search results for you—**no API keys required.**

### 🛠️ Agentic File Management
Give your agent permission to actively manage your vault!
- The agent is equipped with `edit_file`, `move_file`, and `delete_file` tools.
- **Permission System**: Execution pauses whenever the agent attempts to modify a file. A UI prompt appears in the chat asking you to **Approve Once**, **Approve for Session**, or **Deny** the action.
- **Safe Deletion**: Deletions are sent safely to your computer's System Trash, not permanently destroyed.
- **Excluded Folders**: Define specific folders (like Templates) that the agent is strictly forbidden from modifying.

### 🎨 Canvas Generation & Reading
The agent can natively read and write Obsidian `.canvas` files.
- Mention a canvas file, and the agent will parse the underlying JSON structure to understand the nodes and connections of your whiteboards.
- Ask the agent to "map out a project timeline", and it will use the `create_canvas` tool to generate a perfectly formatted Obsidian Canvas and automatically open it in a new tab for you.

### ⚡ Custom Workflows & Editor Commands
- **Slash Commands**: Type `/` in the chat to instantly insert custom predefined system prompts and instructions.
- **Text Selection Context Menu**: Highlight text in the chat, right-click, and choose to "Insert into active note" or "Create new note from selection".
- **Editor Integration**: Highlight text in your editor and run the "Rewrite" or "Autocomplete" commands via the Obsidian command palette.

### 📎 Native Attachments
- Drag and drop images or text files into the chat. Images are seamlessly encoded for vision models, and text files are read into the context.
- Attachments are automatically saved physically into your vault's `media/` folder, ensuring they are preserved and natively accessible.

## ⚙️ Setup & Configuration

1. **Install AI Providers**: This plugin relies on the official [Obsidian AI Providers plugin](https://github.com/obsidian-ai-providers) to manage API connections. Ensure it is installed and configured with your preferred model (e.g. LM Studio for local inference).
2. **Install Obsidian Agent**: Copy the plugin folder into your vault's `.obsidian/plugins/` directory.
3. **Configure Settings**: Go to the plugin settings to choose your default Chat and Editor models, configure RAG/Semantic excluded folders, and enable Agentic Capabilities.

## 🚀 Roadmap

- **ComfyUI Integration**: Upcoming tool allowing the agent to configure and trigger local ComfyUI image generation workflows and save the output directly to the vault.
- **Krita Integration**: Expanding the workflow stack to interface with digital art pipelines.

## 🛡️ Privacy & Security

This plugin is designed with local-first setups in mind. By pairing it with LM Studio or Ollama, your notes, web searches, and generated canvases never leave your machine. The permission system ensures the agent never takes destructive actions without your explicit, real-time approval.
