import { App, Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { AIChatSettingTab } from "../ui/settings";
import { AIChatView, VIEW_TYPE_AI_CHAT } from "../ui/view";
import { AIChatSettings, ModelConfig, DEFAULT_SETTINGS } from "./types";
import { setLanguage, detectLanguage, i18n } from "./i18n";

/**
 * API Key 加密存储管理
 * 使用 Web Crypto API 对 API Key 进行加密，防止明文存储在 data.json 中
 */
class ApiKeyStorage {
  private static readonly SALT_KEY = "vaulttalk-encryption-salt";
  private static readonly IV_KEY = "vaulttalk-encryption-iv";

  /**
   * 获取或生成设备特定的加密密钥
   */
  private static async getDeviceKey(app: App): Promise<CryptoKey> {
    // 使用设备特定的信息生成密钥
    const platformStr = [
      Platform.isDesktop ? "desktop" : "mobile",
      Platform.isMacOS ? "mac" : Platform.isWin ? "win" : Platform.isLinux ? "linux" : "other",
    ].join("-");
    const deviceInfo = [
      platformStr,
      screen.width.toString(),
      screen.height.toString(),
      new Date().getTimezoneOffset().toString(),
    ].join("|");

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(deviceInfo),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    // 获取或生成 salt
    let salt = app.loadLocalStorage(this.SALT_KEY) as string | null;
    if (!salt) {
      const saltArray = crypto.getRandomValues(new Uint8Array(16));
      salt = Array.from(saltArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      app.saveLocalStorage(this.SALT_KEY, salt);
    }

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  /**
   * 加密 API Key
   */
  static async encryptApiKey(apiKey: string, app: App): Promise<string> {
    const key = await this.getDeviceKey(app);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(apiKey),
    );

    // 将 IV 和加密数据合并并转为 base64
    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * 解密 API Key
   */
  static async decryptApiKey(encryptedApiKey: string, app: App): Promise<string> {
    try {
      const key = await this.getDeviceKey(app);
      const combined = Uint8Array.from(atob(encryptedApiKey), (c) => c.charCodeAt(0));

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedData);

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error("API Key 解密失败:", error);
      return "";
    }
  }
}

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

    console.log("VaultTalk loaded");
  }

  onunload() {
    console.log("VaultTalk unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
      workspace.revealLeaf(leaf);
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

  /**
   * 获取完整的模型配置（包含解密后的 apiKey）
   */
  async getFullModelConfig(modelId: string): Promise<ModelConfig | undefined> {
    const model = this.settings.models.find((m) => m.id === modelId);
    if (!model) return undefined;

    const apiKey = await this.loadApiKey(modelId);
    return { ...model, apiKey };
  }

  /**
   * 获取所有完整模型配置
   */
  async getAllFullModelConfigs(): Promise<ModelConfig[]> {
    const models: ModelConfig[] = [];
    for (const model of this.settings.models) {
      const apiKey = await this.loadApiKey(model.id);
      models.push({ ...model, apiKey });
    }
    return models;
  }
}
