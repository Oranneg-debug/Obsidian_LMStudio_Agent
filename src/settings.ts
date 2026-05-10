import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ObsidianAgentPlugin from "./main";
import { waitForAI } from '@obsidian-ai-providers/sdk';

export interface AgentCustomCommand {
	id: string;
	name: string;
	prompt: string;
}

export interface AgentPluginSettings {
	sidebarChatPrompt: string;
	editorRewritePrompt: string;
	editorAutocompletePrompt: string;
	chatModel: string;
	editModel: string;
	embeddingModel: string;
	ragFolders: string[];
	excludeFolders: string[];
	customCommands: AgentCustomCommand[];
	metaPromptTemplate: string;
	chatHistoryFolder: string;
	embeddingCacheBuster: number;
	enableFileModifications: boolean;
	enableWebScraping: boolean;
	modifyExcludeFolders: string[];
	memoryFolder: string;
	comfyUIUrl: string;
	comfyUIWorkflow: string;
	autoAnalyzeOnStartup: boolean;
	templateFolder: string;
}

export const DEFAULT_SETTINGS: AgentPluginSettings = {
	sidebarChatPrompt: "You are a helpful Obsidian assistant. You can read, write, and organize notes and Canvas files. Use the search_vault tool if you need to search the vault.",
	editorRewritePrompt: "Rewrite the following text to improve clarity, grammar, and flow, while preserving the original meaning.",
	editorAutocompletePrompt: "Continue the following text naturally, maintaining the same tone and style.",
	chatModel: "",
	editModel: "",
	embeddingModel: "",
	ragFolders: ["/"],
	excludeFolders: [],
	customCommands: [],
	metaPromptTemplate: "You are an expert prompt engineer. Help me write a detailed and effective prompt about: ",
	chatHistoryFolder: "AI Chats",
	embeddingCacheBuster: 0,
	enableFileModifications: false,
	enableWebScraping: false,
	modifyExcludeFolders: [],
	memoryFolder: "",
	comfyUIUrl: "http://127.0.0.1:8188",
	comfyUIWorkflow: "",
	autoAnalyzeOnStartup: false,
	templateFolder: "Templates"
};

export class AgentSettingTab extends PluginSettingTab {
	plugin: ObsidianAgentPlugin;

	constructor(app: App, plugin: ObsidianAgentPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		
		void this.buildUI(containerEl);
	}

	private createCollapsible(containerEl: HTMLElement, title: string, defaultOpen = false): HTMLElement {
		const wrapper = containerEl.createDiv();
		const header = wrapper.createDiv();
		header.setCssStyles({
			display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
			padding: '8px 0', borderBottom: '1px solid var(--background-modifier-border)',
			marginBottom: '8px', userSelect: 'none'
		});
		const arrow = header.createSpan({ text: defaultOpen ? '▼' : '►' });
		arrow.setCssStyles({ fontSize: '0.7em', color: 'var(--text-muted)' });
		header.createSpan({ text: title }).setCssStyles({ fontWeight: '600', fontSize: '0.95em' });

		const content = wrapper.createDiv();
		content.setCssStyles({ display: defaultOpen ? 'block' : 'none', paddingLeft: '4px' });

		header.addEventListener('click', () => {
			const isOpen = content.style.display !== 'none';
			content.setCssStyles({ display: isOpen ? 'none' : 'block' });
			arrow.textContent = isOpen ? '►' : '▼';
		});

		return content;
	}

	async buildUI(containerEl: HTMLElement) {
		const aiResolver = await waitForAI();
		const aiProviders = await aiResolver.promise;

		let modelsRecord: Record<string, string> = {};
		modelsRecord[""] = "Default (First Available)";

		if (aiProviders.providers) {
			for (const provider of aiProviders.providers) {
				if (provider.availableModels && provider.availableModels.length > 0) {
					for (const model of provider.availableModels) {
						modelsRecord[`${provider.id}::${model}`] = `${provider.name} - ${model}`;
					}
				} else {
					modelsRecord[`${provider.id}::${provider.model || 'default'}`] = `${provider.name} - ${provider.model || 'Default'}`;
				}
			}
		}

		// ── Models ──────────────────────────────────────────
		new Setting(containerEl).setName("Models").setHeading();

		new Setting(containerEl)
			.setName("Sidebar chat model")
			.setDesc("Provider and model for the sidebar chat.")
			.addDropdown(dropdown => {
				dropdown.addOptions(modelsRecord)
					.setValue(this.plugin.settings.chatModel)
					.onChange(async (value) => {
						this.plugin.settings.chatModel = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Editor rewrite & autocomplete model")
			.setDesc("Provider and model for editor actions.")
			.addDropdown(dropdown => {
				dropdown.addOptions(modelsRecord)
					.setValue(this.plugin.settings.editModel)
					.onChange(async (value) => {
						this.plugin.settings.editModel = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Embedding model")
			.setDesc("Model used for semantic search and related notes (e.g. BGE).")
			.addDropdown(dropdown => {
				dropdown.addOptions(modelsRecord)
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					});
			});

		// ── Semantic Search ─────────────────────────────────
		const searchSection = this.createCollapsible(containerEl, '🔍 Semantic Search');

		new Setting(searchSection)
			.setName("Update embeddings")
			.setDesc("Pre-calculate embeddings for your vault.")
			.addButton((button) => {
				button.setButtonText("Start embedding process").onClick(async () => {
					new Notice("Embedding process started... (Running in background)");
					try {
						const resolver = await waitForAI();
						const aiProviders = await resolver.promise;
						const parts = this.plugin.settings.embeddingModel.split("::");
						const provider = aiProviders.providers.find((p: { id: string }) => p.id === parts[0]);
						if (!provider) throw new Error("No embedding provider selected.");
						
						const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
						const documents = [];
						for (const f of markdownFiles) {
							const content = await this.plugin.app.vault.cachedRead(f);
							if (content.trim()) documents.push({ content, meta: { path: f.path } });
						}
						
						await aiProviders.retrieve({
							query: "warmup",
							documents: documents,
							embeddingProvider: provider
						});
						new Notice("Embedding process complete!");
					} catch (e) {
						new Notice("Failed to complete embedding process.");
						console.error(e);
					}
				});
			});

		new Setting(searchSection)
			.setName("Clear embedding cache")
			.setDesc("Force re-scan vault with current model.")
			.addButton((button) => {
				button.setButtonText("Reset Cache")
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.embeddingCacheBuster = (this.plugin.settings.embeddingCacheBuster || 0) + 1;
					await this.plugin.saveSettings();
					new Notice("Embedding cache reset!");
				});
			});

		new Setting(searchSection)
			.setName("Included folders")
			.setDesc("Folders to index. Use '/' for entire vault.")
			.addButton((button) => {
				button.setButtonText("Add folder").onClick(async () => {
					this.plugin.settings.ragFolders.push("");
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.ragFolders.forEach((folder, index) => {
			new Setting(searchSection)
				.addText(text => text
					.setPlaceholder("Folder name")
					.setValue(folder)
					.onChange(async (value) => {
						this.plugin.settings.ragFolders[index] = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(button => button
					.setIcon("trash")
					.setTooltip("Remove")
					.onClick(async () => {
						this.plugin.settings.ragFolders.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});

		new Setting(searchSection)
			.setName("Excluded folders")
			.setDesc("Folders to ignore during search.")
			.addButton((button) => {
				button.setButtonText("Add folder").onClick(async () => {
					this.plugin.settings.excludeFolders.push("");
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.excludeFolders.forEach((folder, index) => {
			new Setting(searchSection)
				.addText(text => text
					.setPlaceholder("Folder name")
					.setValue(folder)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders[index] = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(button => button
					.setIcon("trash")
					.setTooltip("Remove")
					.onClick(async () => {
						this.plugin.settings.excludeFolders.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});

		// ── Agentic Capabilities ────────────────────────────
		new Setting(containerEl).setName("Agent Capabilities").setHeading();

		new Setting(containerEl)
			.setName("Enable file modifications")
			.setDesc("Allow the agent to edit, move, and delete files. Requires permission per action.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableFileModifications)
					.onChange(async (value) => {
						this.plugin.settings.enableFileModifications = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.enableFileModifications) {
			new Setting(containerEl)
				.setName("Modification exclude folders")
				.setDesc("Folders the agent cannot modify. Comma-separated.")
				.addTextArea((text) => {
					text
						.setPlaceholder("Templates, Archive")
						.setValue(this.plugin.settings.modifyExcludeFolders.join(", "))
						.onChange(async (value) => {
							this.plugin.settings.modifyExcludeFolders = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
							await this.plugin.saveSettings();
						});
					text.inputEl.setCssStyles({ width: '100%' });
				});
		}

		new Setting(containerEl)
			.setName("Enable web scraping & YouTube")
			.setDesc("Allow web search (DuckDuckGo), URL fetching, and YouTube transcript summarization.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableWebScraping)
					.onChange(async (value) => {
						this.plugin.settings.enableWebScraping = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Agent memory folder")
			.setDesc("Files in this folder are always injected into the agent's context.")
			.addText(text => text
				.setPlaceholder("Agent Memory")
				.setValue(this.plugin.settings.memoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.memoryFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Chat history folder")
			.setDesc("Where saved chats are stored.")
			.addText(text => text
				.setPlaceholder("AI Chats")
				.setValue(this.plugin.settings.chatHistoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.chatHistoryFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Template folder")
			.setDesc("Folder containing your note templates.")
			.addText(text => text
				.setPlaceholder("Templates")
				.setValue(this.plugin.settings.templateFolder)
				.onChange(async (value) => {
					this.plugin.settings.templateFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-analyze vault on startup")
			.setDesc("Automatically run vault analysis when Obsidian starts (saves to memory folder).")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.autoAnalyzeOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.autoAnalyzeOnStartup = value;
						await this.plugin.saveSettings();
					});
			});

		// ── ComfyUI (collapsible) ───────────────────────────
		const comfySection = this.createCollapsible(containerEl, '🎨 ComfyUI Integration');

		new Setting(comfySection)
			.setName("ComfyUI URL")
			.setDesc("Local ComfyUI API endpoint.")
			.addText(text => text
				.setPlaceholder("http://127.0.0.1:8188")
				.setValue(this.plugin.settings.comfyUIUrl)
				.onChange(async (value) => {
					this.plugin.settings.comfyUIUrl = value;
					await this.plugin.saveSettings();
				}));

		const comfyWorkflowSetting = new Setting(comfySection)
			.setName("Custom workflow JSON")
			.setDesc("Paste a ComfyUI workflow JSON. Use {prompt} as a placeholder for the text prompt.");
		comfyWorkflowSetting.addTextArea((text) => {
			text.setPlaceholder('{"prompt": {prompt}}')
				.setValue(this.plugin.settings.comfyUIWorkflow)
				.onChange(async (value) => {
					this.plugin.settings.comfyUIWorkflow = value;
					await this.plugin.saveSettings();
				});
			text.inputEl.setCssStyles({ width: '100%', minHeight: '80px', marginTop: '6px', fontFamily: 'monospace', fontSize: '0.8em' });
			return text;
		});
		comfyWorkflowSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		// ── Editor Commands (collapsible) ───────────────────
		const cmdSection = this.createCollapsible(containerEl, '⌨️ Editor Commands');

		new Setting(cmdSection)
			.setDesc("Custom editor commands that appear in the right-click menu.")
			.addButton((button) => {
				button.setButtonText("Add command").onClick(async () => {
					this.plugin.settings.customCommands.push({ id: `custom-cmd-${Date.now()}`, name: "", prompt: "" });
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.customCommands.forEach((cmd, index) => {
			const div = cmdSection.createDiv();
			div.setCssStyles({
				border: "1px solid var(--background-modifier-border)",
				padding: "10px",
				marginBottom: "10px",
				borderRadius: "5px"
			});

			new Setting(div)
				.setName("Command name")
				.addText(text => text
					.setValue(cmd.name)
					.onChange(async (value) => {
						if (this.plugin.settings.customCommands[index]) {
							this.plugin.settings.customCommands[index].name = value;
							await this.plugin.saveSettings();
						}
					})
				)
				.addButton(button => button
					.setIcon("trash")
					.setTooltip("Remove command")
					.onClick(async () => {
						this.plugin.settings.customCommands.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);

			const promptSetting = new Setting(div)
				.setName("System prompt")
				.addTextArea(text => {
					text.setValue(cmd.prompt)
						.onChange(async (value) => {
							if (this.plugin.settings.customCommands[index]) {
								this.plugin.settings.customCommands[index].prompt = value;
								await this.plugin.saveSettings();
							}
						});
					text.inputEl.setCssStyles({ width: '100%', minHeight: '80px' });
					return text;
				});
			promptSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });
		});

		// ── System Prompts (collapsible) ────────────────────
		const promptSection = this.createCollapsible(containerEl, '💬 System Prompts');

		const sidebarSetting = new Setting(promptSection)
			.setName("Sidebar chat prompt")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.sidebarChatPrompt)
					.onChange(async (value) => {
						this.plugin.settings.sidebarChatPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '80px', marginTop: '6px' });
				return text;
			});
		sidebarSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const metaSetting = new Setting(promptSection)
			.setName("Meta-prompt template")
			.addTextArea((text) => {
				text.setPlaceholder("Enter meta-prompt template")
					.setValue(this.plugin.settings.metaPromptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.metaPromptTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '50px', marginTop: '6px' });
				return text;
			});
		metaSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const editorRewriteSetting = new Setting(promptSection)
			.setName("Editor rewrite prompt")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.editorRewritePrompt)
					.onChange(async (value) => {
						this.plugin.settings.editorRewritePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '50px', marginTop: '6px' });
				return text;
			});
		editorRewriteSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const editorAutoSetting = new Setting(promptSection)
			.setName("Editor autocomplete prompt")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.editorAutocompletePrompt)
					.onChange(async (value) => {
						this.plugin.settings.editorAutocompletePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '50px', marginTop: '6px' });
				return text;
			});
		editorAutoSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });
	}
}
