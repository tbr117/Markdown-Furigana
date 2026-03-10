/**
 * settings.ts — settings types, CSS injection, and SettingTab UI
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type FuriganaProPlugin from './main';

// ── Types & defaults ───────────────────────────────────────────────────────

export interface FuriganaProSettings {
  showInSourceMode: boolean;
  showInLivePreview: boolean;
  furiganaVisible: boolean;
  furiganaFontSize: number;    // em units, e.g. 0.6
  furiganaColor: string;       // hex string or '' to inherit
  furiganaFontFamily: string;
  furiganaOpacity: number;     // 0–1
  baseColor: string;
  baseFontFamily: string;
  autoReadingEnabled: boolean;
}

export const DEFAULT_SETTINGS: FuriganaProSettings = {
  showInSourceMode: true,
  showInLivePreview: true,
  furiganaVisible: true,
  furiganaFontSize: 0.6,
  furiganaColor: '',
  furiganaFontFamily: '',
  furiganaOpacity: 1,
  baseColor: '',
  baseFontFamily: '',
  autoReadingEnabled: true,
};

// ── CSS variable injection ─────────────────────────────────────────────────

export function applyStyles(settings: FuriganaProSettings): void {
  const b = document.body;
  b.style.setProperty('--furigana-font-size', `${settings.furiganaFontSize}em`);
  b.style.setProperty('--furigana-color',      settings.furiganaColor      || 'inherit');
  b.style.setProperty('--furigana-font',       settings.furiganaFontFamily || 'inherit');
  b.style.setProperty('--furigana-opacity',    String(settings.furiganaOpacity));
  b.style.setProperty('--furigana-base-color', settings.baseColor          || 'inherit');
  b.style.setProperty('--furigana-base-font',  settings.baseFontFamily     || 'inherit');
}

export function applyVisibility(visible: boolean): void {
  document.body.classList.toggle('furigana-hidden', !visible);
}

export function removeStyles(): void {
  [
    '--furigana-font-size', '--furigana-color', '--furigana-font',
    '--furigana-opacity', '--furigana-base-color', '--furigana-base-font',
  ].forEach(p => document.body.style.removeProperty(p));
  document.body.classList.remove('furigana-hidden');
}

// ── Settings tab ───────────────────────────────────────────────────────────

export class FuriganaSettingsTab extends PluginSettingTab {
  plugin: FuriganaProPlugin;

  constructor(app: App, plugin: FuriganaProPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Live preview ────────────────────────────────────────────────────
    // Uses the same .furi-char structure as the renderer so it shows the
    // correct flex-column layout (rt on top, kanji on bottom).
    const previewWrap = containerEl.createDiv('furigana-settings-preview');
    previewWrap.createSpan({ cls: 'furigana-settings-preview-label', text: 'Preview:' });

    const previewRuby = previewWrap.createEl('ruby', { cls: 'furi' });
    const previewChar = previewRuby.createEl('span', { cls: 'furi-char' });
    previewChar.createEl('rt', { text: 'かんじ' });
    previewChar.appendText('漢字');

    // ── Section: Rendering ──────────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Rendering' });

    new Setting(containerEl)
      .setName('Show furigana in Source Mode')
      .setDesc('Render ruby decorations while editing in Source Mode.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.showInSourceMode).onChange(async v => {
          this.plugin.settings.showInSourceMode = v;
          await this.plugin.saveSettings();
          this.plugin.updateEditorExtension();
        }),
      );

    new Setting(containerEl)
      .setName('Show furigana in Live Preview')
      .setDesc('Render ruby decorations in Live Preview mode.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.showInLivePreview).onChange(async v => {
          this.plugin.settings.showInLivePreview = v;
          await this.plugin.saveSettings();
          this.plugin.updateEditorExtension();
        }),
      );

    // ── Section: Appearance ─────────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Appearance' });

    const sizeSetting = new Setting(containerEl)
      .setName('Furigana font size')
      .setDesc(`Size relative to the base text. Current: ${this.plugin.settings.furiganaFontSize.toFixed(2)}em`);
    sizeSetting.addSlider(s =>
      s.setLimits(0.3, 1.2, 0.05).setValue(this.plugin.settings.furiganaFontSize)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.furiganaFontSize = v;
          sizeSetting.setDesc(`Size relative to the base text. Current: ${v.toFixed(2)}em`);
          await this.plugin.saveSettings();
          applyStyles(this.plugin.settings);
        }),
    );

    const opacitySetting = new Setting(containerEl)
      .setName('Furigana opacity')
      .setDesc(`Opacity when visible. Current: ${Math.round(this.plugin.settings.furiganaOpacity * 100)}%`);
    opacitySetting.addSlider(s =>
      s.setLimits(0, 1, 0.05).setValue(this.plugin.settings.furiganaOpacity)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.furiganaOpacity = v;
          opacitySetting.setDesc(`Opacity when visible. Current: ${Math.round(v * 100)}%`);
          await this.plugin.saveSettings();
          applyStyles(this.plugin.settings);
        }),
    );

    new Setting(containerEl)
      .setName('Furigana color')
      .setDesc('Color of the reading text. Click ↺ to inherit from the theme.')
      .addColorPicker(p =>
        p.setValue(this.plugin.settings.furiganaColor || '#888888')
          .onChange(async v => {
            this.plugin.settings.furiganaColor = v;
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
          }),
      )
      .addExtraButton(b =>
        b.setIcon('reset').setTooltip('Reset — inherit from theme')
          .onClick(async () => {
            this.plugin.settings.furiganaColor = '';
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName('Furigana font family')
      .setDesc('CSS font-family for the reading. Leave empty to inherit.')
      .addText(t =>
        t.setPlaceholder('"Noto Sans JP", sans-serif')
          .setValue(this.plugin.settings.furiganaFontFamily)
          .onChange(async v => {
            this.plugin.settings.furiganaFontFamily = v;
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
          }),
      );

    new Setting(containerEl)
      .setName('Base text color')
      .setDesc('Color of the kanji / base text. Click ↺ to inherit from the theme.')
      .addColorPicker(p =>
        p.setValue(this.plugin.settings.baseColor || '#000000')
          .onChange(async v => {
            this.plugin.settings.baseColor = v;
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
          }),
      )
      .addExtraButton(b =>
        b.setIcon('reset').setTooltip('Reset — inherit from theme')
          .onClick(async () => {
            this.plugin.settings.baseColor = '';
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName('Base text font family')
      .setDesc('CSS font-family for the kanji / base text. Leave empty to inherit.')
      .addText(t =>
        t.setPlaceholder('"Noto Serif JP", serif')
          .setValue(this.plugin.settings.baseFontFamily)
          .onChange(async v => {
            this.plugin.settings.baseFontFamily = v;
            await this.plugin.saveSettings();
            applyStyles(this.plugin.settings);
          }),
      );

    // ── Section: Auto Reading ────────────────────────────────────────────
    containerEl.createEl('h3', { text: 'Auto Reading' });

    new Setting(containerEl)
      .setName('Enable auto kanji → hiragana')
      .setDesc(
        'Use the bundled Japanese morphological analyser (kuromoji) to generate ' +
        'hiragana readings automatically. Desktop only.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.autoReadingEnabled).onChange(async v => {
          this.plugin.settings.autoReadingEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    // Dict setup note
    const dictNote = containerEl.createDiv({ cls: 'setting-item-description furigana-howto' });
    dictNote.style.paddingBottom = '8px';
    const dictP = dictNote.createEl('p');
    dictP.appendText('The ');
    dictP.createEl('code', { text: 'dict/' });
    dictP.appendText(' folder (~17 MB) must be present inside ');
    dictP.createEl('code', { text: '.obsidian/plugins/furigana-pro/' });
    dictP.appendText('. To create it, run:');
    dictNote.createEl('pre', { text: 'npm install && npm run copy-dict' }).style.margin = '4px 0';
    dictNote.createEl('p', { text: 'then reload the plugin. The first annotation after Obsidian starts will take a few seconds while the dictionary loads.' });

    // ── Section: How to Use ──────────────────────────────────────────────
    containerEl.createEl('h3', { text: 'How to Use' });

    const howto = containerEl.createDiv({ cls: 'furigana-howto' });

    // Syntax table
    howto.createEl('p', { text: 'Write furigana manually using curly-bracket syntax:' });
    const table = howto.createEl('table');
    const thead = table.createEl('thead');
    const hrow = thead.createEl('tr');
    ['You type', 'Renders as'].forEach(h => hrow.createEl('th', { text: h }));
    const tbody = table.createEl('tbody');
    const rows: [string, string][] = [
      ['{漢字|かんじ}',       'Whole-word annotation'],
      ['{漢|かん|字|じ}',     'Per-character annotation'],
      ['｛漢字｜かんじ｝',    'Full-width brackets (IME-friendly)'],
      ['{北京|Běi|jīng}',    'Pinyin / other scripts'],
    ];
    rows.forEach(([syntax, desc]) => {
      const row = tbody.createEl('tr');
      row.createEl('td').createEl('code', { text: syntax });
      row.createEl('td', { text: desc });
    });

    // Auto-annotate workflow
    howto.createEl('p', { text: 'Auto-annotate with a single keystroke:' });
    const steps = howto.createEl('ol');
    [
      'Place the cursor anywhere inside a kanji word, e.g. on 漢 in 漢字.',
      'Press your hotkey for "Furigana Pro: Annotate Japanese at cursor".',
      'The word is wrapped automatically → {漢字|かんじ} → renders with reading above.',
      'Works on a text selection too — select a whole sentence and annotate all kanji at once.',
      'Already typed {漢字|} with an empty reading? Press the hotkey to fill it in.',
    ].forEach(s => steps.createEl('li', { text: s }));

    // Hotkeys
    howto.createEl('p').createEl('strong', { text: 'Setting up hotkeys:' });
    const hotkeySteps = howto.createEl('ol');
    hotkeySteps.createEl('li').appendText('Open Settings → Hotkeys.');
    const searchStep = hotkeySteps.createEl('li');
    searchStep.appendText('Search for ');
    searchStep.createEl('strong', { text: 'Furigana Pro' });
    searchStep.appendText(' — you will see these commands:');

    const cmdList = howto.createEl('ul');
    const cmds: [string, string][] = [
      ['Furigana Pro: Annotate Japanese at cursor',
       'Main command — annotates the word at the cursor or the selected text.'],
      ['Furigana Pro: Toggle furigana visibility',
       'Show / hide all furigana instantly without leaving your note.'],
      ['Furigana Pro: Remove furigana from selection',
       'Strips {kanji|reading} back to plain kanji for the selected text.'],
      ['Furigana Pro: Insert furigana template {|}',
       'Inserts an empty {|} template so you can type the reading manually.'],
    ];
    cmds.forEach(([name, desc]) => {
      const li = cmdList.createEl('li');
      li.createEl('strong', { text: name });
      li.createEl('br');
      li.appendText(desc);
    });

    hotkeySteps.createEl('li').appendText(
      'Click the + button next to a command and press your desired key combination.',
    );
  }
}
