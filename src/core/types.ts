/**
 * 知识源类型定义
 */
export interface KnowledgeSource {
  type: "file" | "folder";
  path: string;
  addedAt: number;
}

/**
 * 模型配置
 */
export interface ModelConfig {
  id: string; // 唯一标识
  name: string; // 显示名称
  baseUrl: string; // API 端点
  apiKey?: string; // API 密钥 (可选，实际存储在 SecretStorage)
  modelId: string; // 模型名，如 deepseek-chat
  contextLength: number; // 上下文窗口大小
}

/**
 * Skill 定义
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

/**
 * 插件设置
 */
export interface AIChatSettings {
  models: ModelConfig[];
  defaultModelId: string;
  maxResponseTokens: number;
  customRules: string;
  resumeLastConversation: boolean;
  temperature: number;
  encryptedApiKeys?: Record<string, string>; // 加密存储的 API Keys
  skills: Skill[];
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: AIChatSettings = {
  models: [],
  defaultModelId: "",
  maxResponseTokens: 4096,
  customRules: "",
  resumeLastConversation: true,
  temperature: 0.7,
  skills: [],
};

/**
 * 编辑块状态
 */
export interface EditBlockState {
  path: string; // 文件路径
  newContent: string; // AI 提议的完整新内容
  originalContent: string; // 编辑时的原始文件内容
  state: "pending" | "accepted" | "rejected";
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** 激活的 Skill 名称（如果有） */
  skillName?: string;
  /** token 使用量（仅 assistant 消息携带） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /** 编辑块状态列表 */
  editStates?: EditBlockState[];
}

/**
 * AI 响应
 */
export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 对话记录
 */
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  sources: KnowledgeSource[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 上下文块
 */
export interface ContextChunk {
  content: string;
  sourcePath: string;
  relevance: number;
}
