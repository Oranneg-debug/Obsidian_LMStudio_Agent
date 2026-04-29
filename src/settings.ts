import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianAgentPlugin from "./main";
import { waitForAI } from '@obsidian-ai-providers/sdk';

export interface AgentPluginSettings {
	sidebarChatPrompt: string;
	editorRewritePrompt: string;
	editorAutocompletePrompt: string;
	chatModel: string;
	editModel: string;
	embeddingModel: string;
	ragFolders: string;
}

export const DEFAULT_SETTINGS: AgentPluginSettings = {
	sidebarChatPrompt: "You are a helpful Obsidian assistant. You can read, write, and organize notes and Canvas files. Use the search_vault tool if you need to search the vault.",
	editorRewritePrompt: "Rewrite the following text to improve clarity, grammar, and flow, while preserving the original meaning.",
	editorAutocompletePrompt: "Continue the following text naturally, maintaining the same tone and style.",
	chatModel: "",
	editModel: "",
	embeddingModel: "",
	ragFolders: "/"
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
		
		this.buildUI(containerEl);
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

		containerEl.createEl('h3', { text: 'Models Configuration' });

		new Setting(containerEl)
			.setName("Sidebar Chat Model")
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
			.setName("Editor Rewrite & Autocomplete Model")
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
			.setName("Embedding Model (RAG)")
			.setDesc("Select the provider and model to use for generating document embeddings for semantic search.")
			.addDropdown(dropdown => {
				dropdown.addOptions(modelsRecord)
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
						await this.plugin.saveSettings();
					});
			});

		containerEl.createEl('h3', { text: 'RAG Configuration' });

		new Setting(containerEl)
			.setName("RAG Folders")
			.setDesc("Comma-separated list of folders to index for semantic search (e.g., 'Notes, Journal'). Leave as '/' to index the entire vault.")
			.addText(text => text
				.setPlaceholder("Notes, Journal")
				.setValue(this.plugin.settings.ragFolders)
				.onChange(async (value) => {
					this.plugin.settings.ragFolders = value;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl('h3', { text: 'System Prompts' });

		new Setting(containerEl)
			.setName("Sidebar Chat Prompt")
			.setDesc("System prompt for the sidebar chat agent.")
			.addTextArea((text) => text
				.setPlaceholder("Enter system prompt")
				.setValue(this.plugin.settings.sidebarChatPrompt)
				.onChange(async (value) => {
					this.plugin.settings.sidebarChatPrompt = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Editor Rewrite Prompt")
			.setDesc("System prompt used when rewriting selected text in the editor.")
			.addTextArea((text) => text
				.setPlaceholder("Enter system prompt")
				.setValue(this.plugin.settings.editorRewritePrompt)
				.onChange(async (value) => {
					this.plugin.settings.editorRewritePrompt = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Editor Autocomplete Prompt")
			.setDesc("System prompt used when generating text at the cursor in the editor.")
			.addTextArea((text) => text
				.setPlaceholder("Enter system prompt")
				.setValue(this.plugin.settings.editorAutocompletePrompt)
				.onChange(async (value) => {
					this.plugin.settings.editorAutocompletePrompt = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
