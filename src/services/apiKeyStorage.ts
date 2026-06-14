import { App, Platform } from "obsidian";

/**
 * API Key 加密存储管理
 * 使用 Web Crypto API 对 API Key 进行加密，防止明文存储在 data.json 中
 */
export class ApiKeyStorage {
  private static readonly SALT_KEY = "vaultbuddy-encryption-salt";
  private static readonly IV_KEY = "vaultbuddy-encryption-iv";

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
