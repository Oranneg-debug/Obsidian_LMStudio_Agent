import { Plugin, Notice } from 'obsidian';
import { DEFAULT_SETTINGS, AgentPluginSettings, AgentSettingTab } from "./settings";
import { initAI } from '@obsidian-ai-providers/sdk';
import { registerEditorCommands, registerCustomCommands } from './editor-commands';
import { ChatView, CHAT_VIEW_TYPE } from './chat-view';
import { processCanvasNode } from './canvas-commands';
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
		registerCustomCommands(this);

		// Register Canvas Node Toolbar button
		this.registerEvent((this.app.workspace as any).on('canvas:node-menu', (menu: any, node: any) => {
			menu.addSeparator();
			menu.addItem((item: any) => {
				item.setTitle('Process with Boardroom (#boardroom)')
					.setIcon('bot')
					.onClick(() => {
						const view = this.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
						if (view && view.getViewType() === 'canvas') {
							// @ts-ignore
							processCanvasNode(this, view.canvas, node, '#boardroom');
						}
					});
			});
			menu.addItem((item: any) => {
				item.setTitle('Process with Technical Council (#technical)')
					.setIcon('bot')
					.onClick(() => {
						const view = this.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
						if (view && view.getViewType() === 'canvas') {
							// @ts-ignore
							processCanvasNode(this, view.canvas, node, '#technical');
						}
					});
			});
			menu.addItem((item: any) => {
				item.setTitle('Process with Design Council (#design)')
					.setIcon('bot')
					.onClick(() => {
						const view = this.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
						if (view && view.getViewType() === 'canvas') {
							// @ts-ignore
							processCanvasNode(this, view.canvas, node, '#design');
						}
					});
			});
			menu.addItem((item: any) => {
				item.setTitle('Image Description Only (#vision)')
					.setIcon('image')
					.onClick(() => {
						const view = this.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
						if (view && view.getViewType() === 'canvas') {
							// @ts-ignore
							processCanvasNode(this, view.canvas, node, '#vision');
						}
					});
			});
		}));

		this.addCommand({
			id: 'canvas-process-node',
			name: 'Canvas: Process connected nodes with AI',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(require('obsidian').ItemView);
				if (view && view.getViewType() === 'canvas') {
					if (!checking) {
						// @ts-ignore
						const selection = Array.from(view.canvas.selection);
						if (selection.length === 1) {
							// @ts-ignore
							processCanvasNode(this, view.canvas, selection[0]);
						} else {
							new Notice("Please select exactly one prompt node.");
						}
					}
					return true;
				}
				return false;
			}
		});

		this.addRibbonIcon('bot', 'Open agent chat', () => {
			void this.activateChatView();
		});

		this.addCommand({
			id: 'open-agent-chat',
			name: 'Open agent chat',
			callback: () => {
				void this.activateChatView();
			}
		});

		initAI(this.app, this, async () => {
			// This callback fires when AI Providers is loaded and ready
			this.addSettingTab(new AgentSettingTab(this.app, this));
			new Notice("Agent connected to AI providers.");
		}).catch(console.error);
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
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<AgentPluginSettings>);
		
		// Migrate old ragFolders string to array
		if (typeof this.settings.ragFolders === 'string') {
			this.settings.ragFolders = (this.settings.ragFolders as string).split(',').map(s => s.trim()).filter(s => s);
		}
		if (!Array.isArray(this.settings.excludeFolders)) {
			this.settings.excludeFolders = [];
		}
		if (!Array.isArray(this.settings.customCommands)) {
			this.settings.customCommands = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
