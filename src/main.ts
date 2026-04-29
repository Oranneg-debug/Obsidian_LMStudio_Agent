import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, AgentPluginSettings, AgentSettingTab } from "./settings";
import { initAI, waitForAI } from '@obsidian-ai-providers/sdk';
import { registerEditorCommands } from './editor-commands';
import { ChatView, CHAT_VIEW_TYPE } from './chat-view';
import '@obsidian-ai-providers/sdk/styles.css';

export default class ObsidianAgentPlugin extends Plugin {
	settings: AgentPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			CHAT_VIEW_TYPE,
			(leaf) => new ChatView(leaf, this)
		);

		// Register AI commands immediately so they show up in the UI
		registerEditorCommands(this);

		this.addRibbonIcon('bot', 'Open Agent Chat', () => {
			this.activateChatView();
		});

		this.addCommand({
			id: 'open-agent-chat',
			name: 'Open Agent Chat',
			callback: () => {
				this.activateChatView();
			}
		});

		initAI(this.app, this, async () => {
			// This callback fires when AI Providers is loaded and ready
			this.addSettingTab(new AgentSettingTab(this.app, this));
			new Notice("Obsidian LMStudio Agent connected to AI Providers.");
		});
	}

	async activateChatView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: CHAT_VIEW_TYPE,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<AgentPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
