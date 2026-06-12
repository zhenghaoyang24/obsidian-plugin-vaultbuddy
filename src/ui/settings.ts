import { App, PluginSettingTab, Setting, TextAreaComponent, Modal, Notice } from "obsidian";
import type AIChatPlugin from "../core/main";
import { ModelConfig } from "../core/types";
import { AIService } from "../services/aiService";
import { i18n } from "../core/i18n";

export class AIChatSettingTab extends PluginSettingTab {
  plugin: AIChatPlugin;
  // 临时新建模型（未保存）
  private pendingModel: ModelConfig | null = null;

  constructor(app: App, plugin: AIChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // 关闭设置页时清空未保存的临时模型
  hide(): void {
    this.pendingModel = null;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ================= 模型配置区域 =================
    containerEl.createEl("h2", { text: i18n("settings.models") });

    // 顶部添加按钮
    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText(i18n("settings.addModel"))
        .setCta()
        .onClick(() => {
          // 创建临时模型（未保存）
          if (!this.pendingModel) {
            this.pendingModel = {
              id: "pending_" + Date.now().toString(),
              name: "",
              baseUrl: "",
              apiKey: "",
              modelId: "",
              contextLength: 131072,
            };
            this.display();
          }
        }),
    );

    // 渲染临时新建模型卡片（在最上方）
    if (this.pendingModel) {
      this.drawPendingCard(containerEl);
    }

    // 已保存的模型列表（最新的在最上面）
    const sortedModels = [...this.plugin.settings.models].reverse();

    sortedModels.forEach((model) => {
      const originalIndex = this.plugin.settings.models.indexOf(model);
      this.drawModelCard(containerEl, model, originalIndex);
    });

    // 空状态提示
    if (!this.pendingModel && this.plugin.settings.models.length === 0) {
      const emptyHint = containerEl.createDiv("model-empty-hint");
      emptyHint.textContent = i18n("settings.noModels");
    }

    // ================= 默认模型选择 =================
    new Setting(containerEl)
      .setName(i18n("settings.defaultModel"))
      .setDesc(i18n("settings.defaultModelDesc"))
      .addDropdown((dropdown) => {
        this.plugin.settings.models.forEach((m) => {
          const label = m.name || m.modelId || m.id;
          dropdown.addOption(m.id, label);
        });
        if (this.plugin.settings.defaultModelId) {
          dropdown.setValue(this.plugin.settings.defaultModelId);
        }
        dropdown.onChange((value) => {
          this.plugin.settings.defaultModelId = value;
          this.plugin.saveSettings();
        });
      });

    // ================= 最大回复 Token =================
    new Setting(containerEl)
      .setName(i18n("settings.maxTokens"))
      .setDesc(i18n("settings.maxTokensDesc"))
      .addText((text) => {
        text.setValue(String(this.plugin.settings.maxResponseTokens))
          .setPlaceholder(i18n("settings.maxTokensPlaceholder"))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxResponseTokens = num;
              this.plugin.saveSettings();
            }
          });
      });

    // ================= 启动行为 =================
    new Setting(containerEl)
      .setName(i18n("settings.resumeLast"))
      .setDesc(i18n("settings.resumeLastDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.resumeLastConversation)
          .onChange((value) => {
            this.plugin.settings.resumeLastConversation = value;
            this.plugin.saveSettings();
          });
      });

    // ================= 自定义规则 =================
    new Setting(containerEl)
      .setName(i18n("settings.customRules"))
      .setDesc(i18n("settings.customRulesDesc"))
      .addTextArea((text: TextAreaComponent) => {
        text
          .setValue(this.plugin.settings.customRules)
          .setPlaceholder(i18n("settings.customRulesPlaceholder"))
          .onChange((value) => {
            this.plugin.settings.customRules = value;
            this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });
  }

  // ==================== 临时新建卡片 ====================

  private drawPendingCard(containerEl: HTMLElement): void {
    const model = this.pendingModel!;
    const card = containerEl.createDiv("model-card model-card-pending");

    // 头部
    const cardHeader = card.createDiv("model-card-header");
    const headerLeft = cardHeader.createDiv("model-card-header-left");
    headerLeft.createEl("strong", { text: i18n("settings.newModel") });
    headerLeft.createEl("span", { text: i18n("settings.fillAll"), cls: "model-card-time" });

    // 保存 / 取消按钮
    const headerRight = cardHeader.createDiv("model-card-header-right");

    const cancelBtn = headerRight.createEl("button", {
      text: i18n("settings.cancel"),
      cls: "model-card-btn",
    });
    cancelBtn.addEventListener("click", () => {
      this.pendingModel = null;
      this.display();
    });

    const saveBtn = headerRight.createEl("button", {
      text: i18n("settings.saveModel"),
      cls: "model-card-btn model-card-btn-save",
    });
    saveBtn.addEventListener("click", () => {
      this.saveNewModel();
    });

    // 输入区域
    const cardBody = card.createDiv("model-card-body");

    this.addCardInput(cardBody, i18n("settings.modelName"), i18n("settings.modelNamePlaceholder"), model.name, (v) => {
      model.name = v;
    });
    this.addCardInput(
      cardBody,
      i18n("settings.baseUrl"),
      i18n("settings.baseUrlPlaceholder"),
      model.baseUrl,
      (v) => {
        model.baseUrl = v;
      },
    );
    this.addCardInput(
      cardBody,
      i18n("settings.apiKey"),
      i18n("settings.apiKeyPlaceholder"),
      model.apiKey || '',
      (v) => {
        model.apiKey = v;
      },
      true,
    );
    this.addCardInput(cardBody, i18n("settings.modelId"), i18n("settings.modelIdPlaceholder"), model.modelId, (v) => {
      model.modelId = v;
    });
    this.addCardInput(
      cardBody,
      i18n("settings.contextWindow"),
      i18n("settings.contextWindowPlaceholder"),
      String(model.contextLength),
      (v) => {
        const num = parseInt(v);
        if (!isNaN(num) && num > 0) model.contextLength = num;
      },
    );

    // 验证提示
    const validEl = card.createDiv("model-card-valid-indicator invalid");
    validEl.textContent = i18n("settings.incomplete");

    const inputs = card.querySelectorAll(".model-card-input") as NodeListOf<HTMLInputElement>;
    const checkValid = () => {
      const allFilled = Array.from(inputs).every((inp) => inp.value.trim() !== "");
      if (allFilled) {
        validEl.textContent = "✅ 配置完整，可以保存";
        validEl.className = "model-card-valid-indicator valid";
      } else {
        validEl.textContent = i18n("settings.incomplete");
        validEl.className = "model-card-valid-indicator invalid";
      }
    };
    inputs.forEach((inp) => inp.addEventListener("input", checkValid));
  }

  private async saveNewModel(): Promise<void> {
    const m = this.pendingModel;
    if (!m) return;

    // 验证所有字段
    if (!m.name || !m.baseUrl || !m.apiKey || !m.modelId) {
      new Notice(i18n("settings.fillAllFields"));
      return;
    }

    // 转为正式模型
    const newModel: ModelConfig = {
      id: Date.now().toString(),
      name: m.name,
      baseUrl: m.baseUrl,
      modelId: m.modelId,
      contextLength: m.contextLength,
    };

    // 将 apiKey 存储到 SecretStorage
    await this.plugin.saveApiKey(newModel.id, m.apiKey);

    this.plugin.settings.models.unshift(newModel);
    this.plugin.saveSettings();
    this.pendingModel = null;
    new Notice(i18n("settings.modelAdded"));
    this.display();
  }

  // ==================== 已保存卡片 ====================

  private async drawModelCard(containerEl: HTMLElement, model: ModelConfig, index: number): Promise<void> {
    const card = containerEl.createDiv("model-card");

    // 从 SecretStorage 加载 apiKey
    const apiKey = await this.plugin.loadApiKey(model.id);

    // 头部
    const cardHeader = card.createDiv("model-card-header");
    const headerLeft = cardHeader.createDiv("model-card-header-left");
    headerLeft.createEl("strong", { text: model.name || i18n("settings.unnamed") });

    const addedTime = new Date(parseInt(model.id) || Date.now()).toLocaleString("zh-CN");
    headerLeft.createEl("span", { text: `${i18n("settings.addTime")} ${addedTime}`, cls: "model-card-time" });

    const headerRight = cardHeader.createDiv("model-card-header-right");

    // 编辑按钮
    const editBtn = headerRight.createEl("button", { text: i18n("settings.edit"), cls: "model-card-btn" });
    editBtn.addEventListener("click", () => this.toggleEditMode(card, model, index));

    // 删除按钮
    const deleteBtn = headerRight.createEl("button", {
      text: i18n("settings.delete"),
      cls: "model-card-btn model-card-btn-danger",
    });
    deleteBtn.addEventListener("click", () => this.confirmDeleteModel(card, model, index));

    // 测试按钮
    const testBtn = headerRight.createEl("button", { text: i18n("settings.test"), cls: "model-card-btn model-card-btn-test" });
    testBtn.addEventListener("click", async () => {
      if (!apiKey || !model.baseUrl || !model.modelId) {
        new Notice(i18n("notice.connectionTestNeedsConfig"));
        return;
      }
      testBtn.textContent = i18n("settings.testing");
      testBtn.disabled = true;
      const ok = await AIService.testConnection({ ...model, apiKey });
      testBtn.disabled = false;
      testBtn.textContent = i18n("settings.test");
      new Notice(ok ? i18n("settings.testSuccess") : i18n("settings.testFail"));
    });

    // 输入
    const cardBody = card.createDiv("model-card-body");

    this.addCardInput(cardBody, i18n("settings.modelName"), i18n("settings.modelNamePlaceholder"), model.name, (v) => {
      model.name = v;
      this.plugin.saveSettings();
    });
    this.addCardInput(
      cardBody,
      i18n("settings.baseUrl"),
      i18n("settings.baseUrlPlaceholder"),
      model.baseUrl,
      (v) => {
        model.baseUrl = v;
      },
    );
    this.addCardInput(
      cardBody,
      i18n("settings.apiKey"),
      i18n("settings.apiKeyPlaceholder"),
      apiKey,
      (v) => {
        // apiKey 变化时保存到 SecretStorage
        this.plugin.saveApiKey(model.id, v);
      },
      true,
    );
    this.addCardInput(cardBody, i18n("settings.modelId"), i18n("settings.modelIdPlaceholder"), model.modelId, (v) => {
      model.modelId = v;
    });
    this.addCardInput(
      cardBody,
      i18n("settings.contextWindow"),
      i18n("settings.contextWindowPlaceholder"),
      String(model.contextLength),
      (v) => {
        const num = parseInt(v);
        if (!isNaN(num) && num > 0) {
          model.contextLength = num;
        }
      },
    );

    // 初始禁用
    this.setCardInputsDisabled(card, true);
  }

  // ==================== 工具方法 ====================

  private addCardInput(
    body: HTMLElement,
    label: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void,
    isPassword: boolean = false,
  ): void {
    const row = body.createDiv("model-card-input-row");
    row.createDiv("model-card-label").textContent = label;

    const inputWrapper = row.createDiv("model-card-input-wrapper");
    const input = inputWrapper.createEl("input", {
      type: isPassword ? "password" : "text",
      placeholder: placeholder,
      value: value,
    });
    input.addClass("model-card-input");

    if (isPassword) {
      const toggleBtn = inputWrapper.createEl("button", {
        text: "👁",
        cls: "model-card-password-toggle",
      });
      toggleBtn.addEventListener("click", () => {
        input.type = input.type === "password" ? "text" : "password";
        toggleBtn.textContent = input.type === "password" ? "👁" : "🙈";
      });
    }

    input.addEventListener("input", () => {
      onChange(input.value);
      this.plugin.saveSettings();
    });
  }

  private toggleEditMode(card: HTMLElement, model: ModelConfig, index: number): void {
    const inputs = card.querySelectorAll(".model-card-input") as NodeListOf<HTMLInputElement>;
    const isDisabled = inputs[0]?.disabled;

    this.setCardInputsDisabled(card, !isDisabled);
    const editBtn = card.querySelector(".model-card-btn:first-child") as HTMLButtonElement;
    if (editBtn) {
      editBtn.textContent = isDisabled ? i18n("settings.save") : i18n("settings.edit");
      if (isDisabled) {
        editBtn.addClass("model-card-btn-save");
        card.addClass("editing");
      } else {
        editBtn.removeClass("model-card-btn-save");
        card.removeClass("editing");
      }
    }
  }

  private confirmDeleteModel(card: HTMLElement, model: ModelConfig, index: number): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(i18n("settings.confirmDelete"));

    const content = modal.contentEl;
    content.createEl("p", { text: `确定要删除模型"${model.name || "未命名"}"吗？` });
    content.createEl("p", { text: i18n("settings.irreversible"), cls: "modal-warning" });

    const btnRow = content.createDiv("modal-btn-row");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.marginTop = "16px";

    btnRow.createEl("button", { text: i18n("settings.cancel") }).addEventListener("click", () => modal.close());

    const confirmBtn = btnRow.createEl("button", {
      text: i18n("settings.confirmDelete"),
      cls: "model-card-btn-danger",
    });
    confirmBtn.addEventListener("click", async () => {
      // 同时删除 SecretStorage 中的 apiKey
      await this.plugin.deleteApiKey(model.id);
      this.plugin.settings.models.splice(index, 1);
      this.plugin.saveSettings();
      modal.close();
      this.display();
    });

    modal.open();
  }

  private setCardInputsDisabled(card: HTMLElement, disabled: boolean): void {
    const inputs = card.querySelectorAll(".model-card-input") as NodeListOf<HTMLInputElement>;
    inputs.forEach((inp) => {
      inp.disabled = disabled;
      inp.style.border = disabled ? "none" : "1px solid var(--background-modifier-border)";
      inp.style.background = disabled ? "transparent" : "var(--background-primary)";
      inp.style.opacity = "1";
    });

    const toggles = card.querySelectorAll(
      ".model-card-password-toggle",
    ) as NodeListOf<HTMLButtonElement>;
    toggles.forEach((btn) => {
      btn.style.display = disabled ? "none" : "";
    });
  }
}
