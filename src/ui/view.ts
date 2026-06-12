import {
  App,
  ItemView,
  WorkspaceLeaf,
  Notice,
  ButtonComponent,
  Modal,
  EventRef,
  TFile,
  MarkdownRenderer,
} from "obsidian";
import type AIChatPlugin from "../core/main";
import { AIService } from "../services/aiService";
import { Storage } from "../services/storage";
import { SourceManager } from "../utils/sourceManager";
import { ContextBuilder } from "../services/contextBuilder";
import { ChatMessage, Conversation, ModelConfig } from "../core/types";
import { i18n, detectLanguage } from "../core/i18n";

export const VIEW_TYPE_AI_CHAT = "vaulttalk-view";

export class AIChatView extends ItemView {
  plugin: AIChatPlugin;
  storage: Storage;
  sourceManager: SourceManager;
  private contextBuilder: ContextBuilder;
  private vaultEventRefs: EventRef[] = [];

  private messageArea: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private modelBtn: HTMLButtonElement;
  private sendBtn: HTMLButtonElement;
  private historyBtnEl: HTMLElement;
  private newConvBtnEl: HTMLElement;

  private currentConversation: Conversation | null = null;
  private isGenerating: boolean = false;
  private abortController: AbortController | null = null;
  private wasAborted: boolean = false;

  constructor(leaf: WorkspaceLeaf, plugin: AIChatPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.storage = new Storage(plugin);
    this.sourceManager = new SourceManager();
    this.contextBuilder = new ContextBuilder(this.app, this.sourceManager);
  }

  getViewType(): string {
    return VIEW_TYPE_AI_CHAT;
  }
  getDisplayText(): string {
    return i18n("view.title");
  }
  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("ai-chat-view");

    // 顶部工具栏
    const header = container.createDiv("vaulttalk-header");

    // 左侧标题
    header.createDiv("header-title").textContent = i18n("view.title");

    const headerRight = header.createDiv("header-right");

    // 历史对话按钮容器
    const historyContainer = headerRight.createDiv("header-btn-container");
    this.historyBtnEl = historyContainer;
    const historyBtn = new ButtonComponent(historyContainer);
    historyBtn
      .setIcon("history")
      .setTooltip(i18n("view.history"))
      .onClick(() => {
        if (!this.isGenerating) this.showHistory();
      });

    // 新对话按钮容器
    const newContainer = headerRight.createDiv("header-btn-container");
    this.newConvBtnEl = newContainer;
    const newBtn = new ButtonComponent(newContainer);
    newBtn
      .setIcon("plus")
      .setTooltip(i18n("view.newChat"))
      .onClick(() => {
        if (!this.isGenerating) this.newConversation();
      });

    // 消息区域
    this.messageArea = container.createDiv("message-area");

    // 输入区域
    const inputArea = container.createDiv("input-area");
    const inputContainer = inputArea.createDiv("input-container");

    // 输入框
    this.inputEl = inputContainer.createEl("textarea");
    this.inputEl.placeholder = i18n("view.input.placeholder");

    // 自动调整高度
    this.inputEl.addEventListener("input", () => {
      this.inputEl.setCssStyles({ height: "auto" });
      this.inputEl.setCssStyles({ height: Math.min(this.inputEl.scrollHeight, 120) + "px" });
    });

    // 按钮容器
    const buttonsContainer = inputContainer.createDiv("input-buttons");

    // 模型按钮
    this.modelBtn = buttonsContainer.createEl("button");
    this.modelBtn.addClass("model-btn");
    this.modelBtn.textContent = i18n("view.selectModel");
    this.updateModelBtn();
    this.modelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this.isGenerating) this.showModelDropdown();
    });

    // 发送/终止按钮
    this.sendBtn = buttonsContainer.createEl("button", { text: i18n("view.send") });
    this.sendBtn.addClass("send-btn");
    this.sendBtn.addEventListener("click", () => {
      if (this.isGenerating) {
        this.stopGeneration();
      } else {
        this.sendMessage();
      }
    });

    // 模型下拉关闭
    document.addEventListener("click", () => {
      const existing = document.querySelector(".model-dropdown");
      if (existing) existing.remove();
    });

    // Enter 发送
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (this.isGenerating) {
          this.stopGeneration();
        } else {
          this.sendMessage();
        }
      }
    });

    // 根据设置决定是否恢复上次对话
    if (this.plugin.settings.resumeLastConversation) {
      await this.loadLastConversation();
    }

    // 监听 vault 文件变化，清除 sourceManager 缓存
    this.setupVaultEventListeners();
  }

  /**
   * 设置 vault 文件变化监听
   */
  private setupVaultEventListeners(): void {
    // 文件创建时清除 sourceManager 缓存
    const createRef = this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.sourceManager.clearSources();
      }
    });
    this.vaultEventRefs.push(createRef);

    // 文件删除时清除 sourceManager 缓存
    const deleteRef = this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.sourceManager.clearSources();
      }
    });
    this.vaultEventRefs.push(deleteRef);

    // 文件重命名时清除 sourceManager 缓存
    const renameRef = this.app.vault.on("rename", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.sourceManager.clearSources();
      }
    });
    this.vaultEventRefs.push(renameRef);
  }

  async onClose(): Promise<void> {
    // 清除 contextBuilder 的缓存（下次打开时重新扫描）
    this.contextBuilder.clearCache();
    // 清理 contextBuilder 的事件监听和缓存
    this.contextBuilder.destroy();
    // 清理 vault 事件监听
    for (const ref of this.vaultEventRefs) {
      this.app.vault.offref(ref);
    }
    this.vaultEventRefs = [];
  }

  // ==================== 模型选择 ====================

  private updateModelBtn(): void {
    const model = this.getSelectedModel();
    if (model) {
      const name = model.name || model.modelId || model.id;
      this.modelBtn.textContent = name.length > 12 ? name.substring(0, 12) + "..." : name;
    } else if (this.plugin.settings.models.length > 0) {
      const m = this.plugin.settings.models[0];
      const name = m.name || m.modelId || m.id;
      this.modelBtn.textContent = name.length > 12 ? name.substring(0, 12) + "..." : name;
    } else {
      this.modelBtn.textContent = i18n("view.selectModel");
    }
  }

  private getSelectedModel(): ModelConfig | null {
    const defaultId = this.plugin.settings.defaultModelId;
    if (defaultId) {
      return this.plugin.settings.models.find((m) => m.id === defaultId) || null;
    }
    return this.plugin.settings.models[0] || null;
  }

  private showModelDropdown(): void {
    const existing = document.querySelector(".model-dropdown");
    if (existing) {
      existing.remove();
      return;
    }

    const rect = this.modelBtn.getBoundingClientRect();
    const models = this.plugin.settings.models;

    const dropdown = document.createElement("div");
    dropdown.addClass("model-dropdown");

    models.forEach((model) => {
      const item = dropdown.createDiv("model-dropdown-item");
      const name = model.name || model.modelId || model.id;
      item.textContent = name;
      if (model.id === this.plugin.settings.defaultModelId) {
        item.addClass("selected");
      }
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        this.plugin.settings.defaultModelId = model.id;
        await this.plugin.saveSettings();
        this.updateModelBtn();
        dropdown.remove();
      });
    });

    dropdown.setCssStyles({
      position: "fixed",
      left: rect.left + "px",
      bottom: window.innerHeight - rect.top + 4 + "px",
      width: Math.max(rect.width, 160) + "px",
    });

    document.body.appendChild(dropdown);
  }

  // ==================== 生成状态控制 ====================

  private setGeneratingState(generating: boolean): void {
    this.isGenerating = generating;
    this.modelBtn.disabled = generating;
    this.inputEl.disabled = generating;

    if (this.historyBtnEl) {
      this.historyBtnEl.classList.toggle("disabled", generating);
    }
    if (this.newConvBtnEl) {
      this.newConvBtnEl.classList.toggle("disabled", generating);
    }

    if (generating) {
      this.sendBtn.textContent = i18n("view.stop");
      this.sendBtn.addClass("stop-btn");
    } else {
      this.sendBtn.textContent = i18n("view.send");
      this.sendBtn.removeClass("stop-btn");
    }
  }

  /**
   * 中止生成
   */
  private stopGeneration(): void {
    if (this.abortController) {
      this.wasAborted = true;
      this.abortController.abort();
    }
  }

  // ==================== 消息发送 ====================

  async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isGenerating) return;

    const model = this.getSelectedModel();
    if (!model) {
      new Notice(i18n("notice.noModel"));
      return;
    }

    // 从 SecretStorage 加载 apiKey
    const apiKey = await this.plugin.loadApiKey(model.id);
    if (!apiKey) {
      new Notice(i18n("notice.noApiKey"));
      return;
    }
    const fullModel: ModelConfig = { ...model, apiKey };

    if (!this.currentConversation) {
      this.currentConversation = await this.storage.createConversation();
    }

    // 渲染用户消息
    const userMessage: ChatMessage = { role: "user", content };
    await this.renderMessage(userMessage);
    this.inputEl.value = "";
    this.inputEl.setCssStyles({ height: "36px" });

    // 保存用户消息
    await this.storage.addMessage(this.currentConversation.id, userMessage);
    this.currentConversation.messages.push(userMessage);
    this.currentConversation.updatedAt = Date.now();

    // 进入生成状态
    this.setGeneratingState(true);

    // 创建流式消息元素
    const wrapper = this.createStreamingMessage();
    const messageEl = wrapper.querySelector(".message") as HTMLElement;
    let fullContent = "";
    const contentEl = messageEl.querySelector(".message-content") as HTMLElement;
    const statusEl = contentEl.querySelector(".thinking-status") as HTMLElement;

    // 创建 AbortController
    this.abortController = new AbortController();

    try {
      // 检查是否需要构建知识库（sourceManager 为空表示需要扫描）
      const needsBuilding = this.sourceManager.getSourceCount() === 0;
      const buildStartTime = Date.now();

      // 显示对应的状态提示
      if (needsBuilding) {
        statusEl.textContent = i18n("view.buildingContext");
      } else {
        statusEl.textContent = i18n("view.thinkingLabel");
      }

      const messages = await this.buildMessages(content, fullModel);

      // 如果需要构建知识库，确保至少显示1秒
      if (needsBuilding) {
        const elapsed = Date.now() - buildStartTime;
        if (elapsed < 1000) {
          await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
        }
      }

      // 构建完成，更新状态为"正在思考"
      statusEl.textContent = i18n("view.thinkingLabel");

      for await (const chunk of AIService.chatStream(
        fullModel,
        messages,
        this.plugin.settings.maxResponseTokens,
        this.abortController.signal,
      )) {
        fullContent += chunk;
        // 移除状态提示，开始显示内容
        if (statusEl) {
          statusEl.remove();
        }
        contentEl.empty();
        await MarkdownRenderer.render(this.app, fullContent, contentEl, "", this);
        this.addNoteLinkHandlers(contentEl);
        this.messageArea.scrollTop = this.messageArea.scrollHeight;
      }

      messageEl.removeClass("thinking");
    } catch (error: any) {
      if (error.name === "AbortError") {
        // 用户主动终止：移除思考动画，添加终止提示
        messageEl.removeClass("thinking");
        const dots = contentEl.querySelector(".thinking-dots");
        if (dots) dots.remove();
      } else {
        console.error("AI 调用失败:", error);
        contentEl.textContent = `⚠️ ${error.message}`;
        messageEl.addClass("error");
        messageEl.removeClass("thinking");
      }
    }

    // 保存已生成的内容（即使被终止也保存）
    if (fullContent) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: fullContent,
      };
      await this.storage.addMessage(this.currentConversation.id, assistantMessage);
      this.currentConversation.messages.push(assistantMessage);
      this.currentConversation.updatedAt = Date.now();
    }

    // 添加操作按钮（在气泡外面下方）
    const actionsEl = wrapper.createDiv("message-actions");
    this.addActionBtn(actionsEl, i18n("view.copy"), fullContent);

    // 如果是被终止的，在消息后追加终止提示
    if (this.wasAborted) {
      const stoppedEl = wrapper.createDiv("stopped-indicator");
      stoppedEl.textContent = i18n("view.stopped");
      this.wasAborted = false;
    }

    this.abortController = null;
    this.setGeneratingState(false);
  }

  private async buildMessages(userMessage: string, model: ModelConfig): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    // System prompt - guide AI to reference note locations
    const basePrompt = `You are an Obsidian note assistant. You can answer questions based on the user's notes provided as context.

When responding:
1. Base your answers on the provided note content
2. Cite specific notes using Obsidian wiki-link syntax: [[path/to/note]]
3. If the content is not relevant, say so honestly
4. Use Markdown formatting
5. IMPORTANT: Always respond in the same language as the user's input`;

    const systemPrompt = this.plugin.settings.customRules
      ? `${basePrompt}\n\n${this.plugin.settings.customRules}`
      : basePrompt;
    messages.push({ role: "system", content: systemPrompt });

    // 读取全部仓库内容并注入上下文
    try {
      // 确保 sourceManager 包含所有文件（只在需要时更新）
      await this.ensureSourceFiles();

      // 用 contextBuilder 构建上下文（分块+相关度排序+截断）
      const vaultContext = await this.contextBuilder.buildKnowledgeContext(
        userMessage,
        model,
        this.plugin.settings.maxResponseTokens,
        undefined,
      );

      if (vaultContext) {
        messages.push({
          role: "system",
          content: `Here are the relevant notes from the vault (auto-selected based on relevance):\n\n${vaultContext}`,
        });
      }
    } catch (error) {
      console.error("读取仓库内容失败:", error);
    }

    messages.push({ role: "user", content: userMessage });
    return messages;
  }

  // ==================== 笔记链接处理 ====================

  /**
   * 为生成的笔记链接绑定点击事件，使用 Obsidian 的 openLinkText 解析链接
   * 能自动处理最短唯一路径、相对路径等场景
   */
  private addNoteLinkHandlers(containerEl: HTMLElement): void {
    const links = containerEl.querySelectorAll("a.internal-link");
    links.forEach((link) => {
      const anchor = link as HTMLAnchorElement;
      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        const notePath = anchor.getAttribute("data-href") || anchor.textContent || "";
        if (notePath) {
          this.app.workspace.openLinkText(notePath, "", false);
        }
      });
    });
  }

  // ==================== UI 渲染 ====================

  /**
   * 确保 sourceManager 包含所有 vault 文件
   * 只在 sourceManager 为空时添加，避免重复扫描
   */
  private async ensureSourceFiles(): Promise<void> {
    // 如果 sourceManager 已有文件，跳过
    if (this.sourceManager.getSourceCount() > 0) {
      return;
    }

    const allFiles = this.app.vault.getMarkdownFiles();
    const filesToInclude = allFiles.slice(0, 200);

    for (const file of filesToInclude) {
      this.sourceManager.addSource({
        type: "file",
        path: file.path,
        addedAt: Date.now(),
      });
    }
  }

  private createStreamingMessage(): HTMLElement {
    const wrapper = this.messageArea.createDiv("message-wrapper");
    const messageEl = wrapper.createDiv("message assistant thinking");
    const contentEl = messageEl.createDiv("message-content");

    // 状态提示文本
    const statusEl = contentEl.createDiv("thinking-status");
    statusEl.textContent = i18n("view.buildingContext");

    // 思考动画点
    const dotsContainer = contentEl.createDiv("thinking-dots");
    dotsContainer.createSpan({ cls: "dot" });
    dotsContainer.createSpan({ cls: "dot" });
    dotsContainer.createSpan({ cls: "dot" });

    this.messageArea.scrollTop = this.messageArea.scrollHeight;
    return wrapper;
  }

  private async renderMessage(message: ChatMessage): Promise<void> {
    // 外层包裹（用户消息右对齐）
    const alignClass = message.role === "user" ? "message-wrapper-right" : "";
    const wrapper = this.messageArea.createDiv(`message-wrapper ${alignClass}`);

    // 消息气泡（仅用户消息有背景）
    const bubble = wrapper.createDiv(`message ${message.role}`);
    const contentEl = bubble.createDiv("message-content");

    if (message.role === "assistant") {
      await MarkdownRenderer.render(this.app, message.content, contentEl, "", this);
      this.addNoteLinkHandlers(contentEl);
    } else {
      contentEl.textContent = message.content;
    }

    // 操作按钮（在气泡外面下方）
    const actionsEl = wrapper.createDiv("message-actions");
    this.addActionBtn(actionsEl, i18n("view.copy"), message.content);

    if (message.role === "user") {
      this.addActionBtn(actionsEl, i18n("view.fill"), message.content, true);
    }

    this.messageArea.scrollTop = this.messageArea.scrollHeight;
  }

  private addActionBtn(
    container: HTMLElement,
    label: string,
    content: string,
    fillInput: boolean = false,
  ): void {
    const btn = container.createDiv("msg-action-btn");
    btn.textContent = label;
    btn.addEventListener("click", async () => {
      if (fillInput) {
        this.inputEl.value = content;
        this.inputEl.focus();
      } else {
        await navigator.clipboard.writeText(content);
        btn.textContent = i18n("view.copied");
        setTimeout(() => {
          btn.textContent = i18n("view.copy");
        }, 1500);
      }
    });
  }

  // ==================== 历史对话 ====================

  private async showHistory(): Promise<void> {
    if (this.isGenerating) return;

    const conversations = await this.storage.getConversations();
    if (conversations.length === 0) {
      new Notice(i18n("view.noHistory"));
      return;
    }

    const modal = new HistoryModal(
      this.app,
      this.storage,
      conversations,
      this.currentConversation?.id,
      async (conv) => {
        await this.loadConversation(conv);
      },
    );
    modal.open();
  }

  private async loadConversation(conversation: Conversation): Promise<void> {
    this.currentConversation = conversation;
    this.messageArea.empty();
    for (const msg of conversation.messages) {
      await this.renderMessage(msg);
    }
  }

  private async newConversation(): Promise<void> {
    if (this.isGenerating) return;
    this.currentConversation = null;
    this.messageArea.empty();
  }

  private async loadLastConversation(): Promise<void> {
    const conversations = await this.storage.getConversations();
    if (conversations.length > 0) {
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      await this.loadConversation(conversations[0]);
    }
  }
}

// ==================== 历史对话模态框 ====================

class HistoryModal extends Modal {
  private storage: Storage;
  private conversations: Conversation[];
  private currentConversationId: string | undefined;
  private onSelect: (conversation: Conversation) => void;

  constructor(
    app: App,
    storage: Storage,
    conversations: Conversation[],
    currentConversationId: string | undefined,
    onSelect: (conversation: Conversation) => void,
  ) {
    super(app);
    this.storage = storage;
    this.conversations = conversations;
    this.currentConversationId = currentConversationId;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("history-modal");
    contentEl.createDiv("history-modal-title").textContent = i18n("view.history");

    const sorted = [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);

    sorted.forEach((conv) => {
      const isActive = conv.id === this.currentConversationId;
      const convEl = contentEl.createDiv(`history-item${isActive ? " history-item-active" : ""}`);

      const title = conv.title || i18n("view.newChat");
      convEl.createDiv("history-title").textContent = title;

      const timeStr = new Date(conv.updatedAt).toLocaleString("zh-CN");
      convEl.createDiv("history-time").textContent = timeStr;
      convEl.createDiv("history-count").textContent =
        `${conv.messages.length} ${i18n("view.msgCount")}`;

      const deleteBtn = convEl.createDiv("history-delete");
      deleteBtn.createSpan({ text: "×" });
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.storage.deleteConversation(conv.id);
        convEl.remove();
        new Notice(i18n("view.deleted"));
      });

      convEl.addEventListener("click", () => {
        this.onSelect(conv);
        this.close();
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
