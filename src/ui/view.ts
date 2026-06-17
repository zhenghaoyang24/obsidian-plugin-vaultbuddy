import {
  App,
  ItemView,
  WorkspaceLeaf,
  Notice,
  ButtonComponent,
  Modal,
  TFile,
  TFolder,
  MarkdownRenderer,
} from "obsidian";
import type AIChatPlugin from "../main";
import { AIService } from "../services/aiService";
import { Storage } from "../services/storage";
import { SourceManager } from "../services/sourceManager";
import { ContextBuilder } from "../services/contextBuilder";
import { ChatMessage, Conversation, ModelConfig, Skill, EditBlockState } from "../core/types";
import { i18n } from "../core/i18n";
import { encode } from "gpt-tokenizer";
import { matchSkills } from "../services/skillMatcher";
import {
  parseEditBlocks,
  parseEditOperations,
  buildChangeGroups,
  applyOperations,
} from "../services/diffEngine";
import { renderDiffWidget } from "./diffWidget";

export const VIEW_TYPE_AI_CHAT = "vaultbuddy-view";

export class AIChatView extends ItemView {
  plugin: AIChatPlugin;
  storage: Storage;
  sourceManager: SourceManager;
  private contextBuilder: ContextBuilder;

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

  // 源笔记显示相关
  private sourcesBarEl: HTMLElement;
  private sourcesPanelEl: HTMLElement;
  private currentSourcePaths: string[] = [];
  private isSourcesPanelOpen: boolean = false;
  private conversationStatsEl: HTMLElement;

  /** 格式化 token 数量：>= 1,000,000 显示 M，>= 1,000 显示 k，其余原样 */
  private formatTokenCount(n: number): string {
    if (n >= 1_000_000) {
      const m = n / 1_000_000;
      return m % 1 === 0 ? `${m}m` : `${m.toFixed(1)}m`;
    }
    if (n >= 1_000) {
      const k = n / 1_000;
      return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return String(n);
  }

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
    const header = container.createDiv("vaultbuddy-header");

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
        if (!this.isGenerating) void this.showHistory();
      });

    // 新对话按钮容器
    const newContainer = headerRight.createDiv("header-btn-container");
    this.newConvBtnEl = newContainer;
    const newBtn = new ButtonComponent(newContainer);
    newBtn
      .setIcon("plus")
      .setTooltip(i18n("view.newChat"))
      .onClick(() => {
        if (!this.isGenerating) void this.newConversation();
      });

    // 对话统计信息（在标题下方）
    this.conversationStatsEl = container.createDiv("conversation-stats");

    // 消息区域
    this.messageArea = container.createDiv("message-area");

    // 源笔记展开面板（默认隐藏，位于 bar 上方实现向上展开）
    this.sourcesPanelEl = container.createDiv("vaultbuddy-sources-panel");
    this.sourcesPanelEl.addClass("collapsed");

    // 源笔记栏（点击切换面板展开/收起）
    this.sourcesBarEl = container.createDiv("vaultbuddy-sources-bar");
    this.sourcesBarEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSourcesPanel();
    });

    // 点击页面其他区域时收起展开面板
    activeDocument.addEventListener("click", (e) => {
      if (!this.isSourcesPanelOpen) return;
      const target = e.target as Node;
      if (!target) return;
      if (this.sourcesBarEl.contains(target) || this.sourcesPanelEl.contains(target)) return;
      this.collapseSourcesPanel();
    });

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
        void this.sendMessage();
      }
    });

    // 模型下拉关闭
    activeDocument.addEventListener("click", () => {
      const existing = activeDocument.querySelector(".model-dropdown");
      if (existing) existing.remove();
    });

    // Enter 发送
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (this.isGenerating) {
          this.stopGeneration();
        } else {
          void this.sendMessage();
        }
      }
    });

    // 根据设置决定是否恢复上次对话
    if (this.plugin.settings.resumeLastConversation) {
      await this.loadLastConversation();
    }
  }

  async onClose(): Promise<void> {
    // 清除 contextBuilder 的缓存（下次打开时重新扫描）
    this.contextBuilder.clearCache();
    // 清理 contextBuilder 的事件监听和缓存
    this.contextBuilder.destroy();
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
    const existing = activeDocument.querySelector(".model-dropdown");
    if (existing) {
      existing.remove();
      return;
    }

    const rect = this.modelBtn.getBoundingClientRect();
    const models = this.plugin.settings.models;

    const dropdown = activeDocument.createElement("div");
    dropdown.addClass("model-dropdown");

    models.forEach((model) => {
      const item = dropdown.createDiv("model-dropdown-item");
      const name = model.name || model.modelId || model.id;
      item.textContent = name;
      if (model.id === this.plugin.settings.defaultModelId) {
        item.addClass("selected");
      }
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.plugin.settings.defaultModelId = model.id;
        void this.plugin.saveSettings().then(() => {
          this.updateModelBtn();
          dropdown.remove();
        });
      });
    });

    dropdown.setCssStyles({
      position: "fixed",
      left: rect.left + "px",
      bottom: window.innerHeight - rect.top + 4 + "px",
      width: Math.max(rect.width, 140) + "px",
    });

    activeDocument.body.appendChild(dropdown);
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

    // 自动拒绝上一条消息中的 pending 编辑块
    await this.autoRejectPendingEdits();

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

    // 开始生成前隐藏源笔记条
    this.hideSourcesBar();

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
    let promptTokens = 0;
    let activatedSkillName = "";
    let collectedEditStates: EditBlockState[] | undefined;
    let assistantMessageToSave: ChatMessage | undefined;
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

      // 获取当前活动文件（用户正在查看的笔记）
      const activeFile = this.app.workspace.getActiveFile();
      const { messages, activatedSkills } = await this.buildMessages(
        content,
        fullModel,
        activeFile ?? undefined,
      );

      // 计算 prompt token 数（所有发送消息的内容）
      promptTokens = messages.reduce((sum, m) => sum + encode(m.content).length, 0);

      // 如果需要构建知识库，确保至少显示1秒
      if (needsBuilding) {
        const elapsed = Date.now() - buildStartTime;
        if (elapsed < 1000) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000 - elapsed));
        }
      }

      // 构建完成，更新状态为"正在思考"
      statusEl.textContent = i18n("view.thinkingLabel");

      // --- 流式渲染（支持实时 diff） ---
      const DIFF_START_RE = /(?:<tool_call>\s*)?%%\s*DIFF_START\s+(\{.*?\})\s*%%/;
      const DIFF_END_RE = /%%\s*DIFF_END\s*%%(?:\s*<\/tool_call>)?/;

      // 流式 diff 状态
      let sdMode: "normal" | "streaming" | "done" = "normal";
      let sdPath = "";
      let sdBody = "";
      let sdOriginalContent = "";
      let sdContainer: HTMLElement | null = null;
      let sdEditState: EditBlockState | null = null;
      let sdPostContent = ""; // diff 结束后 AI 继续输出的内容

      for await (const chunk of AIService.chatStream(
        fullModel,
        messages,
        this.plugin.settings.maxResponseTokens,
        this.abortController.signal,
        this.plugin.settings.temperature,
      )) {
        fullContent += chunk;

        // 移除状态提示
        if (statusEl) {
          statusEl.remove();
        }

        if (sdMode === "streaming") {
          // ---- 正在流式 diff：累积操作行，检测结束标记 ----
          const endMatch = sdBody.match(DIFF_END_RE);
          if (endMatch) {
            // DIFF_END 出现：截取操作部分，完成 diff
            const opsText = sdBody.substring(0, endMatch.index);
            sdBody = opsText;

            if (!collectedEditStates) collectedEditStates = [];
            const ops = parseEditOperations(sdBody);
            const { groups, errors } = buildChangeGroups(ops, sdOriginalContent);
            const newContent = applyOperations(sdOriginalContent, ops);
            sdEditState!.newContent = newContent;
            collectedEditStates.push(sdEditState!);

            if (sdContainer) {
              sdContainer.empty();
              renderDiffWidget({
                container: sdContainer,
                filePath: sdPath,
                groups,
                errors,
                state: "pending",
                newContent,
                newLines: newContent.split("\n"),
                app: this.app,
                onStateChange: (newState) => {
                  sdEditState!.state = newState;
                  void this.storage.addMessage(this.currentConversation!.id, assistantMessageToSave!);
                },
                onFeedback: (fp, outcome) => this.addDiffFeedback(fp, outcome),
              });
            }
            sdMode = "done";
          } else {
            // DIFF_END 未出现：累积新 chunk，实时更新 diff
            sdBody += chunk;
            if (sdContainer) {
              const ops = parseEditOperations(sdBody);
              const { groups, errors } = buildChangeGroups(ops, sdOriginalContent);
              const newContent = applyOperations(sdOriginalContent, ops);
              sdEditState!.newContent = newContent;
              sdContainer.empty();
              renderDiffWidget({
                container: sdContainer,
                filePath: sdPath,
                groups,
                errors,
                state: "pending",
                newContent,
                newLines: newContent.split("\n"),
                app: this.app,
                interactive: false, // 流式中不显示按钮
              });
            }
            this.messageArea.scrollTop = this.messageArea.scrollHeight;
          }
        } else if (sdMode === "done") {
          // diff 已完成，累积后续文字
          sdPostContent += chunk;
        } else {
          // ---- normal 模式：渲染 markdown，检测 DIFF_START ----
          const startMatch = fullContent.match(DIFF_START_RE);
          if (startMatch) {
            // DIFF_START 出现：渲染前面的文字，创建 diff 容器
            collectedEditStates = [];
            const beforeText = fullContent.substring(0, startMatch.index)
              .replace(/<tool_call>\s*/g, "");
            contentEl.empty();
            if (beforeText.trim()) {
              await MarkdownRenderer.render(this.app, beforeText, contentEl, "", this);
              this.addNoteLinkHandlers(contentEl);
            }

            // 解析 JSON meta
            try {
              const meta = JSON.parse(startMatch[1]);
              sdPath = meta.path;
            } catch {
              sdPath = "unknown";
            }
            const file = this.app.vault.getAbstractFileByPath(sdPath);
            sdOriginalContent = file instanceof TFile ? await this.app.vault.read(file) : "";

            // 创建 diff 容器
            sdContainer = contentEl.createDiv("vaultbuddy-streaming-diff");
            sdEditState = {
              path: sdPath,
              newContent: "",
              originalContent: sdOriginalContent,
              state: "pending",
            };

            // 提取 DIFF_START 标记之后的操作行
            const afterStart = fullContent.substring(startMatch.index! + startMatch[0].length);
            sdBody = afterStart;

            // 检查是否已经收到 DIFF_END
            const endMatch = sdBody.match(DIFF_END_RE);
            if (endMatch) {
              // 标记完整：直接渲染
              const opsText = sdBody.substring(0, endMatch.index);
              sdBody = opsText;
              const ops = parseEditOperations(sdBody);
              const { groups, errors } = buildChangeGroups(ops, sdOriginalContent);
              const newContent = applyOperations(sdOriginalContent, ops);
              sdEditState.newContent = newContent;
              collectedEditStates.push(sdEditState);
              if (sdContainer) {
                renderDiffWidget({
                  container: sdContainer,
                  filePath: sdPath,
                  groups,
                  errors,
                  state: "pending",
                  newContent,
                  newLines: newContent.split("\n"),
                  app: this.app,
                  onStateChange: (newState) => {
                    sdEditState!.state = newState;
                    void this.storage.addMessage(this.currentConversation!.id, assistantMessageToSave!);
                  },
                });
              }
              sdMode = "done";
            } else {
              // 标记不完整：进入流式 diff 模式
              const ops = parseEditOperations(sdBody);
              const { groups, errors } = buildChangeGroups(ops, sdOriginalContent);
              const partialNewContent = applyOperations(sdOriginalContent, ops);
              if (sdContainer) {
                renderDiffWidget({
                  container: sdContainer,
                  filePath: sdPath,
                  groups,
                  errors,
                  state: "pending",
                  newContent: partialNewContent,
                  newLines: partialNewContent.split("\n"),
                  app: this.app,
                  interactive: false,
                });
              }
              sdMode = "streaming";
            }
            this.messageArea.scrollTop = this.messageArea.scrollHeight;
          } else {
            // 无 DIFF_START：正常渲染 markdown
            contentEl.empty();
            await MarkdownRenderer.render(this.app, fullContent, contentEl, "", this);
            this.addNoteLinkHandlers(contentEl);
            this.messageArea.scrollTop = this.messageArea.scrollHeight;
          }
        }
      }

      // 流式结束：如果 diff 仍在流式中（DIFF_END 未收到），用已有内容完成
      if (sdMode === "streaming" && sdEditState && sdContainer) {
        if (!collectedEditStates) collectedEditStates = [];
        const ops = parseEditOperations(sdBody);
        const { groups, errors } = buildChangeGroups(ops, sdOriginalContent);
        const newContent = applyOperations(sdOriginalContent, ops);
        sdEditState.newContent = newContent;
        collectedEditStates.push(sdEditState);
        sdContainer.empty();
        renderDiffWidget({
          container: sdContainer,
          filePath: sdPath,
          groups,
          errors,
          state: "pending",
          newContent,
          newLines: newContent.split("\n"),
          app: this.app,
          onStateChange: (newState) => {
            sdEditState!.state = newState;
            void this.storage.addMessage(this.currentConversation!.id, assistantMessageToSave!);
          },
        });
        sdMode = "done";
      }

      // 渲染 diff 结束后 AI 继续输出的文字
      const cleanPostContent = sdPostContent.replace(/<\/?tool_call>/g, "");
      if (cleanPostContent.trim()) {
        await MarkdownRenderer.render(this.app, cleanPostContent, contentEl, "", this);
        this.addNoteLinkHandlers(contentEl);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        // 用户主动终止：移除思考动画，添加终止提示
        messageEl.removeClass("thinking");
        const dots = contentEl.querySelector(".thinking-dots");
        if (dots) dots.remove();
      } else {
        console.error("AI 调用失败:", error);
        const msg = error instanceof Error ? error.message : String(error);
        contentEl.textContent = `⚠️ ${msg}`;
        messageEl.addClass("error");
        messageEl.removeClass("thinking");
      }
    }

    // 保存已生成的内容（即使被终止也保存）
    if (fullContent) {
      const completionTokens = encode(fullContent).length;
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: fullContent,
        skillName: activatedSkillName || undefined,
        usage: { promptTokens, completionTokens },
        editStates: collectedEditStates,
      };
      assistantMessageToSave = assistantMessage;
      await this.storage.addMessage(this.currentConversation.id, assistantMessage);
      this.currentConversation.messages.push(assistantMessage);
      this.currentConversation.updatedAt = Date.now();

      // 添加操作按钮和 token 信息（在气泡外面下方）
      const actionsEl = wrapper.createDiv("message-actions");
      // token 信息 + 技能标签
      const tokenEl = actionsEl.createSpan("token-usage");
      let tokenText = `${i18n("tokens.prompt")}: ${this.formatTokenCount(promptTokens)}  ${i18n("tokens.completion")}: ${this.formatTokenCount(completionTokens)}`;
      if (activatedSkillName) {
        tokenText += `  ${i18n("view.skillLabel")}：${activatedSkillName}`;
      }
      tokenEl.textContent = tokenText;
      // 操作按钮
      const actionsRight = actionsEl.createDiv("message-actions-right");
      this.addActionBtn(actionsRight, i18n("view.copy"), fullContent);
    } else {
      // 没有内容时也创建空的 actions 占位
      const actionsEl = wrapper.createDiv("message-actions");
      const actionsRight = actionsEl.createDiv("message-actions-right");
      this.addActionBtn(actionsRight, i18n("view.copy"), fullContent);
    }

    // 如果是被终止的，在消息后追加终止提示
    if (this.wasAborted) {
      const stoppedEl = wrapper.createDiv("stopped-indicator");
      stoppedEl.textContent = i18n("view.stopped");
      this.wasAborted = false;
    }

    this.abortController = null;
    this.setGeneratingState(false);

    // AI 回答完成后更新源笔记栏和对话统计
    this.updateSourcesBar();
    this.updateConversationStats();

    // 延迟一帧重新滚动到底部（确保 DOM 布局更新后）
    window.setTimeout(() => {
      this.messageArea.scrollTop = this.messageArea.scrollHeight;
    }, 0);
  }

  private async buildMessages(
    userMessage: string,
    model: ModelConfig,
    currentFile?: TFile,
  ): Promise<{ messages: ChatMessage[]; activatedSkills: Skill[] }> {
    const messages: ChatMessage[] = [];

    // System prompt - guide AI to reference note locations
    const todayStr = new Date().toISOString().split("T")[0]; // "2025-06-14"
    const basePrompt = `You are VaultBuddy, an intelligent note assistant deeply integrated into the user's Obsidian vault. You have access to the user's note vault content and conversation history. Your job is to provide accurate, well-structured, and genuinely helpful answers grounded in the user's own notes.

## Current Date
Today is ${todayStr}. Use this date as a reference when answering time-related questions. For example, if the user asks about "this week", "last month", or "recent notes", calculate the date range starting from ${todayStr}.

## Language (Highest Priority)
Detect the language of the user's most recent message and respond EXCLUSIVELY in that language. Ignore the language of the vault notes and context. If the user writes in English, respond in English. If in Chinese, respond in Chinese. If in Japanese, respond in Japanese. Never mix languages in your response. This rule overrides all other instructions.

## Knowledge Grounding
- Ground every answer in the provided vault context and conversation history
- When the context contains relevant information, synthesize it into a clear answer
- When you find multiple notes with related information, compare and connect them to give a more complete picture
- When notes contain contradictory information, point out the contradiction explicitly and cite the conflicting sources
- When the context is insufficient, state exactly what is missing and suggest where the user might find the answer
- If the user's question is ambiguous or unclear, ask a specific clarifying question before answering
- NEVER fabricate, guess, or hallucinate information. If you are unsure, say so
- If the provided context does not contain an answer, DO NOT rely on your pre-training knowledge unless the user explicitly asks a general knowledge question. Clearly distinguish between "found in your notes" and "based on my general knowledge"

## Note References
- Cite notes using Obsidian wiki-link syntax: [[exact/file/path]]
- Only use wiki-links for FILES, never folders. Mention folders in plain text
- The path must match the exact file path relative to vault root (e.g. [[projects/web-dev/react-hooks]])
- Keep citations concise — mention the note path for traceability, but do not over-cite
- When referencing a specific section of a note, include a heading hint in the citation: e.g. "as noted in [[project-plan]] under 'Timeline'"

## Response Quality
- Be concise and direct. Skip unnecessary preamble, greetings, and filler
- When the user asks to summarize, transform, reorganize, or compare content, execute it directly without restating what you are about to do
- Use Markdown formatting for clarity: headings, lists, tables, code blocks, and bold/italic as appropriate
- For multi-part questions, structure your answer with clear sections
- If reviewing or critiquing content, be specific: quote the relevant passage, explain the issue, and suggest a fix
- When listing multiple items, prefer bullet points or numbered lists for readability
- Use code blocks with language tags for any code snippets

## Note Editing
You can suggest edits to the user's notes. The user decides whether to apply your suggestions. Follow these rules precisely:

### When the user clearly wants to modify a note (strong intent):
Examples: "help me polish this note", "rewrite paragraph 3", "translate this note to English", "帮我润色当前笔记"
1. Briefly describe what changes you will suggest (1-2 sentences)
2. Output an edit block with the specific changes (see format below)
3. The \`path\` MUST be the exact vault-relative file path
4. If the user says "current note" or "this note", use the current active file path from the context
5. If you cannot determine WHICH file to edit, you MUST ask the user — never guess
6. Do NOT claim you have already modified the file. You are only providing a suggestion — the user will decide whether to apply it.

### When the user is just asking for optimization advice (weak intent):
Examples: "how can I improve my note?", "what's wrong with this article?", "我的笔记还可以怎么优化"
1. Answer the question normally with analysis and suggestions
2. End with: "If you'd like, I can provide a suggested edit for you to review."
3. Do NOT output an edit block yet
4. Only output an edit block after the user explicitly confirms

### Edit block format:
Use this EXACT format. The start/end markers are Obsidian comments (\%\%) and MUST each be on their own line:
\`\`\`
\%\% DIFF_START {"path":"relative/path/to/note.md"} \%\%
{"startLine":3,"endLine":5,"old":"original line 3\\noriginal line 4\\noriginal line 5","new":"new line 3\\nnew line 4"}
{"startLine":10,"endLine":10,"old":"original line 10","new":"new line 10"}
\%\% DIFF_END \%\%
\`\`\`

Each line between the start and end markers is a JSON object representing one edit operation:
- \`startLine\` / \`endLine\`: line range in the ORIGINAL file (1-based, inclusive)
- \`old\`: the original content of that range (lines joined by \\n)
- \`new\`: the replacement content (lines joined by \\n)

Operation types:
- **Replace**: both old and new have content
- **Insert** (after startLine): old is empty string "", new has the inserted content
- **Delete**: old has the content, new is empty string ""

The file content in the context is shown with line numbers like [1], [2], etc. Use these exact line numbers in your edit operations.

### Safety rules:
- Only output edit blocks when the user has explicitly agreed to modify
- The path must be accurate — never fabricate paths
- The \`old\` content must EXACTLY match the original file content at those lines (including spaces, punctuation)
- If the file path from context doesn't match what the user means, ask for clarification
- Sort edit operations by line number (ascending) for clarity
- NEVER claim you have applied or modified the file. You are providing a suggestion only — the user will choose to accept or reject it.
- If you see "[Applied: filename]" in the conversation, the user accepted a previous suggestion. If you see "[Rejected: filename]", the user rejected it. Do not assume a suggestion was applied unless you see the "Applied" confirmation.`;

    let systemPrompt = this.plugin.settings.customRules
      ? `${basePrompt}\n\n## Custom Rules\n${this.plugin.settings.customRules}`
      : basePrompt;

    // 检查是否有匹配的 Skill，有则注入到 system prompt
    const matchedSkills = matchSkills(userMessage, this.plugin.settings.skills);
    const activatedSkills = [...matchedSkills];
    if (matchedSkills.length > 0) {
      const skillsBlock = matchedSkills.map((s) => `- **${s.name}**: ${s.instruction}`).join("\n");
      systemPrompt += `\n\n## Activated Skills\nThe following skills are activated based on your request:\n${skillsBlock}\n\nFollow the instructions of the activated skill(s) above when responding. If multiple skills are activated, combine them appropriately.`;
    }

    messages.push({ role: "system", content: systemPrompt });

    // 注入最近历史对话（最多 20 条，排除最后一条即当前用户消息）
    const history = this.currentConversation?.messages ?? [];
    const recentHistory = history.slice(0, -1).slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // 读取全部仓库内容并注入上下文
    try {
      // 确保 sourceManager 包含所有文件（只在需要时更新）
      await this.ensureSourceFiles();

      // 用 contextBuilder 构建上下文
      // 当前活动文件的完整内容将优先注入，其他笔记的相关段落填充剩余空间
      const contextResult = await this.contextBuilder.buildKnowledgeContext(
        userMessage,
        model,
        this.plugin.settings.maxResponseTokens,
        currentFile,
      );

      if (contextResult.context) {
        messages.push({
          role: "system",
          content: `Here is your vault content as context. Current date: ${todayStr}. The current note (if you had one open) is included in full, alongside relevant excerpts from other notes:\n\n${contextResult.context}`,
        });
      }

      // 如果有当前活动文件，注入带行号的版本（供编辑参考）
      if (currentFile) {
        const fileContent = await this.app.vault.read(currentFile);
        const numberedLines = fileContent
          .split("\n")
          .map((line, idx) => `[${idx + 1}] ${line}`)
          .join("\n");
        messages.push({
          role: "system",
          content: `The current note "${currentFile.path}" with line numbers (for edit reference):\n\n${numberedLines}`,
        });
      }

      // 保存本次使用的源文件路径（稍后 AI 回答完后更新 UI）
      this.currentSourcePaths = contextResult.sourcePaths;
    } catch (error) {
      console.error("读取仓库内容失败:", error);
    }

    messages.push({ role: "user", content: userMessage });
    return { messages, activatedSkills };
  }

  // ==================== 笔记链接处理 ====================

  /**
   * 为内部链接绑定点击事件，跳转笔记文件；文件夹则替换为纯文本
   */
  private addNoteLinkHandlers(containerEl: HTMLElement): void {
    const links = containerEl.querySelectorAll("a.internal-link");
    links.forEach((link) => {
      const anchor = link as HTMLAnchorElement;
      const href = anchor.getAttribute("data-href") || anchor.textContent || "";
      if (!href) return;

      const resolved = this.app.metadataCache.getFirstLinkpathDest(href, "");
      if (resolved instanceof TFolder) {
        const span = activeDocument.createElement("span");
        span.textContent = anchor.textContent || href;
        span.className = "vaultbuddy-folder-link";
        anchor.replaceWith(span);
        return;
      }

      anchor.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.openLinkText(href, "", false);
      });
    });
  }

  // ==================== UI 渲染 ====================

  /**
   * 确保 sourceManager 中的文件列表与 vault 实时同步
   *
   * 每次调用都会比较 vault 当前文件列表和 sourceManager 中的列表，
   * 只做增量更新（添加新文件、移除已删除的文件），不做全量重建。
   *
   * 不再依赖事件监听来维护源列表的一致性。
   */
  private async ensureSourceFiles(): Promise<void> {
    const currentFiles = this.app.vault.getMarkdownFiles();
    const currentPaths = new Set(currentFiles.map((f) => f.path));
    const existingSources = this.sourceManager.getSources();
    const existingPaths = new Set(existingSources.map((s) => s.path));

    // 添加 vault 中有但 sourceManager 中没有的文件
    for (const file of currentFiles) {
      if (!existingPaths.has(file.path)) {
        this.sourceManager.addSource({
          type: "file" as const,
          path: file.path,
          addedAt: Date.now(),
        });
      }
    }

    // 移除 sourceManager 中有但 vault 中已不存在的文件
    for (const source of existingSources) {
      if (!currentPaths.has(source.path)) {
        this.sourceManager.removeSource(source.path);
      }
    }
  }

  /**
   * 向对话记录追加 diff 反馈消息，让 AI 在后续对话中知道修改建议的结果
   */
  private addDiffFeedback(filePath: string, outcome: "applied" | "rejected"): void {
    if (!this.currentConversation) return;
    const tag = outcome === "applied"
      ? `<span style="color:#4caf50;font-weight:600">[Applied: ${filePath}]</span>`
      : `<span style="color:#e53935;font-weight:600">[Rejected: ${filePath}]</span>`;
    const feedbackMsg: ChatMessage = { role: "user", content: tag };
    void this.storage.addMessage(this.currentConversation.id, feedbackMsg);
    this.currentConversation.messages.push(feedbackMsg);
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
      if (message.editStates && message.editStates.length > 0) {
        // 有 edit 块的消息：分段渲染 markdown + diff 组件
        await this.renderMessageWithEditBlocks(message, contentEl);
      } else {
        await MarkdownRenderer.render(this.app, message.content, contentEl, "", this);
        this.addNoteLinkHandlers(contentEl);
      }
    } else {
      // 用户消息：含 HTML 标签时用 innerHtml 渲染（如 diff 反馈），否则用纯文本
      if (/<[a-z][\s\S]*>/i.test(message.content)) {
        contentEl.innerHTML = message.content;
      } else {
        contentEl.textContent = message.content;
      }
    }

    // 操作按钮和 token 信息（在气泡外面下方）
    const actionsEl = wrapper.createDiv("message-actions");

    if (message.role === "assistant" && message.usage) {
      // token 信息 + 技能标签
      const tokenEl = actionsEl.createSpan("token-usage");
      let tokenText = `${i18n("tokens.prompt")}: ${this.formatTokenCount(message.usage.promptTokens)}  ${i18n("tokens.completion")}: ${this.formatTokenCount(message.usage.completionTokens)}`;
      if (message.skillName) {
        tokenText += `  ${i18n("view.skillLabel")}: ${message.skillName}`;
      }
      tokenEl.textContent = tokenText;
      // 操作按钮
      const actionsRight = actionsEl.createDiv("message-actions-right");
      this.addActionBtn(actionsRight, i18n("view.copy"), message.content);
    } else {
      // 无 token 数据时，按钮水平排列
      const actionsRight = actionsEl.createDiv("message-actions-right");
      this.addActionBtn(actionsRight, i18n("view.copy"), message.content);
      if (message.role === "user") {
        this.addActionBtn(actionsRight, i18n("view.fill"), message.content, true);
      }
    }

    this.messageArea.scrollTop = this.messageArea.scrollHeight;
  }

  /**
   * 渲染包含 edit 块的消息（用于流式完成后的首次渲染和历史记录加载）
   * 将 edit 块替换为 Diff 组件，其余部分照常 Markdown 渲染
   */
  private async renderMessageWithEditBlocks(
    message: ChatMessage,
    contentEl: HTMLElement,
  ): Promise<void> {
    const editBlocks = parseEditBlocks(message.content);
    const editStates = message.editStates || [];
    const editRegex = /%%\s*DIFF_START\s+\{.*?\}\s*%%\s*\n[\s\S]*?\n\s*%%\s*DIFF_END\s*%%/;


    let remaining = message.content;
    let editIdx = 0;

    for (const block of editBlocks) {
      const match = remaining.match(editRegex);
      if (!match) break;

      // 渲染 edit 块前的文字
      const before = remaining.substring(0, match.index);
      if (before.trim()) {
        await MarkdownRenderer.render(this.app, before, contentEl, "", this);
        this.addNoteLinkHandlers(contentEl);
      }

      // 获取对应的 editState
      const editState = editStates[editIdx];
      const state = editState?.state ?? "rejected";
      const newContent = editState?.newContent ?? "";
      const filePath = editState?.path ?? block.path;
      const originalContent = editState?.originalContent ?? "";

      // 用保存的原始内容和新内容计算 diff
      const ops = parseEditOperations(block.body);
      const { groups } = buildChangeGroups(ops, originalContent || "");

      renderDiffWidget({
        container: contentEl,
        filePath,
        groups,
        state,
        newContent,
        newLines: newContent.split("\n"),
        app: this.app,
        interactive: state === "pending",
        onStateChange: (newState) => {
          if (editState) {
            editState.state = newState;
            void this.storage.saveConversation(this.currentConversation!);
          }
        },
        onFeedback: (fp, outcome) => this.addDiffFeedback(fp, outcome),
      });

      remaining = remaining.substring((match.index ?? 0) + match[0].length);
      editIdx++;
    }

    // 渲染剩余文字
    if (remaining.trim()) {
      await MarkdownRenderer.render(this.app, remaining, contentEl, "", this);
      this.addNoteLinkHandlers(contentEl);
    }
  }

  private addActionBtn(
    container: HTMLElement,
    label: string,
    content: string,
    fillInput: boolean = false,
  ): void {
    const btn = container.createDiv("msg-action-btn");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (fillInput) {
        this.inputEl.value = content;
        this.inputEl.focus();
      } else {
        void navigator.clipboard.writeText(content).then(() => {
          btn.textContent = i18n("view.copied");
          window.setTimeout(() => {
            btn.textContent = i18n("view.copy");
          }, 1500);
        });
      }
    });
  }

  // ==================== 编辑块管理 ====================

  /**
   * 自动拒绝当前对话中所有 pending 状态的编辑块
   * 在切换对话、开启新对话、发送新消息时调用
   */
  private async autoRejectPendingEdits(): Promise<void> {
    if (!this.currentConversation) return;
    const msgs = this.currentConversation.messages;
    let changed = false;
    for (const msg of msgs) {
      if (msg.role !== "assistant" || !msg.editStates) continue;
      for (const edit of msg.editStates) {
        if (edit.state === "pending") {
          edit.state = "rejected";
          changed = true;
        }
      }
    }
    if (changed) {
      // 更新最后一条消息的存储
      await this.storage.saveConversation(this.currentConversation);
    }
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
      (conv) => {
        void this.loadConversation(conv);
      },
      (deletedId) => {
        // 如果删除的是当前对话，清空视图并切到新对话
        if (this.currentConversation?.id === deletedId) {
          this.currentConversation = null;
          this.messageArea.empty();
          this.hideSourcesBar();
        }
      },
    );
    modal.open();
  }

  private async loadConversation(conversation: Conversation): Promise<void> {
    await this.autoRejectPendingEdits();
    this.currentConversation = conversation;
    this.messageArea.empty();
    // 切换对话时隐藏源笔记
    this.hideSourcesBar();
    for (const msg of conversation.messages) {
      await this.renderMessage(msg);
    }
    // 切换后刷新对话统计和源笔记
    this.updateConversationStats();
    this.updateSourcesBar();
  }

  private async newConversation(): Promise<void> {
    if (this.isGenerating) return;
    await this.autoRejectPendingEdits();
    this.currentConversation = null;
    this.messageArea.empty();
    // 新对话清空源笔记和统计
    this.currentSourcePaths = [];
    this.updateConversationStats();
    this.updateSourcesBar();
  }

  // ==================== 对话统计 & 源笔记显示 ====================

  /**
   * 更新顶部对话统计（累计 token + 消息条数）
   */
  private updateConversationStats(): void {
    this.conversationStatsEl.empty();

    if (!this.currentConversation) return;

    const msgs = this.currentConversation.messages;
    if (msgs.length === 0) return;

    let totalTokens = 0;
    for (const msg of msgs) {
      if (msg.usage) {
        totalTokens += msg.usage.promptTokens + msg.usage.completionTokens;
      }
    }

    const parts: string[] = [];
    parts.push(`${i18n("tokens.conversationTotal")}: ${this.formatTokenCount(totalTokens)}`);
    parts.push(`${msgs.length} ${i18n("tokens.messages")}`);
    this.conversationStatsEl.textContent = parts.join("  ·  ");
  }

  /**
   * 更新源笔记栏
   */
  private updateSourcesBar(): void {
    this.sourcesBarEl.empty();
    this.isSourcesPanelOpen = false;
    this.sourcesPanelEl.removeClass("expanded");
    this.sourcesPanelEl.addClass("collapsed");
    this.sourcesPanelEl.empty();

    const count = this.currentSourcePaths.length;

    if (count === 0) {
      this.sourcesBarEl.addClass("sources-bar-empty");
      return;
    }

    this.sourcesBarEl.removeClass("sources-bar-empty");

    // 左侧文字
    const labelEl = this.sourcesBarEl.createSpan("sources-bar-label");
    labelEl.textContent = i18n("sources.matchCount");

    // 右侧数量
    const countEl = this.sourcesBarEl.createSpan("sources-bar-count");
    countEl.textContent = `${count}`;

    // 渲染展开面板
    this.renderSourcesPanel();
  }

  /**
   * 收起面板（点击外部时调用）
   */
  private collapseSourcesPanel(): void {
    if (!this.isSourcesPanelOpen) return;
    this.isSourcesPanelOpen = false;
    this.sourcesPanelEl.removeClass("expanded");
    this.sourcesPanelEl.addClass("collapsed");
  }

  /**
   * 展开/收起源笔记面板
   */
  private toggleSourcesPanel(): void {
    if (this.currentSourcePaths.length === 0) return;

    this.isSourcesPanelOpen = !this.isSourcesPanelOpen;

    if (this.isSourcesPanelOpen) {
      this.sourcesPanelEl.removeClass("collapsed");
      this.sourcesPanelEl.addClass("expanded");
    } else {
      this.sourcesPanelEl.removeClass("expanded");
      this.sourcesPanelEl.addClass("collapsed");
    }
  }

  /**
   * 渲染源笔记展开面板
   * 显示所有被用于回答的笔记标题，点击跳转
   */
  private renderSourcesPanel(): void {
    this.sourcesPanelEl.empty();

    // 笔记列表（顶部标题由 bar 本身承担，面板内不再重复）
    const listEl = this.sourcesPanelEl.createDiv("sources-panel-list");

    for (const path of this.currentSourcePaths) {
      // 用文件名（不含扩展名）作为显示名称
      const displayName = path.replace(/\.md$/, "").split("/").pop() ?? path;
      const itemEl = listEl.createDiv("sources-panel-item");
      itemEl.textContent = displayName;

      // 点击跳转到笔记
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.app.workspace.openLinkText(path.replace(/\.md$/, ""), "", false);
        // 跳转后收起面板
        this.isSourcesPanelOpen = false;
        this.sourcesPanelEl.removeClass("expanded");
        this.sourcesPanelEl.addClass("collapsed");
      });
    }
  }

  /**
   * 隐藏源笔记条（开始思考/切换对话时调用）
   */
  private hideSourcesBar(): void {
    this.currentSourcePaths = [];
    this.isSourcesPanelOpen = false;
    this.sourcesPanelEl.removeClass("expanded");
    this.sourcesPanelEl.addClass("collapsed");
    this.sourcesBarEl.addClass("sources-bar-empty");
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
  private onDelete: (conversationId: string) => void;

  constructor(
    app: App,
    storage: Storage,
    conversations: Conversation[],
    currentConversationId: string | undefined,
    onSelect: (conversation: Conversation) => void,
    onDelete: (conversationId: string) => void,
  ) {
    super(app);
    this.storage = storage;
    this.conversations = conversations;
    this.currentConversationId = currentConversationId;
    this.onSelect = onSelect;
    this.onDelete = onDelete;
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
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.storage.deleteConversation(conv.id).then(() => {
          convEl.remove();
          new Notice(i18n("view.deleted"));
          this.onDelete(conv.id);
        });
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
