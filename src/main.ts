import { Plugin, WorkspaceLeaf } from "obsidian";
import { AIChatSettingTab } from "./ui/settings";
import { AIChatView, VIEW_TYPE_AI_CHAT } from "./ui/view";
import { AIChatSettings, DEFAULT_SETTINGS } from "./core/types";
import { setLanguage, detectLanguage, i18n } from "./core/i18n";
import { ApiKeyStorage } from "./services/apiKeyStorage";

export default class AIChatPlugin extends Plugin {
  settings: AIChatSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // 检测语言
    setLanguage(detectLanguage());

    // 注册视图
    this.registerView(VIEW_TYPE_AI_CHAT, (leaf) => new AIChatView(leaf, this));

    // 添加 Ribbon 图标
    this.addRibbonIcon("message-square", i18n("view.title"), async () => {
      await this.activateView();
    });

    // 注册设置页
    this.addSettingTab(new AIChatSettingTab(this.app, this));

    console.log("VaultBuddy loaded");
  }

  onunload() {
    console.log("VaultBuddy unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as AIChatSettings;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * 激活对话视图
   */
  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_AI_CHAT,
          active: true,
        });
      }
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);
    }
  }

  /**
   * 保存 API Key (加密存储)
   */
  async saveApiKey(modelId: string, apiKey: string): Promise<void> {
    const encrypted = await ApiKeyStorage.encryptApiKey(apiKey, this.app);
    // 存储加密后的数据到 settings
    if (!this.settings.encryptedApiKeys) {
      this.settings.encryptedApiKeys = {};
    }
    this.settings.encryptedApiKeys[modelId] = encrypted;
    await this.saveSettings();
  }

  /**
   * 读取 API Key (解密)
   */
  async loadApiKey(modelId: string): Promise<string> {
    const encrypted = this.settings.encryptedApiKeys?.[modelId];
    if (!encrypted) return "";
    return await ApiKeyStorage.decryptApiKey(encrypted, this.app);
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(modelId: string): Promise<void> {
    if (this.settings.encryptedApiKeys) {
      delete this.settings.encryptedApiKeys[modelId];
      await this.saveSettings();
    }
  }
}
