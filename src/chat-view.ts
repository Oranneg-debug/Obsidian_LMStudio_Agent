import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import ObsidianAgentPlugin from './main';
import { waitForAI, IAIToolDefinition } from '@obsidian-ai-providers/sdk';

export const CHAT_VIEW_TYPE = 'agent-chat-view';

export class ChatView extends ItemView {
	plugin: ObsidianAgentPlugin;
	messageContainer: HTMLElement;
	inputEl: HTMLTextAreaElement;
	history: any[] = []; // Store OpenAI-style message history

	constructor(leaf: WorkspaceLeaf, plugin: ObsidianAgentPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Agent Chat';
	}

	getProviderAndModel(aiProviders: any, settingValue: string) {
		if (!settingValue) return { provider: aiProviders.providers[0], model: undefined };
		
		const parts = settingValue.split("::");
		const providerId = parts[0];
		const model = parts[1];

		const provider = aiProviders.providers.find((p: any) => p.id === providerId);
		return { provider: provider || aiProviders.providers[0], model: model === 'default' ? undefined : model };
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass('agent-chat-container');

		this.messageContainer = container.createDiv('agent-message-container');
		this.messageContainer.style.flex = '1';
		this.messageContainer.style.overflowY = 'auto';
		this.messageContainer.style.padding = '10px';
		this.messageContainer.style.display = 'flex';
		this.messageContainer.style.flexDirection = 'column';
		this.messageContainer.style.gap = '10px';

		const inputContainer = container.createDiv('agent-input-container');
		inputContainer.style.display = 'flex';
		inputContainer.style.padding = '10px';
		inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';

		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'agent-chat-input',
			attr: { placeholder: 'Ask the agent to do something...' }
		});
		this.inputEl.style.flex = '1';
		this.inputEl.style.resize = 'none';
		this.inputEl.style.height = '60px';

		const sendBtn = inputContainer.createEl('button', { text: 'Send' });
		sendBtn.style.marginLeft = '10px';

		sendBtn.addEventListener('click', () => this.sendMessage());
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Initialize history
		this.history = [
			{ role: "system", content: this.plugin.settings.sidebarChatPrompt }
		];
	}

	addMessageToUI(role: string, text: string) {
		const msgEl = this.messageContainer.createDiv('agent-message');
		msgEl.style.padding = '10px';
		msgEl.style.borderRadius = '5px';
		msgEl.style.backgroundColor = role === 'user' ? 'var(--interactive-accent)' : 'var(--background-secondary)';
		msgEl.style.color = role === 'user' ? 'var(--text-on-accent)' : 'var(--text-normal)';
		msgEl.style.alignSelf = role === 'user' ? 'flex-end' : 'flex-start';
		msgEl.style.maxWidth = '85%';
		msgEl.style.whiteSpace = 'pre-wrap';

		// Parse basic markdown if needed, but for simplicity we'll just insert text
		msgEl.innerText = text;
		
		this.messageContainer.scrollTo({ top: this.messageContainer.scrollHeight, behavior: 'smooth' });
	}

	async sendMessage() {
		const text = this.inputEl.value.trim();
		if (!text) return;

		this.inputEl.value = '';
		this.addMessageToUI('user', text);
		this.history.push({ role: 'user', content: text });

		try {
			const aiResolver = await waitForAI();
			const aiProviders = await aiResolver.promise;

			if (!aiProviders.providers || aiProviders.providers.length === 0) {
				this.addMessageToUI('assistant', 'Error: No AI provider configured in obsidian-ai-providers settings.');
				return;
			}
			
			const { provider: chatProvider, model: chatModel } = this.getProviderAndModel(aiProviders, this.plugin.settings.chatModel);
			if (!chatProvider) return;

			// Define tools for the agent
			const tools: IAIToolDefinition[] = [
				{
					type: "function",
					function: {
						name: "read_file",
						description: "Reads the content of a markdown file in the vault.",
						parameters: {
							type: "object",
							properties: {
								path: { type: "string", description: "The path of the file to read, e.g. 'folder/file.md'" }
							},
							required: ["path"]
						}
					}
				},
				{
					type: "function",
					function: {
						name: "create_file",
						description: "Creates a new markdown file in the vault with the specified content.",
						parameters: {
							type: "object",
							properties: {
								path: { type: "string", description: "The path where to create the file, e.g. 'notes/new_note.md'" },
								content: { type: "string", description: "The markdown content of the file." }
							},
							required: ["path", "content"]
						}
					}
				},
				{
					type: "function",
					function: {
						name: "create_canvas",
						description: "Creates a new Obsidian Canvas file (.canvas). Canvases are JSON files containing nodes and edges. Always use nodes with type 'text' or 'file'.",
						parameters: {
							type: "object",
							properties: {
								path: { type: "string", description: "The path of the canvas, e.g. 'canvases/board.canvas'" },
								canvasJson: { type: "string", description: "The JSON string representation of the canvas data." }
							},
							required: ["path", "canvasJson"]
						}
					}
				},
				{
					type: "function",
					function: {
						name: "search_vault",
						description: "Performs a semantic search over the user's vault to find relevant context. Use this whenever the user asks about notes or vault contents.",
						parameters: {
							type: "object",
							properties: {
								query: { type: "string", description: "The search query to look for in the vault." }
							},
							required: ["query"]
						}
					}
				}
			];

			let isToolCallComplete = false;
			let currentHistory = [...this.history];

			// Loading indicator
			const loadingEl = this.messageContainer.createDiv();
			loadingEl.innerText = 'Agent is thinking...';
			loadingEl.style.fontStyle = 'italic';
			loadingEl.style.opacity = '0.7';

			while (!isToolCallComplete) {
				const assistantMessage = await aiProviders.toolsExecute({
					provider: chatProvider,
					model: chatModel,
					messages: currentHistory,
					tools: tools,
					tool_choice: "auto"
				});

				currentHistory.push(assistantMessage);

				if (assistantMessage.content) {
					loadingEl.remove();
					this.addMessageToUI('assistant', assistantMessage.content);
				}

				if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
					for (const toolCall of assistantMessage.tool_calls) {
						let toolResult = "";
						try {
							const args = JSON.parse(toolCall.function.arguments);
							
							if (toolCall.function.name === 'read_file') {
								const file = this.plugin.app.vault.getAbstractFileByPath(args.path);
								if (file instanceof TFile) {
									toolResult = await this.plugin.app.vault.read(file);
								} else {
									toolResult = `Error: File not found at ${args.path}`;
								}
							} else if (toolCall.function.name === 'create_file' || toolCall.function.name === 'create_canvas') {
								const content = toolCall.function.name === 'create_canvas' ? args.canvasJson : args.content;
								const file = await this.plugin.app.vault.create(args.path, content);
								toolResult = `Successfully created file at ${file.path}`;
							} else if (toolCall.function.name === 'search_vault') {
								const { provider: embedProvider, model: embedModel } = this.getProviderAndModel(aiProviders, this.plugin.settings.embeddingModel);
								
								// Read documents based on ragFolders
								const ragFolders = this.plugin.settings.ragFolders.split(',').map((f: string) => f.trim()).filter((f: string) => f);
								const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
								
								const filteredFiles = ragFolders.includes('/') || ragFolders.length === 0 
									? markdownFiles 
									: markdownFiles.filter((f: TFile) => ragFolders.some((folder: string) => f.path.startsWith(folder)));
								
								const documents = [];
								for (const file of filteredFiles) {
									try {
										const content = await this.plugin.app.vault.cachedRead(file);
										if (content.trim()) {
											documents.push({
												content: content,
												meta: { filename: file.name, path: file.path }
											});
										}
									} catch (e) {
										// Ignore read errors
									}
								}

								const results = await aiProviders.retrieve({
									query: args.query,
									documents: documents,
									embeddingProvider: embedProvider
								});
								
								toolResult = results.slice(0, 5).map((r: any) => `File: ${r.document.meta?.path}\nRelevance: ${r.score}\nContent: ${r.content}`).join("\n\n---\n\n");
								if (!toolResult) toolResult = "No relevant results found.";
							} else {
								toolResult = `Error: Unknown tool ${toolCall.function.name}`;
							}
						} catch (err: any) {
							toolResult = `Error executing tool: ${err.message}`;
						}

						currentHistory.push({
							role: "tool",
							tool_call_id: toolCall.id,
							name: toolCall.function.name,
							content: toolResult
						});
					}
				} else {
					isToolCallComplete = true;
				}
			}

			// Update history
			this.history = currentHistory;
			if(loadingEl.parentElement) {
				loadingEl.remove();
			}

		} catch (error) {
			console.error("Agent error:", error);
			this.addMessageToUI('assistant', 'Sorry, I encountered an error. Check the console for details.');
		}
	}

	async onClose() {
		// Cleanup if needed
	}
}
