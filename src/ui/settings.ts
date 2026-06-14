import { App, PluginSettingTab, Setting, TextAreaComponent, Modal, Notice } from "obsidian";
import type AIChatPlugin from "../main";
import { ModelConfig } from "../core/types";
import { AIService } from "../services/aiService";
import { i18n } from "../core/i18n";

type TabId = "general" | "models";

export class AIChatSettingTab extends PluginSettingTab {
  plugin: AIChatPlugin;
  private pendingModel: ModelConfig | null = null;
  private activeTab: TabId = "general";

  constructor(app: App, plugin: AIChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide(): void {
    this.pendingModel = null;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ================= Tab 栏 =================
    const tabBar = containerEl.createDiv("vaultbuddy-settings-tabs");

    const tabs: { id: TabId; label: string }[] = [
      { id: "general", label: i18n("settings.tabGeneral") },
      { id: "models", label: i18n("settings.tabModels") },
    ];

    const segment = tabBar.createDiv("vaultbuddy-tab-segment");
    tabs.forEach((tab) => {
      const btn = segment.createEl("button", {
        text: tab.label,
        cls: "vaultbuddy-tab-btn",
      });
      if (tab.id === this.activeTab) {
        btn.addClass("active");
      }
      btn.addEventListener("click", () => {
        this.activeTab = tab.id;
        this.display();
      });
    });

    const tabContent = containerEl.createDiv("vaultbuddy-tab-content");

    if (this.activeTab === "general") {
      this.drawGeneralTab(tabContent);
    } else {
      this.drawModelsTab(tabContent);
    }
  }

  // ==================== General Tab ====================

  private drawGeneralTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(i18n("settings.general")).setHeading();

    // 最大回复 Token
    new Setting(containerEl)
      .setName(i18n("settings.maxTokens"))
      .setDesc(i18n("settings.maxTokensDesc"))
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.maxResponseTokens))
          .setPlaceholder(i18n("settings.maxTokensPlaceholder"))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxResponseTokens = num;
              this.plugin.saveSettings();
            }
          });
      });

    // Temperature
    new Setting(containerEl)
      .setName(i18n("settings.temperature"))
      .setDesc(i18n("settings.temperatureDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .onChange((value) => {
            this.plugin.settings.temperature = value;
            this.plugin.saveSettings();
          });
      });

    // 启动时恢复上次对话
    new Setting(containerEl)
      .setName(i18n("settings.resumeLast"))
      .setDesc(i18n("settings.resumeLastDesc"))
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.resumeLastConversation).onChange((value) => {
          this.plugin.settings.resumeLastConversation = value;
          this.plugin.saveSettings();
        });
      });

    // 自定义规则
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

  // ==================== Models Tab ====================

  private drawModelsTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(i18n("settings.models")).setHeading();

    // 默认模型选择 + 添加按钮
    const addAndDefaultRow = containerEl.createDiv("vaultbuddy-model-top-row");

    new Setting(addAndDefaultRow)
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
      })
      .addButton((btn) =>
        btn
          .setButtonText(i18n("settings.addModel"))
          .setCta()
          .onClick(() => {
            if (!this.pendingModel) {
              this.pendingModel = {
                id: "pending_" + Date.now().toString(),
                name: "",
                baseUrl: "",
                apiKey: "",
                modelId: "",
                contextLength: 128000,
              };
              this.display();
            }
          }),
      );

    // 临时新建模型卡片
    if (this.pendingModel) {
      this.drawPendingCard(containerEl);
    }

    // 已保存的模型列表
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
  }

  // ==================== 临时新建卡片 ====================

  private drawPendingCard(containerEl: HTMLElement): void {
    const model = this.pendingModel!;
    const card = containerEl.createDiv("model-card model-card-pending");

    const cardHeader = card.createDiv("model-card-header");
    const headerLeft = cardHeader.createDiv("model-card-header-left");
    headerLeft.createEl("strong", { text: i18n("settings.newModel") });
    headerLeft.createEl("span", { text: i18n("settings.fillAll"), cls: "model-card-time" });

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

    const cardBody = card.createDiv("model-card-body");

    this.addCardInput(
      cardBody,
      i18n("settings.modelName"),
      i18n("settings.modelNamePlaceholder"),
      model.name,
      (v) => {
        model.name = v;
      },
    );
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
      model.apiKey || "",
      (v) => {
        model.apiKey = v;
      },
      true,
    );
    this.addCardInput(
      cardBody,
      i18n("settings.modelId"),
      i18n("settings.modelIdPlaceholder"),
      model.modelId,
      (v) => {
        model.modelId = v;
      },
    );
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

    const inputs = card.querySelectorAll<HTMLInputElement>(".model-card-input");
    const checkValid = () => {
      const allFilled = Array.from(inputs).every((inp) => inp.value.trim() !== "");
      if (allFilled) {
        validEl.textContent = "✅ " + i18n("settings.complete");
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

    if (!m.name?.trim() || !m.baseUrl?.trim() || !m.apiKey?.trim() || !m.modelId?.trim()) {
      new Notice(i18n("settings.fillAllFields"));
      return;
    }

    const newModel: ModelConfig = {
      id: Date.now().toString(),
      name: m.name.trim(),
      baseUrl: m.baseUrl.trim(),
      modelId: m.modelId.trim(),
      contextLength: m.contextLength,
    };

    await this.plugin.saveApiKey(newModel.id, m.apiKey.trim());
    this.plugin.settings.models.unshift(newModel);
    this.plugin.saveSettings();
    this.pendingModel = null;
    new Notice(i18n("settings.modelAdded"));
    this.display();
  }

  // ==================== 已保存卡片 ====================

  private async drawModelCard(
    containerEl: HTMLElement,
    model: ModelConfig,
    index: number,
  ): Promise<void> {
    const card = containerEl.createDiv("model-card");
    const apiKey = await this.plugin.loadApiKey(model.id);

    const cardHeader = card.createDiv("model-card-header");
    const headerLeft = cardHeader.createDiv("model-card-header-left");
    headerLeft.createEl("strong", { text: model.name || i18n("settings.unnamed") });

    const addedTime = new Date(parseInt(model.id) || Date.now()).toLocaleString();
    headerLeft.createEl("span", {
      text: `${i18n("settings.addTime")} ${addedTime}`,
      cls: "model-card-time",
    });

    const headerRight = cardHeader.createDiv("model-card-header-right");

    const editBtn = headerRight.createEl("button", {
      text: i18n("settings.edit"),
      cls: "model-card-btn",
    });
    editBtn.addEventListener("click", () => this.toggleEditMode(card, model, index));

    const deleteBtn = headerRight.createEl("button", {
      text: i18n("settings.delete"),
      cls: "model-card-btn model-card-btn-danger",
    });
    deleteBtn.addEventListener("click", () => this.confirmDeleteModel(card, model, index));

    const testBtn = headerRight.createEl("button", {
      text: i18n("settings.test"),
      cls: "model-card-btn model-card-btn-test",
    });
    testBtn.addEventListener("click", () => {
      if (!apiKey || !model.baseUrl || !model.modelId) {
        new Notice(i18n("notice.connectionTestNeedsConfig"));
        return;
      }
      testBtn.textContent = i18n("settings.testing");
      testBtn.disabled = true;
      void AIService.testConnection({ ...model, apiKey }).then((ok) => {
        testBtn.disabled = false;
        testBtn.textContent = i18n("settings.test");
        new Notice(ok ? i18n("settings.testSuccess") : i18n("settings.testFail"));
      });
    });

    const cardBody = card.createDiv("model-card-body");

    this.addCardInput(
      cardBody,
      i18n("settings.modelName"),
      i18n("settings.modelNamePlaceholder"),
      model.name,
      () => {}, // 不实时写入模型，由 toggleEditMode 统一保存
    );
    this.addCardInput(
      cardBody,
      i18n("settings.baseUrl"),
      i18n("settings.baseUrlPlaceholder"),
      model.baseUrl,
      () => {}, // 不实时写入模型，由 toggleEditMode 统一保存
    );
    this.addCardInput(
      cardBody,
      i18n("settings.apiKey"),
      i18n("settings.apiKeyPlaceholder"),
      apiKey,
      () => {}, // 不实时写入模型，由 toggleEditMode 统一保存
      true,
    );
    this.addCardInput(
      cardBody,
      i18n("settings.modelId"),
      i18n("settings.modelIdPlaceholder"),
      model.modelId,
      () => {}, // 不实时写入模型，由 toggleEditMode 统一保存
    );
    this.addCardInput(
      cardBody,
      i18n("settings.contextWindow"),
      i18n("settings.contextWindowPlaceholder"),
      String(model.contextLength),
      () => {}, // 不实时写入模型，由 toggleEditMode 统一保存
    );

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
        text: "\u{1F441}",
        cls: "model-card-password-toggle",
      });
      toggleBtn.addEventListener("click", () => {
        input.type = input.type === "password" ? "text" : "password";
        toggleBtn.textContent =
          input.type === "password" ? "\u{1F441}" : "\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}";
      });
    }

    input.addEventListener("input", () => {
      onChange(input.value);
    });
  }

  private toggleEditMode(card: HTMLElement, model: ModelConfig, index: number): void {
    const inputs = Array.from(card.querySelectorAll(".model-card-input")) as HTMLInputElement[];
    const editBtn = card.querySelector(".model-card-btn:first-child") as HTMLButtonElement;
    const isDisabled = inputs[0]?.disabled;

    if (isDisabled) {
      // 进入编辑模式：只启用输入框，不修改模型数据
      this.setCardInputsDisabled(card, false);
      if (editBtn) {
        editBtn.textContent = i18n("settings.save");
        editBtn.addClass("model-card-btn-save");
        card.addClass("editing");
      }
      return;
    }

    // 保存模式：从 DOM 读取所有输入值并验证
    const [nameInput, baseUrlInput, apiKeyInput, modelIdInput, contextInput] = inputs;
    const name = nameInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const modelId = modelIdInput.value.trim();
    const contextStr = contextInput.value.trim();

    if (!name || !baseUrl || !apiKey || !modelId || !contextStr) {
      new Notice(i18n("settings.fillAllFields"));
      return;
    }

    const contextLength = parseInt(contextStr);
    if (isNaN(contextLength) || contextLength <= 0) {
      new Notice(i18n("settings.fillAllFields"));
      return;
    }

    // 验证通过，写入模型并保存
    model.name = name;
    model.baseUrl = baseUrl;
    model.modelId = modelId;
    model.contextLength = contextLength;
    this.plugin.saveApiKey(model.id, apiKey);
    this.plugin.saveSettings();

    this.setCardInputsDisabled(card, true);
    if (editBtn) {
      editBtn.textContent = i18n("settings.edit");
      editBtn.removeClass("model-card-btn-save");
      card.removeClass("editing");
    }
  }

  private confirmDeleteModel(card: HTMLElement, model: ModelConfig, index: number): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText(i18n("settings.confirmDelete"));

    const content = modal.contentEl;
    content.createEl("p", {
      text: `${i18n("settings.deleteMsg")} "${model.name || i18n("settings.unnamed")}"?`,
    });
    content.createEl("p", { text: i18n("settings.irreversible"), cls: "modal-warning" });

    const btnRow = content.createDiv("modal-btn-row");

    btnRow
      .createEl("button", { text: i18n("settings.cancel") })
      .addEventListener("click", () => modal.close());

    const confirmBtn = btnRow.createEl("button", {
      text: i18n("settings.confirmDelete"),
      cls: "model-card-btn-danger",
    });
    confirmBtn.addEventListener("click", () => {
      void this.plugin.deleteApiKey(model.id).then(() => {
        this.plugin.settings.models.splice(index, 1);
        this.plugin.saveSettings();
        modal.close();
        this.display();
      });
    });

    modal.open();
  }

  private setCardInputsDisabled(card: HTMLElement, disabled: boolean): void {
    const inputs = card.querySelectorAll(".model-card-input") as NodeListOf<HTMLInputElement>;
    inputs.forEach((inp) => {
      inp.disabled = disabled;
    });

    const toggles = card.querySelectorAll(
      ".model-card-password-toggle",
    ) as NodeListOf<HTMLButtonElement>;
    toggles.forEach((btn) => {
      btn.toggleClass("model-card-toggle-hidden", disabled);
    });
  }
}
