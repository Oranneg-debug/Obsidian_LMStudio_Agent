import { Editor, MarkdownView, Notice } from 'obsidian';
import ObsidianAgentPlugin from './main';
import { waitForAI } from '@obsidian-ai-providers/sdk';

export function getProviderAndModel(aiProviders: any, settingValue: string) {
	if (!settingValue) return { provider: aiProviders.providers[0], model: undefined };
	
	const parts = settingValue.split("::");
	const providerId = parts[0];
	const model = parts[1];

	const provider = aiProviders.providers.find((p: any) => p.id === providerId);
	return { provider: provider || aiProviders.providers[0], model: model === 'default' ? undefined : model };
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

			try {
				const aiResolver = await waitForAI();
				const aiProviders = await aiResolver.promise;

				if (!aiProviders.providers || aiProviders.providers.length === 0) {
					new Notice('No AI provider configured. Please configure obsidian-ai-providers plugin.');
					return;
				}
				const { provider: editProvider, model: editModel } = getProviderAndModel(aiProviders, plugin.settings.editModel);
				if (!editProvider) return;

				new Notice('Rewriting text...');

				const result = await aiProviders.execute({
					provider: editProvider,
					model: editModel,
					messages: [
						{ role: "system", content: plugin.settings.editorRewritePrompt },
						{ role: "user", content: selection }
					],
				});

				editor.replaceSelection(result);
			} catch (error) {
				console.error(error);
				new Notice('Failed to rewrite text.');
			}
		}
	});

	plugin.addCommand({
		id: 'agent-autocomplete',
		name: 'Autocomplete at cursor',
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const cursor = editor.getCursor();
			// Get the last 2000 characters to provide context without overloading the prompt
			const textBeforeCursor = editor.getRange(
				{ line: Math.max(0, cursor.line - 100), ch: 0 }, 
				cursor
			);
			
			try {
				const aiResolver = await waitForAI();
				const aiProviders = await aiResolver.promise;

				if (!aiProviders.providers || aiProviders.providers.length === 0) {
					new Notice('No AI provider configured. Please configure obsidian-ai-providers plugin.');
					return;
				}
				const { provider: editProvider, model: editModel } = getProviderAndModel(aiProviders, plugin.settings.editModel);
				if (!editProvider) return;

				new Notice('Autocompleting...');

				const result = await aiProviders.execute({
					provider: editProvider,
					model: editModel,
					messages: [
						{ role: "system", content: plugin.settings.editorAutocompletePrompt },
						{ role: "user", content: `Here is the document context before the cursor:\n\n${textBeforeCursor}\n\nContinue the text from exactly where it leaves off.` }
					],
				});

				editor.replaceRange(result, cursor);
			} catch (error) {
				console.error(error);
				new Notice('Failed to autocomplete.');
			}
		}
	});
}
