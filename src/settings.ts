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
	modifyExcludeFolders: []
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

		new Setting(containerEl).setName("Models configuration").setHeading();

		new Setting(containerEl)
			.setName("Sidebar chat model")
			.setDesc("Select the provider and model to use for the sidebar chat.")
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
			.setDesc("Select the provider and model to use for editor actions.")
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
			.setDesc("Select the provider and model to use for generating document embeddings for semantic search.")
			.addDropdown(dropdown => {
				dropdown.addOptions(modelsRecord)
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("Semantic search configuration").setHeading();

		new Setting(containerEl)
			.setName("Update Embeddings")
			.setDesc("Pre-calculate embeddings for your vault to speed up semantic search.")
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

		new Setting(containerEl)
			.setName("Clear embedding cache")
			.setDesc("If your related notes are stuck showing the same files, click this to force the AI to completely re-scan your vault with the current model.")
			.addButton((button) => {
				button.setButtonText("Reset Cache")
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.embeddingCacheBuster = (this.plugin.settings.embeddingCacheBuster || 0) + 1;
					await this.plugin.saveSettings();
					new Notice("Embedding cache reset! Notes will be re-scanned next time they are searched.");
				});
			});

		new Setting(containerEl)
			.setName("Included folders")
			.setDesc("Folders to index for semantic search. Use '/' for the entire vault.")
			.addButton((button) => {
				button.setButtonText("Add folder").onClick(async () => {
					this.plugin.settings.ragFolders.push("");
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.ragFolders.forEach((folder, index) => {
			new Setting(containerEl)
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

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Folders to explicitly ignore during semantic search.")
			.addButton((button) => {
				button.setButtonText("Add folder").onClick(async () => {
					this.plugin.settings.excludeFolders.push("");
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.excludeFolders.forEach((folder, index) => {
			new Setting(containerEl)
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

		new Setting(containerEl).setName("Custom commands").setHeading();
		
		new Setting(containerEl)
			.setName("Editor commands")
			.setDesc("Add your own custom commands.")
			.addButton((button) => {
				button.setButtonText("Add command").onClick(async () => {
					this.plugin.settings.customCommands.push({ id: `custom-cmd-${Date.now()}`, name: "", prompt: "" });
					await this.plugin.saveSettings();
					this.display();
				});
			});

		this.plugin.settings.customCommands.forEach((cmd, index) => {
			const div = containerEl.createDiv();
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

			new Setting(div)
				.setName("System prompt")
				.addTextArea(text => text
					.setValue(cmd.prompt)
					.onChange(async (value) => {
						if (this.plugin.settings.customCommands[index]) {
							this.plugin.settings.customCommands[index].prompt = value;
							await this.plugin.saveSettings();
						}
					})
				);
		});

		new Setting(containerEl)
			.setName("Chat history folder")
			.setDesc("Folder path where your AI chats will be saved (e.g. 'AI Chats'). It will be created if it doesn't exist.")
			.addText(text => text
				.setPlaceholder("AI Chats")
				.setValue(this.plugin.settings.chatHistoryFolder)
				.onChange(async (value) => {
					this.plugin.settings.chatHistoryFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName("Agentic Capabilities").setHeading();

		new Setting(containerEl)
			.setName("Enable File Modifications")
			.setDesc("DANGEROUS: Allow the agent to edit, move, and delete files in your vault. It will prompt for permission before execution.")
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
				.setName("Modify Exclude Folders")
				.setDesc("Folders where the agent is strictly forbidden from modifying, moving, or deleting files. Comma separated (e.g. 'Templates, Archive').")
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
			.setName("Enable Web Scraping")
			.setDesc("Allow the agent to search the web (via DuckDuckGo) and fetch text from specific URLs.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableWebScraping)
					.onChange(async (value) => {
						this.plugin.settings.enableWebScraping = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName("System prompts").setHeading();

		const sidebarSetting = new Setting(containerEl)
			.setName("Sidebar chat prompt")
			.setDesc("System prompt for the sidebar chat agent.")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.sidebarChatPrompt)
					.onChange(async (value) => {
						this.plugin.settings.sidebarChatPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '100px', marginTop: '10px' });
				return text;
			});
		sidebarSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const metaSetting = new Setting(containerEl)
			.setName("Meta-prompt template")
			.setDesc("Fixed prompt used for writing other prompts (appears as the 4th prompt).")
			.addTextArea((text) => {
				text.setPlaceholder("Enter meta-prompt template")
					.setValue(this.plugin.settings.metaPromptTemplate)
					.onChange(async (value) => {
						this.plugin.settings.metaPromptTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '60px', marginTop: '10px' });
				return text;
			});
		metaSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const editorRewriteSetting = new Setting(containerEl)
			.setName("Editor rewrite prompt")
			.setDesc("System prompt used when rewriting selected text in the editor.")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.editorRewritePrompt)
					.onChange(async (value) => {
						this.plugin.settings.editorRewritePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '60px', marginTop: '10px' });
				return text;
			});
		editorRewriteSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });

		const editorAutoSetting = new Setting(containerEl)
			.setName("Editor autocomplete prompt")
			.setDesc("System prompt used when autocompleting text in the editor.")
			.addTextArea((text) => {
				text.setPlaceholder("Enter system prompt")
					.setValue(this.plugin.settings.editorAutocompletePrompt)
					.onChange(async (value) => {
						this.plugin.settings.editorAutocompletePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setCssStyles({ width: '100%', minHeight: '60px', marginTop: '10px' });
				return text;
			});
		editorAutoSetting.settingEl.setCssStyles({ flexDirection: 'column', alignItems: 'stretch' });
	}
}
