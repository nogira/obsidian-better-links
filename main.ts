/*

RUN:
pnpm run dev

*/

import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { linkToMarkdown } from './src/linkToMarkdown.js';

export interface LinkFormatPluginSettings {
	mySetting: string;
	archiveLinks: boolean;
	icons: any; // object of type: icon
	urls: any; // object of urlMatch: type
}

const DEFAULT_SETTINGS: LinkFormatPluginSettings = {
	mySetting: 'default',
	archiveLinks: false,
	icons: {
		article: '📰',
		forum: '💬',
		paper: '🔬',
		tweet: '🐦',
		video: '📹',
	},
	urls: {
		'youtube.com/': 'video',
		'quantamagazine.org/': 'article',
		'twitter.com/': 'tweet',
	},
}

export default class LinkFormatPlugin extends Plugin {
	settings: LinkFormatPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'format-link',
			name: 'Format link',
			// hotkeys: [{
			// 	modifiers: ['Mod'],
			// 	key: '0',
			// }],
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// immediately delete current selection if any so that cursor 
				// position is not affected by random text
				editor.replaceSelection('');

				// try-catch so user knows if it fails and doesn't sit around 
				// waiting 10sec thinking its just taking a long time to load
				try {
					const inputURL = await navigator.clipboard.readText()

					// CHECK URL IS VALID URL, IF NOT NOTIFY AND END FUNCTION
					if (! /^https?:\/\/[^ "]+$/.test(inputURL)) {
						new Notice('URL invalid');
						return
					}

					// TRY TO FIND TYPE BY TESTING  URL AGAINST EXISTING URLS
					let type = '';
					for (const url of Object.keys(this.settings.urls)) {
						// 🚨🚨🚨 KEYS CANNOT HAVE HTTPS://WWW. SO MAKE SURE YOU CANT ADD IT
						let regex = new RegExp("^(https?:\/\/)?(www.)?" + url);
						if (regex.test(inputURL)) {
							type = this.settings.urls[url];
							break;
						}
					}
					// if no type found for inputURL, allow user to add type to settings
					if (! type) {
						//                                 pass in app, plugin, url
						const modal = new LinkAssignmentModal(this.app, this, inputURL);
						modal.onClose = async () => {
							// console.log('modal closed');
							type = modal.type;
							// console.log(type);

							// this is a check just in case a button wasn't 
							// clicked in the popup
							if (type) {
								// get the emoji
								const emoji = this.settings.icons[type];
								// create and return the formatted link text
								const output = await linkToMarkdown(inputURL, type, emoji, this.settings, editor);
								editor.replaceSelection(output);
							}
						}
						modal.open()
					} else {
						// get the emoji
						const emoji = this.settings.icons[type];
						// create and return the formatted link text
						const output = await linkToMarkdown(inputURL, type, emoji, this.settings, editor);
						editor.replaceSelection(output);
					}
				} catch (e) {
					console.error(e);
					new Notice('Failed to format link');
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LinkFormatSettingTab(this.app, this));

		this.registerEvent(this.app.workspace.on(
			'editor-paste',
			(e: ClipboardEvent, editor: Editor, markdownView: MarkdownView) => {
				// when you paste text, and left is "> ", and right is nothing,
				// then it will be a quote, so make sure each paragraph pasted 
				// gets indented and quoted
				const cursor = editor.getCursor();
				const textBeforeCursor = editor.getRange(
					{ line: cursor.line, ch: 0 },
					cursor
				);
				// if text before cursor is the same as the full text of the 
				// line, then it is viable for checking if it's a quote
				const cursorIsOnRightEdge = textBeforeCursor === editor.getLine(cursor.line);
				if (cursorIsOnRightEdge) {
					const isQuote = textBeforeCursor.match(/> $/);
					if (isQuote) {
						e.preventDefault();
						// --- MODIFY PASTED TEXT BEFORE PASTED ---
						// IMPORTANTLY THIS DOESNT ACTUALLY CHANGE THE CLIPBOARD 
						// TEXT, JUST THE CURRENT CLIPBOARD EVENT TEXT
						const clipboardText = e.clipboardData.getData('text/plain');
						// add indentation to each line
						console.log("clipboardText: ", clipboardText);
						let indentedText = clipboardText.replace(/^/gm, textBeforeCursor)
						console.log("indentedText1", indentedText);
						// since above added indentation to first line which 
						// already has indentation, remove indentation from 
						// first line
						indentedText = indentedText.substring(textBeforeCursor.length);
						console.log(indentedText);
						console.log("indentedText2", indentedText);
						editor.replaceSelection(indentedText);
					}
				}
			}
		));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// sort icons alphabetically
		this.settings.icons = Object.fromEntries(Object.entries(this.settings.icons).sort());
		// sort urls alphabetically
		this.settings.urls = Object.fromEntries(Object.entries(this.settings.urls).sort());
		// save settings
		await this.saveData(this.settings);
	}
}

class LinkAssignmentModal extends Modal {
	plugin: LinkFormatPlugin;
	inputURL: string;

	type: string = '';

	constructor(app: App, plugin: LinkFormatPlugin, inputURL: string) {
		super(app);
		this.plugin = plugin;
		this.inputURL = inputURL;
	}

	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText('Pick link type');

		const br = createEl("br");
		contentEl.append(br);

		Object.keys(this.plugin.settings.icons).forEach((key, idx) => {
			const type = key;

			const btn = createEl('button');
			btn.setText(key);
			btn.onclick = async () => {
				// FORMAT URL FOR ADDING TO SETTINGS
				// remove start of url
				let url = this.inputURL.replace(/^(https?:\/\/)?(www.)?/, '');
				// remove end of url, but leave 1 `/`
				url = url.replace(/(?<=\/).*$/, '');

				this.plugin.settings.urls[url] = type;
				await this.plugin.saveSettings();
				this.type = type; // MUST ASSIGN BEFORE CLOSING MODAL BC ONCLOSE() RELIES ON THIS.TYPE
				this.close();
			}
			contentEl.append(btn);
		});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SettingsLinkAssignmentModal extends Modal {
	plugin: LinkFormatPlugin;

	url: string;

	constructor(plugin: LinkFormatPlugin, url: string) {
		super(app);
		this.plugin = plugin;
		this.url = url;
	}

	onOpen() {
		const {titleEl, contentEl} = this;

		titleEl.setText('Assigned URL');

		const br = createEl("br");
		contentEl.append(br);

		new Setting(contentEl)
			.setName('URL')
			.setDesc('URL template to match. (regex)')
			.addText(text => text
				.setValue(this.url)
				.onChange(async (value) => {
					// store val to reassign to new key
					const val = this.plugin.settings.urls[this.url];
					// remove previous key
					delete this.plugin.settings.urls[this.url];
					// create new key val pair
					this.plugin.settings.urls[value] = val;
					// update this.url
					this.url = value;
					// save settings
					await this.plugin.saveSettings();
				}));
		
		new Setting(contentEl)
			.setName('Link Type')
			// .setDesc('')
			.addDropdown(dropdown => {
				for (const type of Object.keys(this.plugin.settings.icons)) {
					dropdown.addOption(type, type);
				}
				dropdown.setValue(this.plugin.settings.urls[this.url])
					.onChange(async (value) => {
						this.plugin.settings.urls[this.url] = value;
						await this.plugin.saveSettings();
					});
			});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class LinkFormatSettingTab extends PluginSettingTab {
	plugin: LinkFormatPlugin;

	constructor(app: App, plugin: LinkFormatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		

		new Setting(containerEl)
			.setName('Archive Link')
			.setDesc('Replace link with archived link.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archiveLinks)
				.onChange(async (value) => {
					// console.log('archive: ' + value);
					this.plugin.settings.archiveLinks = value;
					await this.plugin.saveSettings();
				}));


		


		// CHANGE THIS TO SAME AS ONE BELOW SO CAN FREELY ADD DIFFERENT TYPES

		

		containerEl.createEl('h2', {
			text: 'Link Types',
			attr: {
				style: "margin-top: 30px;"
			},
		});
		Object.keys(this.plugin.settings.icons).forEach((key, idx) => {
			new Setting(containerEl)
				.setName(key[0].toUpperCase() + key.substring(1) + ' emoji')
				// .setDesc('It\'s a secret')
				.addText(text => text
					.setPlaceholder('emoji(s)')
					.setValue(this.plugin.settings.icons[key])
					.onChange(async (value) => {
						// console.log('Secret: ' + value);
						this.plugin.settings.icons[key] = value;
						await this.plugin.saveSettings();
					}));
		});

		containerEl.createEl('h2', {
			text: 'Assigned URLs',
			attr: {
				style: "margin-top: 30px;"
			},
		});
		Object.keys(this.plugin.settings.urls).forEach((key, idx) => {
			const url = key;

			// const nameEl = document.createDocumentFragment();
			// nameEl.createSpan({ text: "●", attr: { style: `color: ${color}` } });
			// nameEl.appendText(` Color #${idx + 1}`);
			new Setting(containerEl)
				.setName(key)//nameEl)
				.setDesc(this.plugin.settings.urls[key])
				.addExtraButton(btn => btn
					.setIcon("edit")
					.setTooltip("Edit")
					.onClick(async () => {
						let modal = new SettingsLinkAssignmentModal(this.plugin, url);

						modal.onClose = async () => {
							this.display();
						};

						modal.open();
					}))
				.addExtraButton(btn => {
					btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
						delete this.plugin.settings.urls[url];
						await this.plugin.saveSettings();
						this.display();
					});
				});
		});

		new Setting(containerEl)
			.addButton(btn => {
				btn.setButtonText("New URL").onClick(async () => {
					this.plugin.settings.urls["z.com"] = "";
					await this.plugin.saveSettings();
					// reload display
					this.display();
				})
			});

	}
}
