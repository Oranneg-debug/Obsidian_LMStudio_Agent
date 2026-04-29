import { Editor, MarkdownView, Notice } from 'obsidian';
import ObsidianAgentPlugin from './main';
import { waitForAI } from '@obsidian-ai-providers/sdk';

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
				const provider = aiProviders.providers[0];
				if (!provider) return;

				new Notice('Rewriting text...');

				const result = await aiProviders.execute({
					provider,
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
				const provider = aiProviders.providers[0];
				if (!provider) return;

				new Notice('Autocompleting...');

				const result = await aiProviders.execute({
					provider,
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
