import { App, TFile, EventRef } from 'obsidian';
import { encode } from 'gpt-tokenizer';
import { SourceManager } from '../utils/sourceManager';
import { ChatMessage, ModelConfig, ContextChunk } from '../core/types';

// 预留系统提示词的 token 数
const SYSTEM_PROMPT_TOKENS = 500;

/**
 * 文件内容缓存项
 */
interface ContentCacheEntry {
    content: string;
    chunks: ContextChunk[];
    mtime: number;
}

/**
 * 上下文构建器
 * 根据用户消息和知识源构建 AI 上下文
 * 使用文件变化监听 + 缓存机制优化性能
 */
export class ContextBuilder {
    private app: App;
    private sourceManager: SourceManager;

    // 缓存相关
    private contentCache: Map<string, ContentCacheEntry> = new Map();
    private fileListCache: TFile[] | null = null;
    private eventRefs: EventRef[] = [];

    constructor(app: App, sourceManager: SourceManager) {
        this.app = app;
        this.sourceManager = sourceManager;
        this.setupEventListeners();
    }

    /**
     * 设置文件变化监听
     */
    private setupEventListeners(): void {
        // 监听文件修改
        const modifyRef = this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.invalidateFileCache(file.path);
            }
        });
        this.eventRefs.push(modifyRef);

        // 监听文件创建
        const createRef = this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.fileListCache = null;
            }
        });
        this.eventRefs.push(createRef);

        // 监听文件删除
        const deleteRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.invalidateFileCache(file.path);
                this.fileListCache = null;
            }
        });
        this.eventRefs.push(deleteRef);

        // 监听文件重命名
        const renameRef = this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.invalidateFileCache(oldPath);
                this.fileListCache = null;
            }
        });
        this.eventRefs.push(renameRef);
    }

    /**
     * 清除指定文件的缓存
     */
    private invalidateFileCache(path: string): void {
        this.contentCache.delete(path);
    }

    /**
     * 清除所有缓存
     */
    public clearCache(): void {
        this.contentCache.clear();
        this.fileListCache = null;
    }

    /**
     * 销毁时清理事件监听
     */
    public destroy(): void {
        for (const ref of this.eventRefs) {
            this.app.vault.offref(ref);
        }
        this.eventRefs = [];
        this.clearCache();
    }

    /**
     * 构建完整的上下文消息
     */
    async buildContext(
        userMessage: string,
        model: ModelConfig,
        maxResponseTokens: number,
        customRules: string,
        currentFile?: TFile
    ): Promise<ChatMessage[]> {
        const messages: ChatMessage[] = [];

        // System prompt
        const systemPrompt = this.buildSystemPrompt(customRules);
        messages.push({ role: 'system', content: systemPrompt });

        // 收集知识库上下文
        const knowledgeContext = await this.buildKnowledgeContext(
            userMessage,
            model,
            maxResponseTokens,
            currentFile
        );

        if (knowledgeContext) {
            messages.push({
                role: 'system',
                content: `Here are the relevant notes from the vault (cite them using [[wiki-links]]):\n\n${knowledgeContext}`
            });
        }

        // 添加用户消息
        messages.push({ role: 'user', content: userMessage });

        return messages;
    }

    /**
     * 构建系统提示词
     */
    private buildSystemPrompt(customRules: string): string {
        const basePrompt = `You are a versatile note assistant. You can answer questions based on the provided reference content,
as well as proofread, improve, or discuss any topic.

When the user asks for proofreading/improvement, directly return the corrected content or point out issues.
When the user asks for learning suggestions or structure optimization, give specific recommendations based on the reference content.
If the user's question is unrelated to the reference content, feel free to answer freely.
IMPORTANT: Always respond in the same language as the user's input.`;

        if (customRules) {
            return `${basePrompt}\n\n${customRules}`;
        }
        return basePrompt;
    }

    /**
     * 构建知识库上下文（带缓存）
     */
    public async buildKnowledgeContext(
        userMessage: string,
        model: ModelConfig,
        maxResponseTokens: number,
        currentFile?: TFile
    ): Promise<string | null> {
        const files = await this.sourceManager.getFiles(this.app);

        if (files.length === 0 && !currentFile) {
            return null;
        }

        const allChunks: ContextChunk[] = [];

        // 读取所有源文件并分块（使用缓存）
        for (const file of files) {
            try {
                const cached = await this.getFileContent(file);
                allChunks.push(...cached.chunks);
            } catch (error) {
                console.error(`读取文件失败: ${file.path}`, error);
            }
        }

        // 如果有当前活动文件，单独添加（高优先级）
        if (currentFile) {
            try {
                const cached = await this.getFileContent(currentFile);
                const currentChunks = cached.chunks.map(chunk => ({
                    ...chunk,
                    relevance: 1.0  // 最高优先级
                }));
                allChunks.unshift(...currentChunks);
            } catch (error) {
                console.error(`读取当前文件失败: ${currentFile.path}`, error);
            }
        }

        // 计算相关度并排序
        const scoredChunks = this.scoreChunks(allChunks, userMessage);
        scoredChunks.sort((a, b) => b.relevance - a.relevance);

        // 根据 token 限制截断
        return this.truncateToFit(
            scoredChunks,
            model.contextLength - maxResponseTokens - SYSTEM_PROMPT_TOKENS
        );
    }

    /**
     * 获取文件内容（带缓存）
     */
    private async getFileContent(file: TFile): Promise<ContentCacheEntry> {
        const cached = this.contentCache.get(file.path);

        // 检查缓存是否有效（文件未被修改）
        if (cached && cached.mtime >= file.stat.mtime) {
            return cached;
        }

        // 缓存无效，重新读取文件
        const content = await this.app.vault.read(file);
        const chunks = this.chunkContent(content, file.path);

        const entry: ContentCacheEntry = {
            content,
            chunks,
            mtime: file.stat.mtime
        };

        this.contentCache.set(file.path, entry);
        return entry;
    }

    /**
     * 内容分块
     */
    private chunkContent(content: string, sourcePath: string): ContextChunk[] {
        const paragraphs = content.split(/\n\n+/);
        const chunks: ContextChunk[] = [];

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (trimmed.length > 10) {  // 忽略过短的段落
                chunks.push({
                    content: trimmed,
                    sourcePath,
                    relevance: 0
                });
            }
        }

        return chunks;
    }

    /**
     * 计算块与用户消息的相关度
     */
    private scoreChunks(chunks: ContextChunk[], userMessage: string): ContextChunk[] {
        const queryKeywords = this.extractKeywords(userMessage.toLowerCase());

        return chunks.map(chunk => {
            const chunkKeywords = this.extractKeywords(chunk.content.toLowerCase());

            // 关键词重叠度
            const overlap = queryKeywords.filter(kw => chunkKeywords.includes(kw)).length;
            const keywordScore = overlap / Math.max(queryKeywords.length, 1);

            // 位置惩罚（优先使用开头段落）
            const positionPenalty = 0.1;  // 可调整

            return {
                ...chunk,
                relevance: keywordScore * (1 - positionPenalty)
            };
        });
    }

    /**
     * 提取关键词（简单实现）
     */
    private extractKeywords(text: string): string[] {
        // 移除标点符号，按空格和换行分词
        const words = text
            .replace(/[^\w\s一-龥]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 1);

        return [...new Set(words)];
    }

    /**
     * 截断以适应 token 限制
     */
    private truncateToFit(chunks: ContextChunk[], maxTokens: number): string {
        const result: string[] = [];
        let currentTokens = 0;

        for (const chunk of chunks) {
            const chunkTokens = encode(chunk.content).length;

            if (currentTokens + chunkTokens > maxTokens) {
                break;
            }

            result.push(`> Source: [[${chunk.sourcePath.replace(/\.md$/, '')}]]\n\n${chunk.content}`);
            currentTokens += chunkTokens;
        }

        return result.join('\n\n---\n\n');
    }
}
