import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianAgentPlugin from "./main";

export interface AgentPluginSettings {
	sidebarChatPrompt: string;
	editorRewritePrompt: string;
	editorAutocompletePrompt: string;
}

export const DEFAULT_SETTINGS: AgentPluginSettings = {
	sidebarChatPrompt: "You are a helpful Obsidian assistant. You can read, write, and organize notes and Canvas files.",
	editorRewritePrompt: "Rewrite the following text to improve clarity, grammar, and flow, while preserving the original meaning.",
	editorAutocompletePrompt: "Continue the following text naturally, maintaining the same tone and style."
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
