import { Editor, MarkdownView, Notice, TFile } from 'obsidian';
import ObsidianAgentPlugin from './main';
import { waitForAI, IAIProvidersService, IAIProvider } from '@obsidian-ai-providers/sdk';

export function getProviderAndModel(aiProviders: IAIProvidersService, settingValue: string): { provider?: IAIProvider, model?: string } {
	if (!settingValue) return { provider: aiProviders.providers[0], model: undefined };
	
	const parts = settingValue.split("::");
	const providerId = parts[0];
	const model = parts[1];

	const provider = aiProviders.providers.find(p => p.id === providerId);
	return { provider: provider || aiProviders.providers[0], model: model === 'default' ? undefined : model };
}

export async function executeEditorCommand(
	plugin: ObsidianAgentPlugin, 
	editor: Editor, 
	systemPrompt: string, 
	userPrompt: string, 
	noticeMessage: string
): Promise<string | null> {
	try {
		const aiResolver = await waitForAI();
		const aiProviders = await aiResolver.promise;

		if (!aiProviders.providers || aiProviders.providers.length === 0) {
			new Notice('No AI provider configured.');
			return null;
		}
		const { provider: editProvider, model: editModel } = getProviderAndModel(aiProviders, plugin.settings.editModel);
		if (!editProvider) return null;

		new Notice(noticeMessage);

		const result = await aiProviders.execute({
			provider: editProvider,
			model: editModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt }
			],
			abortController: new AbortController()
		});

		if (result && typeof result === 'string') {
			return result;
		} else if (result) {
			return JSON.stringify(result, null, 2);
		}
		
		return null;
	} catch (error) {
		console.error(error);
		new Notice('Failed to execute command.');
		return null;
	}
}

export function registerEditorCommands(plugin: ObsidianAgentPlugin) {
	plugin.addCommand({
		id: 'agent-rewrite-selection',
		name: 'Rewrite selected text',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice('Please select some text to rewrite.');
				return;
			}

			const result = await executeEditorCommand(
				plugin,
				editor,
				plugin.settings.editorRewritePrompt,
				selection,
				'Rewriting text...'
			);

			if (result) {
				editor.replaceSelection(result);
			}
		}
	});

	plugin.addCommand({
		id: 'agent-autocomplete',
		name: 'Autocomplete at cursor',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const cursor = editor.getCursor();
			const textBeforeCursor = editor.getRange(
				{ line: Math.max(0, cursor.line - 100), ch: 0 }, 
				cursor
			);
			
			const result = await executeEditorCommand(
				plugin,
				editor,
				plugin.settings.editorAutocompletePrompt,
				`Here is the document context before the cursor:\n\n${textBeforeCursor}\n\nContinue the text from exactly where it leaves off.`,
				'Autocompleting...'
			);

			if (result) {
				editor.replaceRange(result, cursor);
			}
		}
	});

	const sendToCogOS = async (selection: string, prefix: string, sourceFile: any) => {
		if (plugin.settings.closeChatOnBoardroom && (prefix.includes('boardroom') || selection.includes('#boardroom'))) {
			await plugin.closeChatView();
			new Notice('📉 Closing chat to free VRAM for Boardroom deliberation...');
		}

		new Notice('🧠 Sending to Cognitive OS... Check your vault in a few minutes!');
		try {
			const res = await fetch(plugin.settings.cognitiveOSUrl || 'http://127.0.0.1:5000/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					prompt: prefix + selection,
					compass_weight: plugin.settings.globalCompassWeight
				})
			});
			const data = await res.json();
			
			if (data.relative_path) {
				const file = plugin.app.vault.getAbstractFileByPath(data.relative_path);
				if (file instanceof TFile) {
					const leaf = plugin.app.workspace.getLeaf('tab');
					await leaf.openFile(file);
					new Notice('✅ Cognitive OS process complete! Note opened.');
				} else {
					new Notice('✅ Cognitive OS process complete! File saved, but could not auto-open (path mismatch).');
				}
			} else {
				new Notice('✅ Cognitive OS process complete!');
			}
			
		} catch(e) {
			console.error("Cognitive OS Error:", e);
			new Notice('❌ Failed to reach Cognitive OS. Is the FastAPI server running on port 5000?');
		}
	};

	plugin.addCommand({
		id: 'agent-consult-cognitive-os-auto',
		name: 'Cognitive OS: Auto-Route Council',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice('Please select some text.');
				return;
			}
			sendToCogOS(selection, "", view.file);
		}
	});

	plugin.addCommand({
		id: 'agent-consult-cognitive-os-design',
		name: 'Cognitive OS: Design Council',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice('Please select some text.');
				return;
			}
			sendToCogOS(selection, plugin.settings.cogDesignPrompt, view.file);
		}
	});

	plugin.addCommand({
		id: 'agent-consult-cognitive-os-tech',
		name: 'Cognitive OS: Technical Council',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice('Please select some text.');
				return;
			}
			sendToCogOS(selection, plugin.settings.cogTechPrompt, view.file);
		}
	});

	plugin.addCommand({
		id: 'agent-consult-cognitive-os-boardroom',
		name: 'Cognitive OS: Boardroom',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice('Please select some text.');
				return;
			}
			sendToCogOS(selection, plugin.settings.cogBoardroomPrompt, view.file);
		}
	});
}

export function registerCustomCommands(plugin: ObsidianAgentPlugin) {
	plugin.settings.customCommands.forEach(cmd => {
		if (!cmd.name || !cmd.prompt) return;
		
		plugin.addCommand({
			id: cmd.id,
			name: cmd.name,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (!selection) {
					new Notice('Please select some text to process.');
					return;
				}

				const result = await executeEditorCommand(
					plugin,
					editor,
					cmd.prompt,
					selection,
					`Running ${cmd.name}...`
				);

				if (result) {
					editor.replaceSelection(result);
				}
			}
		});
	});
}
