import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { clipboard } from "electron";

import { linkToMarkdown } from './src/linkToMarkdown.js';

// Remember to rename these classes and interfaces!

interface LinkFormatPluginSettings {
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
	},
}

export default class LinkFormatPlugin extends Plugin {
	settings: LinkFormatPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'format-link',
			name: 'Format link',
			hotkeys: [{
				modifiers: ['Mod'],
				key: '0',
			}],
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// try-catch so user knows if it fails and doesn't sit around 
				// waiting 10sec thinking its just taking a long time to load
				try {
					const inputURL = clipboard.readText();

					// CHECK URL IS VALID URL, IF NOT NOTIFY AND END FUNCTION
					if (! inputURL.match(/^https?:\/\/[^ "]+$/)) {
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
							console.log('modal closed');
							type = modal.type;

							console.log(type);
							// this is a check just in case a button wasn't 
							// clicked in the popup
							if (type) {
								// get the emoji
								const emoji = this.settings.icons[type];
								// create and return the formatted link text
								const output = await linkToMarkdown(inputURL, type, emoji);
								editor.replaceSelection(output);
							}
						}
						modal.open()
					} else {
						// get the emoji
						const emoji = this.settings.icons[type];
						// create and return the formatted link text
						const output = await linkToMarkdown(inputURL, type, emoji);
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

		// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// // Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Archive Link')
			.setDesc('Replace link with archived link.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archiveLinks)
				.onChange(async (value) => {
					console.log('archive: ' + value);
					this.plugin.settings.archiveLinks = value;
					await this.plugin.saveSettings();
				}));



		// CHANGE THIS TO SAME AS ONE BELOW SO CAN FREELY ADD DIFFERENT TYPES


		Object.keys(this.plugin.settings.icons).forEach((key, idx) => {
			new Setting(containerEl)
				.setName(key + ' emoji')
				// .setDesc('It\'s a secret')
				.addText(text => text
					.setPlaceholder('emoji(s)')
					.setValue(this.plugin.settings.icons[key])
					.onChange(async (value) => {
						console.log('Secret: ' + value);
						this.plugin.settings.icons[key] = value;
						await this.plugin.saveSettings();
					}));
		});


		containerEl.createEl('h3', {
			text: "Assigned URLs", attr: {
				style: "margin-bottom: 0"
			}
		});
		// const desc = containerEl.createEl("p", { cls: "setting-item-description" });
		// desc.append(
		// 	"Set the Colors for your Charts. This will set the border Color and the inner Color will be the same, but with less opacity. This ensures better compatibility with Dark and Light Mode. ",
		// 	"You can use any ",
		// 	desc.createEl("a", {
		// 		href: "https://www.w3schools.com/cssref/css_colors.asp",
		// 		text: "valid CSS Color."
		// 	}),
		// )
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
