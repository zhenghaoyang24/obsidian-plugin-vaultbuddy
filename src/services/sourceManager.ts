import { App, TFile, TFolder } from 'obsidian';
import { KnowledgeSource } from '../core/types';

/**
 * 知识源管理器
 * 管理用户选定的文件/文件夹，提供文件读取接口
 */
export class SourceManager {
    private sources: KnowledgeSource[] = [];

    /**
     * 添加知识源
     */
    addSource(source: KnowledgeSource): void {
        // 避免重复添加
        if (!this.sources.find(s => s.path === source.path)) {
            this.sources.push({
                ...source,
                addedAt: Date.now()
            });
        }
    }

    /**
     * 移除知识源
     */
    removeSource(path: string): void {
        this.sources = this.sources.filter(s => s.path !== path);
    }

    /**
     * 清空所有知识源
     */
    clearSources(): void {
        this.sources = [];
    }

    /**
     * 获取当前源列表
     */
    getSources(): KnowledgeSource[] {
        return [...this.sources];
    }

    /**
     * 获取所有源文件
     * @param app Obsidian App 实例
     * @param maxSize 文件最大大小（字节），默认 10MB
     */
    async getFiles(app: App, maxSize: number = 10 * 1024 * 1024): Promise<TFile[]> {
        const files: TFile[] = [];

        for (const source of this.sources) {
            const abstractFile = app.vault.getAbstractFileByPath(source.path);

            if (source.type === 'file' && abstractFile instanceof TFile) {
                if (abstractFile.stat.size <= maxSize) {
                    files.push(abstractFile);
                }
            } else if (source.type === 'folder' && abstractFile instanceof TFolder) {
                // 递归获取文件夹内所有 .md 文件
                const folderFiles = this.getMarkdownFilesInFolder(abstractFile, maxSize);
                files.push(...folderFiles);
            }
        }

        // 去重
        return [...new Set(files)];
    }

    /**
     * 递归获取文件夹内的 Markdown 文件
     */
    private getMarkdownFilesInFolder(folder: TFolder, maxSize: number): TFile[] {
        const files: TFile[] = [];

        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                if (child.stat.size <= maxSize) {
                    files.push(child);
                }
            } else if (child instanceof TFolder) {
                files.push(...this.getMarkdownFilesInFolder(child, maxSize));
            }
        }

        return files;
    }

    /**
     * 检查是否包含指定路径
     */
    hasSource(path: string): boolean {
        return this.sources.some(s => s.path === path);
    }

    /**
     * 获取源数量
     */
    getSourceCount(): number {
        return this.sources.length;
    }
}
