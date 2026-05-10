import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView, MarkdownRenderer, Component, Menu, requestUrl } from 'obsidian';
import ObsidianAgentPlugin from './main';
import { waitForAI, IAIToolDefinition, IAIProvidersService, IAIProvider, IChatMessage } from '@obsidian-ai-providers/sdk';

export const CHAT_VIEW_TYPE = 'agent-chat-view';

interface SpeechRecognitionEvent {
	results: { transcript: string }[][];
}

interface ISpeechRecognition {
	start(): void;
	stop(): void;
	onstart: () => void;
	onend: () => void;
	onresult: (event: SpeechRecognitionEvent) => void;
}

interface ContextItem {
	file: TFile;
	weight: number;
}

export class ChatView extends ItemView {
	plugin: ObsidianAgentPlugin;
	messageContainer: HTMLElement;
	inputEl: HTMLTextAreaElement;
	history: IChatMessage[] = []; 
	
	useRagCheckbox: HTMLInputElement;
	overridePromptCheckbox: HTMLInputElement;
	overridePromptTextarea: HTMLTextAreaElement;
	pendingAttachments: TFile[] = [];
	attachmentsList: HTMLElement;
	activeContextFiles: ContextItem[] = [];
	activeContextContainer: HTMLElement;
	suggestionBox: HTMLElement;
	scrollContainer: HTMLElement;
	relatableNotesContainer: HTMLElement;
	chatTitleInput: HTMLInputElement;
	selectedSuggestionIndex: number = -1;
	sessionPermissionsGranted: boolean = false;
	activeAbortController: AbortController | null = null;
	modelSelectorEl: HTMLSelectElement;

	constructor(leaf: WorkspaceLeaf, plugin: ObsidianAgentPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Agent chat';
	}

	getIcon(): string {
		return 'bot';
	}

	getProviderAndModel(aiProviders: IAIProvidersService, settingValue: string): { provider?: IAIProvider, model?: string } {
		if (!settingValue) return { provider: aiProviders.providers[0], model: undefined };
		
		const parts = settingValue.split("::");
		const providerId = parts[0];
		const model = parts[1];

		const provider = aiProviders.providers.find(p => p.id === providerId);
		return { provider: provider || aiProviders.providers[0], model: model === 'default' ? undefined : model };
	}

	async requestToolPermission(action: string, path: string): Promise<'once' | 'session' | 'deny'> {
		if (this.sessionPermissionsGranted) return 'session';

		return new Promise((resolve) => {
			const promptEl = this.messageContainer.createDiv('agent-message');
			promptEl.setCssStyles({
				padding: '10px',
				borderRadius: '5px',
				backgroundColor: 'var(--background-secondary)',
				border: '1px solid var(--interactive-accent)',
				color: 'var(--text-normal)',
				alignSelf: 'flex-start',
				maxWidth: '85%',
				marginTop: '10px',
				marginBottom: '10px'
			});

			promptEl.createDiv({ text: `The agent wants to ${action} ` }).createEl('strong', { text: path });
			promptEl.createDiv({ text: "Do you allow this action?" }).setCssStyles({ marginBottom: '10px', fontSize: '0.9em', color: 'var(--text-muted)' });

			const btnRow = promptEl.createDiv();
			btnRow.setCssStyles({ display: 'flex', gap: '5px', flexWrap: 'wrap' });

			const onceBtn = btnRow.createEl('button', { text: 'Approve Once' });
			onceBtn.onclick = () => {
				promptEl.remove();
				resolve('once');
			};

			const sessionBtn = btnRow.createEl('button', { text: 'Approve for Session' });
			sessionBtn.onclick = () => {
				this.sessionPermissionsGranted = true;
				promptEl.remove();
				resolve('session');
			};

			const denyBtn = btnRow.createEl('button', { text: 'Deny' });
			denyBtn.onclick = () => {
				promptEl.remove();
				resolve('deny');
			};
			
			this.scrollContainer.scrollTo({ top: this.scrollContainer.scrollHeight, behavior: 'smooth' });
		});
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;
		container.empty();
		container.addClass('agent-chat-container');
		container.setCssStyles({ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' });

		const header = container.createDiv();
		header.setCssStyles({
			display: 'flex',
			justifyContent: 'space-between',
			alignItems: 'center',
			padding: '5px 10px',
			borderBottom: '1px solid var(--background-modifier-border)',
			backgroundColor: 'var(--background-secondary)'
		});

		this.chatTitleInput = header.createEl('input', { type: 'text', value: 'New Chat' });
		this.chatTitleInput.setCssStyles({
			flex: '1',
			marginRight: '10px',
			backgroundColor: 'transparent',
			border: 'none',
			borderBottom: '1px dashed var(--background-modifier-border)',
			fontSize: '0.9em',
			padding: '2px 5px',
			color: 'var(--text-normal)'
		});

		const btnGroup = header.createDiv();
		btnGroup.setCssStyles({ display: 'flex', gap: '5px' });

		const newChatBtn = btnGroup.createEl('button', { text: '✨ New Chat' });
		newChatBtn.setCssStyles({ fontSize: '0.8em', padding: '2px 8px', height: 'auto' });
		newChatBtn.addEventListener('click', () => {
			this.history = [];
			this.messageContainer.empty();
			this.suggestionBox.setCssStyles({ display: 'none' });
			this.chatTitleInput.value = 'New Chat';
		});

		const saveChatBtn = btnGroup.createEl('button', { text: '💾 Save Chat' });
		saveChatBtn.setCssStyles({ fontSize: '0.8em', padding: '2px 8px', height: 'auto' });
		saveChatBtn.addEventListener('click', () => {
			void this.saveChatHistory();
		});

		this.scrollContainer = container.createDiv('agent-scroll-container');
		this.scrollContainer.setCssStyles({
			flex: '1',
			overflowY: 'auto',
			display: 'flex',
			flexDirection: 'column'
		});

		this.relatableNotesContainer = this.scrollContainer.createDiv('agent-relatable-notes');
		this.relatableNotesContainer.setCssStyles({
			display: 'none',
			flexDirection: 'column',
			gap: '5px',
			padding: '10px',
			borderBottom: '1px solid var(--background-modifier-border)'
		});

		this.messageContainer = this.scrollContainer.createDiv('agent-message-container');
		this.messageContainer.setCssStyles({
			padding: '10px',
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			flex: '1'
		});

		// Floating toggle for related notes
		const contextToggle = container.createEl('button', { text: '📌 Context' });
		contextToggle.title = 'Toggle related notes & suggested prompts';
		contextToggle.setCssStyles({
			position: 'absolute', top: '45px', right: '10px', zIndex: '20',
			fontSize: '0.7em', padding: '2px 8px', height: 'auto', opacity: '0.7',
			borderRadius: '10px'
		});
		contextToggle.addEventListener('click', () => {
			const isVisible = this.relatableNotesContainer.style.display !== 'none';
			this.relatableNotesContainer.setCssStyles({ display: isVisible ? 'none' : 'flex' });
			contextToggle.setCssStyles({ opacity: isVisible ? '0.5' : '0.9' });
			if (!isVisible) {
				this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
			}
		});

		const inputWrapper = container.createDiv('agent-input-wrapper');
		inputWrapper.setCssStyles({
			display: 'flex',
			flexDirection: 'column',
			borderTop: '1px solid var(--background-modifier-border)',
			padding: '10px',
			backgroundColor: 'var(--background-primary)',
			position: 'relative',
			zIndex: '10'
		});

		const optionsContainer = inputWrapper.createDiv('agent-chat-options');
		optionsContainer.setCssStyles({
			display: 'none',
			flexDirection: 'column',
			paddingBottom: '10px',
			gap: '5px'
		});

		const toggleRow = optionsContainer.createDiv();
		toggleRow.setCssStyles({ display: 'flex', gap: '15px' });

		const ragLabel = toggleRow.createEl('label', { text: ' Use semantic search context' });
		this.useRagCheckbox = document.createElement('input');
		this.useRagCheckbox.type = 'checkbox';
		this.useRagCheckbox.checked = true;
		ragLabel.prepend(this.useRagCheckbox);

		const overrideLabel = toggleRow.createEl('label', { text: ' Override system prompt' });
		this.overridePromptCheckbox = document.createElement('input');
		this.overridePromptCheckbox.type = 'checkbox';
		overrideLabel.prepend(this.overridePromptCheckbox);

		this.overridePromptTextarea = optionsContainer.createEl('textarea', { cls: 'agent-chat-input' });
		this.overridePromptTextarea.setCssStyles({ display: 'none', resize: 'vertical' });
		this.overridePromptTextarea.value = this.plugin.settings.sidebarChatPrompt;

		this.overridePromptCheckbox.addEventListener('change', () => {
			this.overridePromptTextarea.setCssStyles({ display: this.overridePromptCheckbox.checked ? 'block' : 'none' });
		});

		const attachRow = optionsContainer.createDiv();
		attachRow.setCssStyles({ display: 'flex', alignItems: 'center' });

		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = 'image/*,.txt,.md,.json';
		fileInput.multiple = true;
		fileInput.setCssStyles({ display: 'none' });
		const attachBtn = attachRow.createEl('button', { text: '📎 Attach files' });
		attachBtn.title = "Attach file";
		attachBtn.setCssStyles({ backgroundColor: 'var(--background-modifier-form-field)', boxShadow: 'none' });
		attachBtn.addEventListener('click', () => fileInput.click());

		fileInput.addEventListener('change', async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files) {
				const mediaFolder = "media";
				const folder = this.plugin.app.vault.getAbstractFileByPath(mediaFolder);
				if (!folder) {
					try {
						await this.plugin.app.vault.createFolder(mediaFolder);
					} catch (err) {
						new Notice("Error creating media folder: " + String(err));
					}
				}

				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (!file) continue;
					
					let finalPath = `${mediaFolder}/${file.name}`;
					let counter = 1;
					while (this.plugin.app.vault.getAbstractFileByPath(finalPath)) {
						const nameParts = file.name.split('.');
						const ext = nameParts.length > 1 ? nameParts.pop() : "";
						finalPath = `${mediaFolder}/${nameParts.join('.')}_${counter}${ext ? '.' + ext : ''}`;
						counter++;
					}

					try {
						const buffer = await file.arrayBuffer();
						const tfile = await this.plugin.app.vault.createBinary(finalPath, buffer);
						this.pendingAttachments.push(tfile);
						
						const fileItem = this.attachmentsList.createDiv({ text: `📎 ${tfile.name}` });
						fileItem.setCssStyles({
							cursor: 'pointer', backgroundColor: 'var(--background-secondary)',
							padding: '2px 5px', borderRadius: '3px', fontSize: '0.8em'
						});
						fileItem.title = "Click to remove";
						fileItem.addEventListener('click', () => {
							this.pendingAttachments = this.pendingAttachments.filter(f => f.path !== tfile.path);
							fileItem.remove();
						});
					} catch (err) {
						new Notice("Failed to save attachment to vault: " + String(err));
					}
				}
			}
			fileInput.value = '';
		});

		this.attachmentsList = optionsContainer.createDiv();
		this.attachmentsList.setCssStyles({ display: 'flex', gap: '5px', flexWrap: 'wrap' });

		const chatBox = inputWrapper.createDiv('agent-chat-box');
		chatBox.setCssStyles({
			display: 'flex',
			flexDirection: 'column',
			backgroundColor: 'var(--background-modifier-form-field)',
			borderRadius: '10px',
			padding: '10px',
			border: '1px solid var(--background-modifier-border)',
			position: 'relative'
		});

		this.activeContextContainer = chatBox.createDiv();
		this.activeContextContainer.setCssStyles({ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '5px' });

		this.inputEl = chatBox.createEl('textarea', {
			cls: 'agent-chat-input',
			attr: { placeholder: 'Ask anything, @ to mention and / for workflows' }
		});
		this.inputEl.setCssStyles({
			flex: '1',
			resize: 'vertical',
			height: '80px',
			minHeight: '60px',
			backgroundColor: 'transparent',
			border: 'none',
			boxShadow: 'none',
			padding: '0',
			marginBottom: '10px'
		});
		this.inputEl.style.outline = 'none';

		const bottomRow = chatBox.createDiv();
		bottomRow.setCssStyles({ display: 'flex', justifyContent: 'space-between', alignItems: 'center' });

		const leftControls = bottomRow.createDiv();
		leftControls.setCssStyles({ display: 'flex', gap: '10px', alignItems: 'center' });

		const toolsBtn = leftControls.createEl('button', { text: '+ Tools' });
		toolsBtn.setCssStyles({ backgroundColor: 'transparent', boxShadow: 'none', color: 'var(--text-muted)' });
		toolsBtn.addEventListener('click', () => {
			const isHidden = optionsContainer.style.display === 'none';
			optionsContainer.setCssStyles({ display: isHidden ? 'flex' : 'none' });
		});

		const rightControls = bottomRow.createDiv();
		rightControls.setCssStyles({ display: 'flex', gap: '5px', alignItems: 'center' });

		const sendBtn = rightControls.createEl('button', { text: '↑' });
		sendBtn.setCssStyles({
			borderRadius: '50%', width: '32px', height: '32px',
			display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0'
		});

		const stopBtn = rightControls.createEl('button', { text: '■' });
		stopBtn.title = 'Stop generating';
		stopBtn.setCssStyles({
			borderRadius: '50%', width: '32px', height: '32px',
			display: 'none', alignItems: 'center', justifyContent: 'center', padding: '0',
			backgroundColor: 'var(--text-error)'
		});
		stopBtn.addEventListener('click', () => {
			if (this.activeAbortController) {
				this.activeAbortController.abort();
				this.activeAbortController = null;
				stopBtn.setCssStyles({ display: 'none' });
			}
		});

		this.suggestionBox = chatBox.createDiv('agent-suggestion-box');
		this.suggestionBox.setCssStyles({
			display: 'none', position: 'absolute', bottom: '100%', left: '0', marginBottom: '5px',
			backgroundColor: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)',
			borderRadius: '5px', maxHeight: '150px', overflowY: 'auto',
			zIndex: '1000', width: '250px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
		});

		const triggerMentions = () => this.handleMentionsAndWorkflows();
		this.inputEl.addEventListener('input', triggerMentions);
		this.inputEl.addEventListener('keyup', (e) => {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') return;
			triggerMentions();
		});
		this.inputEl.addEventListener('click', triggerMentions);

		sendBtn.addEventListener('click', () => void this.sendMessage(stopBtn));
		this.inputEl.addEventListener('keydown', (e) => {
			if (this.suggestionBox.style.display === 'block') {
				const items = this.suggestionBox.children;
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					if (this.selectedSuggestionIndex >= items.length - 1) {
						this.selectedSuggestionIndex = 0;
					} else {
						this.selectedSuggestionIndex++;
					}
					this.updateSuggestionSelection();
					return;
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					if (this.selectedSuggestionIndex <= 0) {
						this.selectedSuggestionIndex = items.length - 1;
					} else {
						this.selectedSuggestionIndex--;
					}
					this.updateSuggestionSelection();
					return;
				} else if (e.key === 'Enter') {
					e.preventDefault();
					if (this.selectedSuggestionIndex >= 0 && this.selectedSuggestionIndex < items.length) {
						(items[this.selectedSuggestionIndex] as HTMLElement).click();
					}
					return;
				}
			}

			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				void this.sendMessage(stopBtn);
			}
		});

		// Paste handler for images
		this.inputEl.addEventListener('paste', async (e) => {
			const items = e.clipboardData?.items;
			if (!items) return;
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item && item.type.startsWith('image/')) {
					e.preventDefault();
					const blob = item.getAsFile();
					if (!blob) continue;
					const mediaFolder = 'media';
					const folder = this.plugin.app.vault.getAbstractFileByPath(mediaFolder);
					if (!folder) {
						try { await this.plugin.app.vault.createFolder(mediaFolder); } catch { /* exists */ }
					}
					const ext = item.type.split('/')[1] || 'png';
					const name = `pasted-${Date.now()}.${ext}`;
					const buffer = await blob.arrayBuffer();
					const tfile = await this.plugin.app.vault.createBinary(`${mediaFolder}/${name}`, buffer);
					this.pendingAttachments.push(tfile);
					const fileItem = this.attachmentsList.createDiv({ text: `📎 ${tfile.name}` });
					fileItem.setCssStyles({ cursor: 'pointer', backgroundColor: 'var(--background-secondary)', padding: '2px 5px', borderRadius: '3px', fontSize: '0.8em' });
					fileItem.addEventListener('click', () => {
						this.pendingAttachments = this.pendingAttachments.filter(f => f.path !== tfile.path);
						fileItem.remove();
					});
					// Show the tools area so user sees the attachment
					optionsContainer.setCssStyles({ display: 'flex' });
					new Notice(`Pasted image attached: ${name}`);
				}
			}
		});

		this.history = [];
		this.registerEvent(this.plugin.app.workspace.on('file-open', this.handleFileOpen.bind(this)));

		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile) {
			void this.handleFileOpen(activeFile);
		}
	}

	renderActiveContextRibbon() {
		this.activeContextContainer.empty();
		this.activeContextFiles.forEach((ctx, idx) => {
			const item = this.activeContextContainer.createDiv();
			item.setCssStyles({
				cursor: 'pointer', backgroundColor: 'var(--background-secondary)',
				padding: '2px 5px', borderRadius: '3px', fontSize: '0.8em',
				display: 'flex', alignItems: 'center', gap: '3px',
				border: '1px solid var(--background-modifier-border)'
			});

			const weightBadge = item.createEl('span', { text: `${ctx.weight}` });
			weightBadge.setCssStyles({
				backgroundColor: 'var(--interactive-accent)', color: 'var(--text-on-accent)',
				borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex',
				alignItems: 'center', justifyContent: 'center', fontSize: '0.7em', fontWeight: 'bold', flexShrink: '0'
			});
			weightBadge.title = 'Click to cycle weight (1-5)';
			weightBadge.addEventListener('click', (e) => {
				e.stopPropagation();
				ctx.weight = ctx.weight >= 5 ? 1 : ctx.weight + 1;
				this.renderActiveContextRibbon();
			});

			item.createEl('span', { text: `📄 ${ctx.file.name}` });

			const closeBtn = item.createEl('span', { text: '×' });
			closeBtn.setCssStyles({ marginLeft: '4px', fontWeight: 'bold', opacity: '0.6', cursor: 'pointer' });
			closeBtn.title = 'Remove from context';
			closeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.activeContextFiles.splice(idx, 1);
				this.renderActiveContextRibbon();
			});
		});
	}

	async handleFileOpen(file: TFile | null) {
		if (file && file instanceof TFile && file.path.endsWith('.md')) {
			if (!this.activeContextFiles.some(c => c.file.path === file.path)) {
				this.activeContextFiles.push({ file, weight: 1 });
				this.renderActiveContextRibbon();
			}
		}

		if (!file || !(file instanceof TFile) || !file.path.endsWith('.md')) {
			this.relatableNotesContainer.setCssStyles({ display: 'none' });
			return;
		}

		this.relatableNotesContainer.setCssStyles({ display: 'flex' });
		this.relatableNotesContainer.empty();
		this.relatableNotesContainer.createEl('div', { text: `Looking up context for ${file.name}...` }).setCssStyles({ color: 'var(--text-muted)', fontSize: '0.8em' });

		try {
			const content = await this.plugin.app.vault.cachedRead(file);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const aiResolver = await waitForAI();
			const aiProviders = await aiResolver.promise as any;
			
			const { provider: chatProvider, model: chatModel } = this.getProviderAndModel(aiProviders, this.plugin.settings.chatModel);
			if (!chatProvider) throw new Error("No chat provider configured");

			const keywordPrompt = "Extract 3 to 5 highly specific keywords or short unique phrases from the provided text that represent its core topic. Respond ONLY with a valid JSON array of strings. E.g. [\"keyword1\", \"keyword2\"]";

			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			const keywordsResponse = await aiProviders.execute({
				messages: [
					{ role: 'system', content: keywordPrompt },
					{ role: 'user', content: content.substring(0, 1500) }
				],
				provider: chatProvider,
				model: chatModel,
				abortController: new AbortController()
			});

			let keywordsResponseStr = "";
			if (typeof keywordsResponse === 'string') {
				keywordsResponseStr = keywordsResponse;
			} else if (keywordsResponse && typeof keywordsResponse === 'object') {
				if (Symbol.asyncIterator in keywordsResponse) {
					for await (const chunk of keywordsResponse) {
						keywordsResponseStr += chunk || "";
					}
				} else {
					keywordsResponseStr = String(keywordsResponse);
				}
			}

			let extractedKeywords: string[] = [];
			if (keywordsResponseStr.trim()) {
				try {
					extractedKeywords = JSON.parse(keywordsResponseStr.replace(/```json/g, '').replace(/```/g, '').trim()) as string[];
				} catch {
					// Fallback to basic word splitting if LLM failed JSON format
					extractedKeywords = keywordsResponseStr.replace(/[\[\]"']/g, '').split(',').map(s => s.trim()).filter(s => s.length > 2);
				}
			}

			const linkMatches = content.match(/\[\[(.*?)\]\]/g);
			if (linkMatches) {
				for (const match of linkMatches) {
					const linkName = match.slice(2, -2).split('|')[0]?.trim();
					if (linkName && !extractedKeywords.includes(linkName)) {
						extractedKeywords.push(linkName);
					}
				}
			}

			console.log("Extracted Context Keywords:", extractedKeywords);

			const searchFiles = this.plugin.app.vault.getFiles().filter(f => (f.extension === 'md' || f.extension === 'canvas') && f.path !== file.path);
			
			const searchResults = [];
			for (const f of searchFiles) {
				try {
					const docContent = await this.plugin.app.vault.cachedRead(f);
					const docLower = docContent.toLowerCase();
					let score = 0;
					
					for (const kw of extractedKeywords) {
						if (kw && docLower.includes(kw.toLowerCase())) {
							score += 1;
						}
					}
					
					if (score > 0) {
						searchResults.push({ path: f.path, filename: f.name, score });
					}
				} catch { /* ignore */ }
			}

			searchResults.sort((a, b) => b.score - a.score);
			const top8 = searchResults.slice(0, 8);

			this.relatableNotesContainer.empty();
			
			const headerRow = this.relatableNotesContainer.createDiv();
			headerRow.setCssStyles({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' });
			
			const notesTitle = headerRow.createDiv({ text: 'Related Notes:' });
			notesTitle.setCssStyles({ fontWeight: 'bold', fontSize: '0.8em' });
			
			const refreshBtn = headerRow.createEl('button', { text: '↻' });
			refreshBtn.title = "Refresh context";
			refreshBtn.setCssStyles({ padding: '0 5px', height: '20px', backgroundColor: 'transparent', boxShadow: 'none' });
			refreshBtn.addEventListener('click', () => {
				void this.handleFileOpen(file);
			});

			const notesList = this.relatableNotesContainer.createDiv();
			notesList.setCssStyles({ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' });
			
			top8.forEach((r) => {
				const path = r.path;
				if (!path) return;
				const btn = notesList.createEl('button', { text: r.filename });
				btn.title = `Matched Keywords: ${r.score}`;
				btn.setCssStyles({ fontSize: '0.7em', padding: '2px 5px', height: 'auto' });
				btn.addEventListener('click', () => {
					this.inputEl.value += ` [[${path}]] `;
					this.inputEl.focus();
				});
			});

			const promptsTitle = this.relatableNotesContainer.createDiv({ text: 'Suggested Prompts:' });
			promptsTitle.setCssStyles({ fontWeight: 'bold', fontSize: '0.8em', marginBottom: '2px' });
			const promptsList = this.relatableNotesContainer.createDiv();
			promptsList.setCssStyles({ display: 'flex', flexDirection: 'column', gap: '5px' });

			const metaPrompt = this.plugin.settings.metaPromptTemplate || "You are an expert prompt engineer. Help me write a prompt about:";
			const metaBtn = promptsList.createEl('button', { text: '✨ Help me write a prompt' });
			metaBtn.setCssStyles({ fontSize: '0.8em', textAlign: 'left', height: 'auto', whiteSpace: 'normal' });
			metaBtn.addEventListener('click', () => {
				this.inputEl.value = metaPrompt + ` [[${file.path}]]\n\n`;
				this.inputEl.focus();
			});



			const systemPrompt = "You are a helpful assistant. Provide exactly 3 short, distinct, and creative suggested questions the user could ask you based on the provided text. Output a valid JSON array of 3 strings. E.g. [\"question 1\", \"question 2\", \"question 3\"]";
			
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			const responseString = await aiProviders.execute({
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: content.substring(0, 1500) }
				],
				provider: chatProvider,
				model: chatModel,
				abortController: new AbortController()
			});

			let parsedResponseString = "";
			if (typeof responseString === 'string') {
				parsedResponseString = responseString;
			} else if (responseString && typeof responseString === 'object') {
				if (Symbol.asyncIterator in responseString) {
					for await (const chunk of responseString) {
						parsedResponseString += chunk || "";
					}
				} else {
					parsedResponseString = String(responseString);
				}
			}

			if (parsedResponseString.trim()) {
				try {
					const suggestions = JSON.parse(parsedResponseString.replace(/```json/g, '').replace(/```/g, '').trim()) as string[];
					if (Array.isArray(suggestions)) {
						suggestions.slice(0, 3).forEach(s => {
							const pBtn = promptsList.createEl('button', { text: s });
							pBtn.setCssStyles({ fontSize: '0.8em', textAlign: 'left', height: 'auto', whiteSpace: 'normal' });
							pBtn.addEventListener('click', () => {
								this.inputEl.value = `${s} [[${file.path}]] `;
								this.inputEl.focus();
							});
						});
					}
				} catch {
					const genericBtn = promptsList.createEl('button', { text: 'Summarize this note' });
					genericBtn.setCssStyles({ fontSize: '0.8em', textAlign: 'left', height: 'auto' });
					genericBtn.addEventListener('click', () => {
						this.inputEl.value = `Summarize [[${file.path}]] `;
						this.inputEl.focus();
					});
				}
			}

		} catch (error) {
			console.error("Error finding related notes:", error);
			this.relatableNotesContainer.empty();
			this.relatableNotesContainer.createEl('div', { text: `Could not load context.` }).setCssStyles({ color: 'red', fontSize: '0.8em' });
		}
	}

	updateSuggestionSelection() {
		const items = this.suggestionBox.children;
		for (let i = 0; i < items.length; i++) {
			const item = items[i] as HTMLElement;
			if (i === this.selectedSuggestionIndex) {
				item.setCssStyles({ backgroundColor: 'var(--background-modifier-hover)' });
				item.scrollIntoView({ block: 'nearest' });
			} else {
				item.setCssStyles({ backgroundColor: 'transparent' });
			}
		}
	}

	handleMentionsAndWorkflows() {
		const cursorPosition = this.inputEl.selectionStart;
		const textBeforeCursor = this.inputEl.value.substring(0, cursorPosition);
		const textAfterCursor = this.inputEl.value.substring(cursorPosition);

		const workflowMatch = textBeforeCursor.match(/\/([^\s]*)$/);
		if (workflowMatch) {
			const query = (workflowMatch[1] || "").toLowerCase();
			const commands = this.plugin.settings.customCommands.filter(c => c.name.toLowerCase().includes(query)).slice(0, 10);
			this.suggestionBox.empty();
			if (commands.length > 0) {
				this.selectedSuggestionIndex = -1;
				this.suggestionBox.setCssStyles({ display: 'block' });
				commands.forEach((cmd, i) => {
					const item = this.suggestionBox.createDiv({ text: `⚡ ${cmd.name}` });
					item.setCssStyles({ padding: '5px 10px', cursor: 'pointer', borderBottom: '1px solid var(--background-modifier-border)' });
					item.addEventListener('mouseover', () => {
						this.selectedSuggestionIndex = i;
						this.updateSuggestionSelection();
					});
					item.addEventListener('mouseout', () => {
						this.selectedSuggestionIndex = -1;
						this.updateSuggestionSelection();
					});
					item.addEventListener('click', () => {
						const newTextBefore = textBeforeCursor.replace(/\/([^\s]*)$/, `${cmd.prompt} `);
						this.inputEl.value = newTextBefore + textAfterCursor;
						this.suggestionBox.setCssStyles({ display: 'none' });
						this.inputEl.focus();
						this.inputEl.selectionStart = this.inputEl.selectionEnd = newTextBefore.length;
					});
				});
				return;
			}
		}

		const match = textBeforeCursor.match(/(@|\[\[)([^\]\s]*)$/);
		if (match) {
			const trigger = match[1];
			const query = (match[2] || "").toLowerCase();
			const files = this.plugin.app.vault.getFiles().filter(f => (f.extension === 'md' || f.extension === 'canvas') && f.path.toLowerCase().includes(query)).slice(0, 10);
			this.suggestionBox.empty();
			if (files.length > 0) {
				this.selectedSuggestionIndex = -1;
				this.suggestionBox.setCssStyles({ display: 'block' });
				files.forEach((file, i) => {
					const item = this.suggestionBox.createDiv({ text: file.name });
					item.setCssStyles({
						padding: '5px 10px',
						cursor: 'pointer',
						borderBottom: '1px solid var(--background-modifier-border)'
					});
					item.addEventListener('mouseover', () => {
						this.selectedSuggestionIndex = i;
						this.updateSuggestionSelection();
					});
					item.addEventListener('mouseout', () => {
						this.selectedSuggestionIndex = -1;
						this.updateSuggestionSelection();
					});
					item.addEventListener('click', () => {
						let newTextBefore = "";
						if (trigger === '@') {
							newTextBefore = textBeforeCursor.replace(/@([^\s]*)$/, `@${file.basename} `);
							this.inputEl.value = newTextBefore + textAfterCursor;
							
							if (!this.activeContextFiles.some(c => c.file.path === file.path)) {
								this.activeContextFiles.push({ file, weight: 1 });
								this.renderActiveContextRibbon();
							}
						} else {
							newTextBefore = textBeforeCursor.replace(/\[\[([^\]\s]*)$/, `[[${file.path}|${file.basename}]] `);
							this.inputEl.value = newTextBefore + textAfterCursor;
						}
						
						this.suggestionBox.setCssStyles({ display: 'none' });
						this.inputEl.focus();
						this.inputEl.selectionStart = this.inputEl.selectionEnd = newTextBefore.length;
					});
				});
			} else {
				this.suggestionBox.setCssStyles({ display: 'none' });
			}
		} else {
			this.suggestionBox.setCssStyles({ display: 'none' });
		}
	}

	addMessageToUI(role: string, text: string, originalText?: string, historyIndex?: number) {
		let displayContent = text;
		if (role === 'assistant') {
			displayContent = displayContent.replace(/(?<!\[\[)([^\]\n:*?"<>|]+\.(?:md|canvas))(?!\]\])/g, (match, pathWithExt) => {
				const trimmed = pathWithExt.trim();
				const file = this.plugin.app.vault.getAbstractFileByPath(trimmed);
				if (file instanceof TFile) {
					return match.replace(trimmed, `[[${file.path}|${file.basename}]]`);
				}
				return match;
			});
		}

		const msgEl = this.messageContainer.createDiv('agent-message');
		msgEl.setCssStyles({
			padding: '10px',
			borderRadius: '5px',
			backgroundColor: role === 'user' ? 'var(--interactive-accent)' : 'var(--background-secondary)',
			color: role === 'user' ? 'var(--text-on-accent)' : 'var(--text-normal)',
			alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
			maxWidth: '85%',
			position: 'relative',
			userSelect: 'text',
			webkitUserSelect: 'text'
		});

		const contentDiv = msgEl.createDiv();
		contentDiv.setCssStyles({ whiteSpace: 'pre-wrap', marginBottom: '0' });
		void MarkdownRenderer.renderMarkdown(displayContent, contentDiv, this.plugin.app.workspace.getActiveFile()?.path || "", new Component());

		contentDiv.addEventListener('contextmenu', (e) => {
			const selection = window.getSelection()?.toString();
			if (selection) {
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle('Copy selection')
						.setIcon('copy')
						.onClick(async () => {
							await navigator.clipboard.writeText(selection);
							new Notice("Copied selection to clipboard!");
						});
				});
				menu.addItem((item) => {
					item.setTitle('Insert into active note')
						.setIcon('pencil')
						.onClick(() => {
							const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
							if (activeView) {
								activeView.editor.replaceSelection(selection);
								new Notice("Inserted selection into note!");
							} else {
								new Notice("No active note to insert into.");
							}
						});
				});
				menu.addItem((item) => {
					item.setTitle('Create new note from selection')
						.setIcon('file-plus')
						.onClick(async () => {
							let folder = this.plugin.app.vault.getRoot().path;
							if (folder === "/") folder = "";
							const timestamp = new Date().getTime();
							const file = await this.plugin.app.vault.create(`${folder ? folder + '/' : ''}New Note ${timestamp}.md`, selection);
							const leaf = this.plugin.app.workspace.getLeaf('tab');
							await leaf.openFile(file);
						});
				});
				menu.showAtMouseEvent(e);
				e.preventDefault();
			}
		});

		if (role === 'user' && historyIndex !== undefined && originalText !== undefined) {
			const actionRow = msgEl.createDiv();
			actionRow.setCssStyles({
				display: 'none', gap: '5px', position: 'absolute', bottom: '5px', right: '5px'
			});
			
			msgEl.addEventListener('mouseenter', () => actionRow.setCssStyles({ display: 'flex' }));
			msgEl.addEventListener('mouseleave', () => actionRow.setCssStyles({ display: 'none' }));

			const editBtn = actionRow.createEl('button', { text: '✏️' });
			editBtn.title = "Edit and reload prompt";
			editBtn.setCssStyles({ padding: '2px 5px', fontSize: '0.7em', height: 'auto', backgroundColor: 'var(--background-secondary)', border: '1px solid var(--background-modifier-border)' });
			
			editBtn.addEventListener('click', () => {
				this.inputEl.value = originalText;
				this.inputEl.focus();
				
				if (historyIndex >= 0 && historyIndex < this.history.length) {
					this.history = this.history.slice(0, historyIndex);
					let el: Element | null = msgEl;
					while (el) {
						const next: Element | null = el.nextElementSibling;
						el.remove();
						el = next;
					}
				}
			});
		}

		if (role === 'assistant') {
			const actionRow = msgEl.createDiv();
			actionRow.setCssStyles({
				display: 'flex', gap: '5px', position: 'absolute', bottom: '5px', right: '5px'
			});
			
			const copyBtn = actionRow.createEl('button', { text: '📋' });
			copyBtn.title = "Copy";
			copyBtn.setCssStyles({ padding: '2px 5px', fontSize: '0.7em', height: 'auto', backgroundColor: 'transparent', border: 'none', boxShadow: 'none' });
			copyBtn.addEventListener('click', async () => {
				await navigator.clipboard.writeText(text);
				new Notice("Copied to clipboard!");
			});

			const insertBtn = actionRow.createEl('button', { text: '↙️' });
			insertBtn.title = "Insert in active note";
			insertBtn.setCssStyles({ padding: '2px 5px', fontSize: '0.7em', height: 'auto', backgroundColor: 'transparent', border: 'none', boxShadow: 'none' });
			insertBtn.addEventListener('click', () => {
			let activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				// Try to find any open markdown view in other leaves
				this.plugin.app.workspace.iterateAllLeaves(leaf => {
					if (!activeView && leaf.view instanceof MarkdownView) {
						activeView = leaf.view;
					}
				});
			}
			if (activeView) {
				const editor = activeView.editor;
				editor.setCursor(editor.lastLine(), editor.getLine(editor.lastLine()).length);
				editor.replaceSelection('\n' + text);
				new Notice("Inserted into note!");
			} else {
				new Notice("No open note found to insert into. Open a note first.");
			}
		});
		}
		
		this.scrollContainer.scrollTo({ top: this.scrollContainer.scrollHeight, behavior: 'smooth' });
	}

	async readTFileToBase64(file: TFile): Promise<string> {
		const buffer = await this.plugin.app.vault.readBinary(file);
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i] as number);
		}
		return btoa(binary);
	}

	async parseCanvasToText(file: TFile): Promise<string> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const canvasData = JSON.parse(content);
			let result = `--- Obsidian Canvas File: ${file.name} ---\n\n`;
			
			const nodesMap = new Map();
			if (canvasData.nodes && Array.isArray(canvasData.nodes)) {
				result += "Nodes:\n";
				for (const node of canvasData.nodes) {
					nodesMap.set(node.id, node);
					let nodeContent = "";
					if (node.type === 'text') nodeContent = node.text || "";
					else if (node.type === 'file') nodeContent = `File: [[${node.file}]]`;
					else if (node.type === 'link') nodeContent = `Link: ${node.url}`;
					else if (node.type === 'group') nodeContent = `Group: ${node.label || "Unnamed"}`;
					
					result += `- [ID: ${node.id}] (Type: ${node.type}): ${nodeContent.substring(0, 100).replace(/\n/g, ' ')}\n`;
				}
			}

			if (canvasData.edges && Array.isArray(canvasData.edges)) {
				result += "\nConnections (Edges):\n";
				for (const edge of canvasData.edges) {
					const fromNode = nodesMap.get(edge.fromNode);
					const toNode = nodesMap.get(edge.toNode);
					const fromText = fromNode ? (fromNode.type === 'text' ? fromNode.text : fromNode.file || fromNode.url || fromNode.label) : edge.fromNode;
					const toText = toNode ? (toNode.type === 'text' ? toNode.text : toNode.file || toNode.url || toNode.label) : edge.toNode;
					
					const fromShort = typeof fromText === 'string' ? fromText.substring(0, 30).replace(/\n/g, ' ') : edge.fromNode;
					const toShort = typeof toText === 'string' ? toText.substring(0, 30).replace(/\n/g, ' ') : edge.toNode;
					
					result += `- "${fromShort}" --> "${toShort}" ${edge.label ? `(Label: ${edge.label})` : ''}\n`;
				}
			}
			return result;
		} catch (e) {
			return `Failed to parse canvas: ${String(e)}`;
		}
	}

	async saveChatHistory() {
		if (this.history.length === 0) {
			new Notice("No chat history to save.");
			return;
		}

		let folderName = this.plugin.settings.chatHistoryFolder || "AI Chats";
		folderName = folderName.replace(/\\/g, '/');
		if (folderName.endsWith('/')) folderName = folderName.slice(0, -1);

		const folder = this.plugin.app.vault.getAbstractFileByPath(folderName);
		if (!folder) {
			try {
				await this.plugin.app.vault.createFolder(folderName);
			} catch (err) {
				new Notice("Error creating chat history folder: " + String(err));
				return;
			}
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		let title = this.chatTitleInput.value.trim();
		if (!title || title === 'New Chat') {
			let firstUserMsg = this.history.find(m => m.role === 'user')?.content?.toString() || "Chat";
			title = firstUserMsg.substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '').trim();
		} else {
			title = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
		}
		const filename = `${folderName}/${title} - ${timestamp}.md`;

		let content = `# AI Chat Log\n\n*Date: ${new Date().toLocaleString()}*\n\n---\n\n`;
		
		for (const msg of this.history) {
			if (msg.role === 'system') continue;
			
			content += `**${msg.role === 'user' ? 'User' : 'Agent'}**:\n`;
			if (typeof msg.content === 'string') {
				content += `${msg.content}\n\n`;
			} else if (msg.content) {
				content += "[Complex content blocks not serialized]\n\n";
			}

			if (msg.tool_calls && msg.tool_calls.length > 0) {
				content += `> *Used tools: ${msg.tool_calls.map(tc => tc.function.name).join(', ')}*\n\n`;
			}
		}

		try {
			const file = await this.plugin.app.vault.create(filename, content);
			new Notice(`Chat saved to ${file.path}`);
			
			const leaf = this.plugin.app.workspace.getLeaf('tab');
			await leaf.openFile(file);
		} catch (err) {
			new Notice("Error saving chat: " + String(err));
		}
	}

	async sendMessage(stopBtn?: HTMLElement) {
		const text = this.inputEl.value.trim();
		if (!text && this.pendingAttachments.length === 0) return;

		this.inputEl.value = '';
		this.suggestionBox.setCssStyles({ display: 'none' });
		
		let userTextDisplay = text;

		const userMessageIndex = this.history.length;
		this.addMessageToUI('user', userTextDisplay, text, userMessageIndex);

		let messageContent: string = text;
		const images: string[] = [];

		if (this.pendingAttachments.length > 0) {
			for (const file of this.pendingAttachments) {
				const ext = file.extension.toLowerCase();
				const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
				if (isImage) {
					const base64 = await this.readTFileToBase64(file);
					const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
					images.push(`data:${mimeType};base64,${base64}`);
					userTextDisplay += `\n![[${file.path}]]`;
				} else if (file.extension === 'canvas') {
					const canvasText = await this.parseCanvasToText(file);
					messageContent += `\n\n${canvasText}`;
					userTextDisplay += `\n[[${file.path}]]`;
				} else {
					try {
						const content = await this.plugin.app.vault.read(file);
						messageContent += `\n\n--- Content of attached file: ${file.name} ---\n${content}`;
						userTextDisplay += `\n[[${file.path}]]`;
					} catch {
						userTextDisplay += `\n*(Failed to read ${file.path})*`;
					}
				}
			}
		}

		// Update the display text in the already rendered message
		const messageEls = this.messageContainer.querySelectorAll('.agent-message');
		if (messageEls.length > 0) {
			const lastMsgEl = messageEls[messageEls.length - 1] as HTMLElement;
			if (userTextDisplay !== text) {
				const contentDivs = lastMsgEl.querySelectorAll('div');
				for (let i = 0; i < contentDivs.length; i++) {
					const div = contentDivs[i];
					if (div && div.style.whiteSpace === 'pre-wrap') {
						div.empty();
						void MarkdownRenderer.renderMarkdown(userTextDisplay, div, this.plugin.app.workspace.getActiveFile()?.path || "", new Component());
						break;
					}
				}
			}
		}

		// clear attachments
		this.pendingAttachments = [];
		this.attachmentsList.empty();

		if (this.activeContextFiles.length > 0) {
			for (const ctx of this.activeContextFiles) {
				const weightLabel = ctx.weight > 1 ? ` [IMPORTANCE: ${ctx.weight}/5]` : '';
				if (ctx.file.extension === 'canvas') {
					const canvasText = await this.parseCanvasToText(ctx.file);
					messageContent += `\n\n${canvasText}${weightLabel}`;
				} else {
					const content = await this.plugin.app.vault.read(ctx.file);
					messageContent += `\n\n--- Context from ${ctx.file.path}${weightLabel} ---\n${content}`;
				}
			}
		}

		// Replace [[file.path]] in text with actual file contents
		const fileMentions = messageContent.toString().match(/\[\[(.*?)\]\]/g);
		if (fileMentions) {
			for (const mention of fileMentions) {
				const path = mention.slice(2, -2).split('|')[0]?.trim();
				if (!path) continue;
				const tfile = this.plugin.app.vault.getAbstractFileByPath(path);
				if (tfile instanceof TFile) {
					if (tfile.extension === 'canvas') {
						const canvasText = await this.parseCanvasToText(tfile);
						messageContent += `\n\n${canvasText}`;
					} else {
						const content = await this.plugin.app.vault.read(tfile);
						messageContent += `\n\n--- Context from ${path} ---\n${content}`;
					}
				}
			}
		}

		const userMessage: IChatMessage = { role: 'user', content: messageContent };
		if (images.length > 0) {
			userMessage.images = images;
		}

		this.history.push(userMessage);

		try {
			const aiResolver = await waitForAI();
			const aiProviders = await aiResolver.promise;

			if (!aiProviders.providers || aiProviders.providers.length === 0) {
				this.addMessageToUI('assistant', 'Error: No AI provider configured in obsidian-ai-providers settings.');
				return;
			}
			
			const { provider: chatProvider, model: chatModel } = this.getProviderAndModel(aiProviders, this.plugin.settings.chatModel);
			if (!chatProvider) return;

			let tools: IAIToolDefinition[] | undefined = [
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
						name: "list_files",
						description: "Lists all markdown file paths in the user's vault. Useful for finding the exact path to use with read_file when the user asks about a specific note by name.",
						parameters: {
							type: "object",
							properties: {},
							required: []
						}
					}
				}
			];

			if (this.useRagCheckbox.checked) {
				tools.push({
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
				});
			}

			if (this.plugin.settings.enableFileModifications) {
				tools.push(
					{
						type: "function",
						function: {
							name: "edit_file",
							description: "Modifies the contents of an existing file by completely replacing its content.",
							parameters: {
								type: "object",
								properties: {
									path: { type: "string", description: "The path of the file to modify" },
									content: { type: "string", description: "The new complete content of the file" }
								},
								required: ["path", "content"]
							}
						}
					},
					{
						type: "function",
						function: {
							name: "move_file",
							description: "Renames or moves a file to a new path.",
							parameters: {
								type: "object",
								properties: {
									path: { type: "string", description: "The current path of the file" },
									new_path: { type: "string", description: "The new path for the file" }
								},
								required: ["path", "new_path"]
							}
						}
					},
					{
						type: "function",
						function: {
							name: "delete_file",
							description: "Deletes a file (moves it to the system trash).",
							parameters: {
								type: "object",
								properties: {
									path: { type: "string", description: "The path of the file to delete" }
								},
								required: ["path"]
							}
						}
					}
				);
			}

			if (this.plugin.settings.enableWebScraping) {
				tools.push(
					{
						type: "function",
						function: {
							name: "fetch_url",
							description: "Fetches and extracts text content from a specific URL.",
							parameters: {
								type: "object",
								properties: {
									url: { type: "string", description: "The URL to fetch" }
								},
								required: ["url"]
							}
						}
					},
					{
						type: "function",
						function: {
							name: "web_search",
							description: "Searches the web for a query using DuckDuckGo HTML search. Returns a list of search results.",
							parameters: {
								type: "object",
								properties: {
									query: { type: "string", description: "The search query" }
								},
								required: ["query"]
							}
						}
					}
				);
			}

			let currentHistory = [...this.history];
			
			// Inject the system prompt at the beginning of the history for this execution
			const activeSystemPrompt = this.overridePromptCheckbox.checked 
				? this.overridePromptTextarea.value 
				: this.plugin.settings.sidebarChatPrompt;

			// Inject memory folder contents
			let memoryContext = '';
			const memFolder = this.plugin.settings.memoryFolder?.trim();
			if (memFolder) {
				const memFiles = this.plugin.app.vault.getFiles().filter(f => f.path.startsWith(memFolder + '/') || f.path.startsWith(memFolder + '\\'));
				for (const mf of memFiles) {
					try {
						const mc = await this.plugin.app.vault.cachedRead(mf);
						memoryContext += `\n\n--- Agent Memory: ${mf.name} ---\n${mc}`;
					} catch { /* skip */ }
				}
			}
			
			currentHistory.unshift({ role: "system", content: activeSystemPrompt + memoryContext });

			this.activeAbortController = new AbortController();
			if (stopBtn) stopBtn.setCssStyles({ display: 'flex' });

			let isToolCallComplete = false;

			// Loading indicator
			const loadingEl = this.messageContainer.createDiv();
			loadingEl.innerText = 'Agent is thinking...';
			loadingEl.setCssStyles({
				fontStyle: 'italic',
				opacity: '0.7'
			});

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
							const args = JSON.parse(toolCall.function.arguments) as Record<string, string>;
							
							if (toolCall.function.name === 'read_file') {
								const file = this.plugin.app.vault.getAbstractFileByPath(String(args.path));
								if (file instanceof TFile) {
									toolResult = await this.plugin.app.vault.read(file);
								} else {
									toolResult = `Error: File not found at ${args.path}`;
								}
							} else if (toolCall.function.name === 'create_file' || toolCall.function.name === 'create_canvas') {
								const content = toolCall.function.name === 'create_canvas' ? String(args.canvasJson) : String(args.content);
								const file = await this.plugin.app.vault.create(String(args.path), content);
								toolResult = `Successfully created file at ${file.path}`;
								
								// Open the newly created file in a new tab
								const leaf = this.plugin.app.workspace.getLeaf('tab');
								await leaf.openFile(file);
							} else if (['edit_file', 'move_file', 'delete_file'].includes(toolCall.function.name)) {
								const targetPath = String(args.path);
								
								// Check exclusions
								const excludeFolders = this.plugin.settings.modifyExcludeFolders || [];
								const isExcluded = excludeFolders.some((folder: string) => targetPath.startsWith(folder));
								
								if (isExcluded) {
									toolResult = `Error: Cannot modify file at ${targetPath} because it is in an excluded folder.`;
								} else {
									const permission = await this.requestToolPermission(toolCall.function.name.replace('_', ' '), targetPath);
									if (permission === 'deny') {
										toolResult = "Error: The user denied permission to execute this tool.";
									} else {
										const file = this.plugin.app.vault.getAbstractFileByPath(targetPath);
										if (!(file instanceof TFile)) {
											toolResult = `Error: File not found at ${targetPath}`;
										} else {
											if (toolCall.function.name === 'edit_file') {
												await this.plugin.app.vault.modify(file, String(args.content));
												toolResult = `Successfully edited file at ${targetPath}`;
											} else if (toolCall.function.name === 'move_file') {
												await this.plugin.app.fileManager.renameFile(file, String(args.new_path));
												toolResult = `Successfully moved file from ${targetPath} to ${args.new_path}`;
											} else if (toolCall.function.name === 'delete_file') {
												await this.plugin.app.vault.trash(file, true); // true = system trash
												toolResult = `Successfully moved file ${targetPath} to system trash.`;
											}
										}
									}
								}
							} else if (toolCall.function.name === 'fetch_url') {
								const res = await requestUrl({ url: String(args.url) });
								const parser = new DOMParser();
								const doc = parser.parseFromString(res.text, 'text/html');
								toolResult = doc.body.innerText.replace(/\s+/g, ' ').substring(0, 15000); // return up to 15000 chars
							} else if (toolCall.function.name === 'web_search') {
								const res = await requestUrl({ url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(args.query))}` });
								const parser = new DOMParser();
								const doc = parser.parseFromString(res.text, 'text/html');
								const resultNodes = doc.querySelectorAll('.result__snippet');
								const links = doc.querySelectorAll('.result__url');
								const titles = doc.querySelectorAll('.result__title');
								
								let searchOutput = "";
								for (let i = 0; i < Math.min(5, resultNodes.length); i++) {
									searchOutput += `Result ${i + 1}:\n`;
									searchOutput += `Title: ${titles[i]?.textContent?.trim() || ''}\n`;
									searchOutput += `URL: ${links[i]?.textContent?.trim() || ''}\n`;
									searchOutput += `Snippet: ${resultNodes[i]?.textContent?.trim() || ''}\n\n`;
								}
								toolResult = searchOutput || "No results found.";
							} else if (toolCall.function.name === 'list_files') {
								const files = this.plugin.app.vault.getMarkdownFiles();
								toolResult = files.map(f => f.path).join("\n");
							} else if (toolCall.function.name === 'search_vault') {
								const ragFolders = this.plugin.settings.ragFolders.filter((f: string) => f);
								const excludeFolders = this.plugin.settings.excludeFolders.filter((f: string) => f);
								const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
								
								const filteredFiles = markdownFiles.filter((f: TFile) => {
									const inRag = ragFolders.includes('/') || ragFolders.length === 0 || ragFolders.some((folder: string) => f.path.startsWith(folder));
									const isExcluded = excludeFolders.some((folder: string) => f.path.startsWith(folder));
									return inRag && !isExcluded;
								});

								const queryStr = String(args.query).toLowerCase();
								const keywords = queryStr.split(/\s+/).filter(w => w.length > 2);

								const searchResults = [];
								for (const file of filteredFiles) {
									try {
										const content = await this.plugin.app.vault.cachedRead(file);
										const docLower = content.toLowerCase();
										let score = 0;
										for (const kw of keywords) {
											if (docLower.includes(kw)) score++;
										}
										if (score > 0) {
											searchResults.push({ path: file.path, content: content.substring(0, 1500), score });
										}
									} catch {
										// Ignore read errors
									}
								}

								searchResults.sort((a, b) => b.score - a.score);
								
								// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
								toolResult = searchResults.slice(0, 5).map((r: any) => `File: ${r.path}\nMatched Keywords: ${r.score}\nContent: ${r.content}`).join("\n\n---\n\n");
								if (!toolResult) toolResult = "No relevant results found.";
							} else {
								toolResult = `Error: Unknown tool ${toolCall.function.name}`;
							}
						} catch (err: unknown) {
							toolResult = `Error executing tool: ${err instanceof Error ? err.message : String(err)}`;
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

			// Update history without the system prompt, as it is dynamically injected
			currentHistory.shift(); // remove system prompt
			this.history = currentHistory;
			if(loadingEl.parentElement) {
				loadingEl.remove();
			}
			this.activeAbortController = null;
			if (stopBtn) stopBtn.setCssStyles({ display: 'none' });

		} catch (error) {
			console.error("Agent error:", error);
			this.addMessageToUI('assistant', 'Sorry, I encountered an error. Check the console for details.');
		}
	}

	async onClose() {
		// Cleanup if needed
	}
}
