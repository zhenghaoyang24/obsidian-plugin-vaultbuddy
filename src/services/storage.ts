import { Plugin } from 'obsidian';
import { Conversation, ChatMessage } from '../core/types';

/**
 * 存储模块
 */
export class Storage {
    private plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * 获取所有对话
     */
    async getConversations(): Promise<Conversation[]> {
        const data = await this.plugin.loadData();
        return Array.isArray(data?.conversations) ? data.conversations : [];
    }

    /**
     * 保存整个对话列表
     */
    private async saveConversations(conversations: Conversation[]): Promise<void> {
        // 读取现有数据，只更新 conversations 部分
        const data = await this.plugin.loadData() || {};
        data.conversations = conversations;
        await this.plugin.saveData(data);
    }

    /**
     * 创建新对话
     */
    async createConversation(): Promise<Conversation> {
        const conversations = await this.getConversations();

        const conversation: Conversation = {
            id: Date.now().toString(),
            title: '',
            messages: [],
            sources: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        conversations.push(conversation);
        await this.saveConversations(conversations);

        return conversation;
    }

    /**
     * 添加消息到对话
     */
    async addMessage(conversationId: string, message: ChatMessage): Promise<void> {
        const conversations = await this.getConversations();
        const conv = conversations.find(c => c.id === conversationId);

        if (!conv) {
            console.error('Storage: 未找到对话', conversationId);
            return;
        }

        conv.messages.push(message);
        conv.updatedAt = Date.now();

        // 第一条用户消息作为标题
        if (message.role === 'user' && !conv.title) {
            conv.title = message.content.substring(0, 30) +
                (message.content.length > 30 ? '...' : '');
        }

        await this.saveConversations(conversations);
    }

    /**
     * 更新对话标题
     */
    async updateTitle(id: string, title: string): Promise<void> {
        const conversations = await this.getConversations();
        const conv = conversations.find(c => c.id === id);
        if (conv) {
            conv.title = title;
            conv.updatedAt = Date.now();
            await this.saveConversations(conversations);
        }
    }

    /**
     * 删除对话
     */
    async deleteConversation(id: string): Promise<void> {
        const conversations = await this.getConversations();
        const filtered = conversations.filter(c => c.id !== id);
        await this.saveConversations(filtered);
    }

    /**
     * 保存单个对话（覆盖模式）
     */
    async saveConversation(conversation: Conversation): Promise<void> {
        const conversations = await this.getConversations();
        const index = conversations.findIndex(c => c.id === conversation.id);
        if (index >= 0) {
            conversations[index] = conversation;
        } else {
            conversations.push(conversation);
        }
        await this.saveConversations(conversations);
    }

    /**
     * 清空所有对话
     */
    async clearAllConversations(): Promise<void> {
        await this.saveConversations([]);
    }
}
