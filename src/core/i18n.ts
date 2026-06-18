/**
 * Simple i18n module for VaultBuddy
 */

export type Lang = "zh" | "en";

declare global {
  interface Window {
    moment?: { locale?: () => string };
  }
}

const strings: Record<Lang, Record<string, string>> = {
  zh: {
    // View
    "view.title": "VaultBuddy",
    "view.input.placeholder": "输入消息...",
    "view.send": "发送",
    "view.stop": "终止",
    "view.thinking": "思考中...",
    "view.buildingContext": "正在构建知识库...",
    "view.thinkingLabel": "正在思考...",
    "view.stopped": "— 此对话被终止 —",
    "view.skillLabel": "技能",
    "view.copy": "复制",
    "view.copied": "已复制",
    "view.fill": "填入",
    "view.selectModel": "选择模型",
    "view.history": "历史对话",
    "view.newChat": "新对话",
    "view.noHistory": "暂无历史对话",
    "view.newConversation": "新对话",
    "view.historyTitle": "历史对话",
    "view.msgCount": "条消息",
    "view.deleted": "已删除对话",

    // Token usage
    "tokens.prompt": "输入",
    "tokens.completion": "输出",
    "tokens.total": "共",
    "tokens.conversationTotal": "累计 token",
    "tokens.messages": "条消息",

    // Sources bar
    "sources.relatedNotes": "相关的笔记",
    "sources.matchCount": "被检索的笔记",
    "sources.noMatch": "没有匹配的笔记",

    // Settings
    "settings.tabGeneral": "通用",
    "settings.tabModels": "模型",
    "settings.temperature": "回复温度 (Temperature)",
    "settings.temperatureDesc":
      "控制 AI 回复的创造性和随机性。较低的值（0.1-0.3）更精确，较高的值（0.7-1.0）更有创意。默认 0.7。",
    "settings.general": "通用设置",
    "settings.models": "模型配置",
    "settings.addModel": "+ 添加模型",
    "settings.defaultModel": "默认模型",
    "settings.defaultModelDesc": "打开新对话时默认使用的模型",
    "settings.maxTokens": "最大回复 Token 数",
    "settings.maxTokensDesc": "控制 AI 回答的最大长度，推荐 4096-8192。",
    "settings.customRules": "自定义规则",
    "settings.customRulesDesc": "附加到系统提示词的额外指令。",
    "settings.customRulesPlaceholder": "输入自定义规则...",
    "settings.resumeLast": "启动时恢复上次对话",
    "settings.resumeLastDesc": "打开插件时自动加载上次退出的对话记录，关闭则每次从新对话开始。",
    "settings.noModels": "暂无模型，点击上方按钮添加",
    "settings.modelName": "显示名称",
    "settings.baseUrl": "Base URL（cURL 兼容）",
    "settings.apiKey": "API Key",
    "settings.modelId": "模型 ID",
    "settings.contextWindow": "上下文窗口 Token",
    "settings.edit": "编辑",
    "settings.save": "保存",
    "settings.delete": "删除",
    "settings.test": "测试",
    "settings.testing": "测试中...",
    "settings.cancel": "取消",
    "settings.newModel": "新模型（未保存）",
    "settings.fillAll": "请填写所有字段后保存",
    "settings.complete": "配置完整，可以保存",
    "settings.incomplete": "⚠️ 请填写所有字段",
    "settings.saveModel": "保存模型",
    "settings.confirmDelete": "确认删除",
    "settings.deleteMsg": "确定要删除模型",
    "settings.irreversible": "此操作不可恢复。",
    "settings.confirmDeleteBtn": "确认删除",
    "settings.testSuccess": "✅ 连接成功",
    "settings.testFail": "❌ 连接失败，请检查配置",
    "settings.fillAllFields": "⚠️ 请填写所有字段后再保存",
    "settings.modelAdded": "✅ 模型已添加",
    "settings.unnamed": "未命名模型",
    "settings.addTime": "添加于",
    "settings.modelNamePlaceholder": "ChatGPT",
    "settings.baseUrlPlaceholder": "https://api.openai.com/v1/chat/completions",
    "settings.apiKeyPlaceholder": "sk-...",
    "settings.modelIdPlaceholder": "gpt-4o",
    "settings.contextWindowPlaceholder": "默认 128000（推荐 65536-128000）",
    "settings.maxTokensPlaceholder": "4096",

    // Skills
    "settings.tabSkills": "技能",
    "settings.skills": "技能配置",
    "settings.addSkill": "+ 添加技能",
    "settings.addSkillDesc": "添加可被 AI 按需激活的指令技能",
    "settings.noSkills": "暂无技能，点击上方按钮添加",
    "settings.unnamedSkill": "未命名技能",
    "settings.skillName": "技能名称",
    "settings.skillNamePlaceholder": "例如：文章总结",
    "settings.skillDescription": "技能描述",
    "settings.skillDescriptionPlaceholder": "简要描述该技能的用途，用于 AI 识别匹配",
    "settings.skillInstruction": "具体指令",
    "settings.skillInstructionPlaceholder": "告诉 AI 应该怎么做...",
    "settings.skillAddTitle": "添加技能",
    "settings.skillEditTitle": "编辑技能",
    "settings.skillAdded": "✅ 技能已添加",
    "settings.skillUpdated": "✅ 技能已更新",
    "settings.skillDeleteMsg": "确定要删除技能",

    // Notices
    "notice.noModel": "请先在设置中配置模型",
    "notice.noApiKey": "请先在设置中配置 API Key",
    "notice.apiFail": "AI 调用失败:",
    "notice.connectionTestNeedsConfig": "请先填写完整的模型信息再测试",

    // Diff
    "diff.accept": "应用",
    "diff.reject": "拒绝",
    "diff.accepted": "已应用",
    "diff.rejected": "已拒绝",
    "diff.autoRejected": "已拒绝（自动）",
    "diff.applySuccess": "✅ 笔记已更新",
    "diff.fileNotFound": "⚠️ 文件已不存在，无法应用",
    "diff.noChanges": "无变更",
  },

  en: {
    // View
    "view.title": "VaultBuddy",
    "view.input.placeholder": "Type a message...",
    "view.send": "Send",
    "view.stop": "Stop",
    "view.thinking": "Thinking...",
    "view.buildingContext": "Building knowledge base...",
    "view.thinkingLabel": "Thinking...",
    "view.stopped": "— This conversation was terminated —",
    "view.skillLabel": "Skill",
    "view.copy": "Copy",
    "view.copied": "Copied",
    "view.fill": "Quote",
    "view.selectModel": "Select Model",
    "view.history": "History",
    "view.newChat": "New Chat",
    "view.noHistory": "No conversation history",
    "view.newConversation": "New Chat",
    "view.historyTitle": "History",
    "view.msgCount": "messages",
    "view.deleted": "Conversation deleted",

    // Token usage
    "tokens.prompt": "Input",
    "tokens.completion": "Output",
    "tokens.total": "Total",
    "tokens.conversationTotal": "Total tokens",
    "tokens.messages": "messages",

    // Sources bar
    "sources.relatedNotes": "Related Notes",
    "sources.matchCount": "Searched Notes",
    "sources.noMatch": "No matched notes",

    // Settings
    "settings.tabGeneral": "General",
    "settings.tabModels": "Models",
    "settings.temperature": "Temperature",
    "settings.temperatureDesc":
      "Controls AI response creativity and randomness. Lower values (0.1-0.3) are more precise, higher values (0.7-1.0) are more creative. Default 0.7.",
    "settings.general": "General",
    "settings.models": "Model Configuration",
    "settings.addModel": "+ Add Model",
    "settings.defaultModel": "Default Model",
    "settings.defaultModelDesc": "Model used when starting a new conversation.",
    "settings.maxTokens": "Max Response Tokens",
    "settings.maxTokensDesc": "Maximum length of AI responses. Recommended 4096-8192.",
    "settings.customRules": "Custom Rules",
    "settings.customRulesDesc": "Additional instructions appended to the system prompt.",
    "settings.customRulesPlaceholder": "Enter custom rules...",
    "settings.resumeLast": "Resume last conversation on startup",
    "settings.resumeLastDesc":
      "Automatically load the previous conversation when opening the plugin.",
    "settings.noModels": "No models configured. Click the button above to add one.",
    "settings.modelName": "Display Name",
    "settings.baseUrl": "Base URL (cURL compatible)",
    "settings.apiKey": "API Key",
    "settings.modelId": "Model ID",
    "settings.contextWindow": "Context Window (Tokens)",
    "settings.edit": "Edit",
    "settings.save": "Save",
    "settings.delete": "Delete",
    "settings.test": "Test",
    "settings.testing": "Testing...",
    "settings.cancel": "Cancel",
    "settings.newModel": "New Model (unsaved)",
    "settings.fillAll": "Fill all fields to save",
    "settings.complete": "Ready to save",
    "settings.incomplete": "⚠️ Please fill all fields",
    "settings.saveModel": "Save Model",
    "settings.confirmDelete": "Confirm Delete",
    "settings.deleteMsg": "Are you sure you want to delete",
    "settings.irreversible": "This action cannot be undone.",
    "settings.confirmDeleteBtn": "Delete",
    "settings.testSuccess": "✅ Connection successful",
    "settings.testFail": "❌ Connection failed. Check your config.",
    "settings.fillAllFields": "⚠️ Please fill all fields before saving",
    "settings.modelAdded": "✅ Model added",
    "settings.unnamed": "Unnamed Model",
    "settings.addTime": "Added on",
    "settings.modelNamePlaceholder": "ChatGPT",
    "settings.baseUrlPlaceholder": "https://api.openai.com/v1/chat/completions",
    "settings.apiKeyPlaceholder": "sk-...",
    "settings.modelIdPlaceholder": "gpt-4o",
    "settings.contextWindowPlaceholder": "Default 128000 (recommended 65536-128000)",
    "settings.maxTokensPlaceholder": "4096",

    // Skills
    "settings.tabSkills": "Skills",
    "settings.skills": "Skills",
    "settings.addSkill": "+ Add Skill",
    "settings.addSkillDesc": "Add instruction skills that AI can activate on demand",
    "settings.noSkills": "No skills yet. Click the button above to add one.",
    "settings.unnamedSkill": "Unnamed Skill",
    "settings.skillName": "Name",
    "settings.skillNamePlaceholder": "e.g. Article Summarization",
    "settings.skillDescription": "Description",
    "settings.skillDescriptionPlaceholder":
      "Briefly describe what this skill does (AI uses this for matching)",
    "settings.skillInstruction": "Instruction",
    "settings.skillInstructionPlaceholder": "Tell the AI what to do...",
    "settings.skillAddTitle": "Add Skill",
    "settings.skillEditTitle": "Edit Skill",
    "settings.skillAdded": "✅ Skill added",
    "settings.skillUpdated": "✅ Skill updated",
    "settings.skillDeleteMsg": "Are you sure you want to delete skill",

    // Notices
    "notice.noModel": "Please configure a model in settings first",
    "notice.noApiKey": "Please configure API Key in settings first",
    "notice.apiFail": "AI call failed:",
    "notice.connectionTestNeedsConfig": "Please fill all model fields before testing",

    // Diff
    "diff.accept": "Accept",
    "diff.reject": "Reject",
    "diff.accepted": "Applied",
    "diff.rejected": "Rejected",
    "diff.autoRejected": "Rejected (auto)",
    "diff.applySuccess": "✅ Note updated",
    "diff.fileNotFound": "⚠️ File no longer exists, cannot apply",
    "diff.noChanges": "No changes",
  },
};

let currentLang: Lang = "zh";

export function i18n(key: string): string {
  return strings[currentLang][key] || strings["en"][key] || key;
}

export function setLanguage(lang: Lang): void {
  currentLang = lang;
}

/**
 * Detect Obsidian's interface language
 */
export function detectLanguage(): Lang {
  try {
    // Obsidian stores language in localStorage or we can detect from moment
    const locale = window.moment?.locale?.() || navigator.language || "zh";
    if (locale.startsWith("zh")) return "zh";
    return "en";
  } catch {
    return "zh";
  }
}
