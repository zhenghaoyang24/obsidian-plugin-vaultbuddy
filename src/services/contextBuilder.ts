import { App, TFile, EventRef } from "obsidian";
import { encode } from "gpt-tokenizer";
import { SourceManager } from "./sourceManager";
import { ModelConfig, ContextChunk } from "../core/types";

// 预留系统提示词的 token 数
const SYSTEM_PROMPT_TOKENS = 500;

/**
 * 语言类型
 */
type TextLang = "zh" | "en";

// =========================================================================
// Intl.Segmenter 类型声明（Obsidian 基于 Electron/Chrome，运行时可用）
// 移除条件：当 tsconfig lib 升级到 ES2022.Intl 时
// =========================================================================
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Augment global Intl namespace: Segmenter types exist at runtime in Electron/Chrome but not in TS lib
  namespace Intl {
    interface SegmenterOptions {
      granularity: "grapheme" | "word" | "sentence";
    }
    interface SegmenterSegment {
      segment: string;
      isWordLike: boolean;
      index: number;
      input: string;
    }
    class Segmenter {
      constructor(locale: string, options?: Partial<SegmenterOptions>);
      segment(input: string): Iterable<SegmenterSegment>;
    }
  }
}

// =========================================================================
// 双语同义词映射
// 用于查询扩展，提高中文/英文近义词匹配能力
// =========================================================================
type SynonymGroup = string[][];

const SYNONYM_MAP: Record<TextLang, SynonymGroup> = {
  zh: [
    ["设置", "配置", "设定", "选项", "参数"],
    ["删除", "移除", "去掉", "清除", "卸载"],
    ["添加", "增加", "新增", "加入", "创建", "新建"],
    ["修改", "编辑", "更改", "变更", "更新", "改动", "调整"],
    ["查询", "查找", "搜索", "寻找", "查看", "浏览", "检索"],
    ["模型", "ai", "人工智能", "大模型", "llm"],
    ["插件", "扩展", "addon", "模块"],
    ["笔记", "文档", "文件", "文章", "页面"],
    ["导出", "输出", "备份", "保存"],
    ["导入", "输入", "加载", "载入", "读取"],
    ["帮助", "说明", "指南", "教程", "文档", "手册"],
    ["错误", "报错", "异常", "失败", "问题", "bug"],
    ["快捷键", "快捷方式", "热键", "shortcut"],
    ["界面", "ui", "用户界面", "面板"],
    ["同步", "同步", "sync"],
    ["模板", "模版", "template", "样板"],
    ["标签", "标籤", "tag", "分类"],
    ["链接", "链接", "link", "超链接"],
  ],
  en: [
    ["setting", "configuration", "preference", "option", "config"],
    ["delete", "remove", "erase", "clear", "drop", "uninstall"],
    ["add", "create", "insert", "new", "append", "build"],
    ["edit", "modify", "change", "update", "alter", "adjust"],
    ["search", "find", "lookup", "query", "seek", "retrieve"],
    ["model", "ai", "llm", "gpt", "neural"],
    ["plugin", "extension", "addon", "module", "plug-in"],
    ["note", "document", "file", "page", "article"],
    ["export", "output", "backup", "save", "dump"],
    ["import", "input", "load", "restore", "read"],
    ["help", "guide", "tutorial", "documentation", "manual"],
    ["error", "exception", "failure", "issue", "problem", "bug"],
    ["shortcut", "hotkey", "keyboard", "key"],
    ["ui", "interface", "panel", "dashboard"],
    ["sync", "synchronize", "sync"],
    ["template", "pattern", "boilerplate", "layout"],
    ["tag", "label", "category", "classification"],
    ["link", "hyperlink", "reference", "url"],
  ],
};

// =========================================================================
// 停用词过滤
// =========================================================================
type StopWordsList = string[];

const STOP_WORDS: Record<TextLang, StopWordsList> = {
  zh: [
    "的",
    "了",
    "在",
    "是",
    "我",
    "有",
    "和",
    "就",
    "不",
    "人",
    "都",
    "一",
    "个",
    "上",
    "也",
    "很",
    "到",
    "说",
    "要",
    "去",
    "你",
    "会",
    "着",
    "没有",
    "看",
    "好",
    "自己",
    "这",
    "他",
    "她",
    "它",
    "们",
    "那",
    "里",
    "为",
    "什么",
    "怎么",
    "如何",
    "吗",
    "啊",
    "呢",
    "吧",
    "呀",
    "哦",
    "嗯",
    "嘛",
    "喔",
    "可以",
    "能",
    "能够",
    "应该",
    "可能",
    "需要",
    "必须",
    "这个",
    "那个",
    "这些",
    "那些",
    "因为",
    "所以",
    "但是",
    "如果",
    "虽然",
    "然而",
    "而且",
    "或者",
    "还是",
    "只是",
    "不过",
    "已经",
    "正在",
    "将要",
    "之前",
    "之后",
    "现在",
    "目前",
    "用",
    "把",
    "被",
    "让",
    "给",
    "对",
    "从",
    "向",
    "跟",
  ],
  en: [
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "you",
    "your",
    "i",
    "we",
    "they",
    "he",
    "she",
    "do",
    "does",
    "did",
    "doing",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "have",
    "has",
    "had",
    "having",
    "not",
    "no",
    "nor",
    "but",
    "and",
    "or",
    "if",
    "so",
    "as",
    "than",
    "then",
    "just",
    "about",
    "how",
    "what",
    "why",
    "when",
    "where",
    "who",
    "whom",
    "which",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "only",
    "own",
    "same",
    "very",
    "too",
    "can",
    "get",
    "got",
    "gotten",
    "make",
    "made",
    "much",
    "also",
    "well",
    "even",
    "still",
    "already",
    "now",
    "here",
    "there",
    "up",
    "down",
    "out",
    "into",
    "over",
    "again",
    "further",
    "once",
    "then",
    "than",
    "because",
    "since",
    "until",
    "while",
    "though",
    "although",
    "yet",
    "after",
    "before",
    "between",
    "under",
    "above",
    "below",
    "off",
    "during",
    "without",
    "across",
    "through",
    "via",
    "am",
    "upon",
    "ago",
    "done",
  ],
};

/**
 * 文件内容缓存项
 */
interface ContentCacheEntry {
  content: string;
  chunks: ContextChunk[];
  mtime: number;
}

/**
 * 轻量文件索引
 * 用于第一阶段检索，无需读取文件完整内容
 */
interface FileIndex {
  file: TFile;
  /** 文件名（不含扩展名） */
  basename: string;
  /** 标题：优先使用 frontmatter title，回退到 basename */
  title: string;
  /** frontmatter aliases */
  aliases: string[];
  /** 文件中所有 Markdown 标题文本 */
  headings: string[];
  /** 文件中所有标签（不含 # 前缀） */
  tags: string[];
  /** 文件系统创建时间（毫秒时间戳，永远有值） */
  ctime: number;
  /** 文件系统修改时间（毫秒时间戳，永远有值） */
  mtime: number;
  /**
   * 从 frontmatter 中解析的日期（毫秒时间戳）
   * 按优先级尝试 createTime / created / createdAt / date 等字段
   * null 表示 frontmatter 中没有可识别的日期字段
   */
  frontmatterDate: number | null;
}

/**
 * 知识库上下文构建结果
 */
export interface KnowledgeContextResult {
  /** 格式化的上下文文本（直接注入给 AI） */
  context: string | null;
  /** 被实际纳入上下文的源文件路径列表（去重） */
  sourcePaths: string[];
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
    const modifyRef = this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.invalidateFileCache(file.path);
      }
    });
    this.eventRefs.push(modifyRef);

    // 监听文件创建
    const createRef = this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.fileListCache = null;
      }
    });
    this.eventRefs.push(createRef);

    // 监听文件删除
    const deleteRef = this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && file.extension === "md") {
        this.invalidateFileCache(file.path);
        this.fileListCache = null;
      }
    });
    this.eventRefs.push(deleteRef);

    // 监听文件重命名
    const renameRef = this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
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
   * 构建知识库上下文（两阶段检索）
   *
   * 阶段1（轻量索引）：
   *   对 vault 中所有文件构建 FileIndex（仅 metadataCache，不读内容）
   *   用关键词+同义词对所有文件索引排序，取 top N
   *
   * 阶段2（详细读取）：
   *   对当前文件：完整内容优先占位
   *   对其他 top N 文件：分块→打分→填充剩余 token
   */
  public async buildKnowledgeContext(
    userMessage: string,
    model: ModelConfig,
    maxResponseTokens: number,
    currentFile?: TFile,
  ): Promise<KnowledgeContextResult> {
    const allFiles = await this.sourceManager.getFiles(this.app);

    // 总可用 token 数 = 模型上下文窗口 - 回复 token - 系统提示词
    const totalAvailableTokens = model.contextLength - maxResponseTokens - SYSTEM_PROMPT_TOKENS;

    if (totalAvailableTokens <= 0) {
      return { context: null, sourcePaths: [] };
    }

    // ── 阶段1: 轻量索引 → 全 vault 文件检索排名 ──

    // 给其他笔记的最低保障比例
    const MIN_OTHER_FILES_RATIO = 0.25;
    const maxOtherTokens = Math.floor(totalAvailableTokens * MIN_OTHER_FILES_RATIO);
    // 估算每份文件平均 token 数用于决定 topN
    const ESTIMATE_TOKENS_PER_FILE = 500;
    const topN = Math.max(50, Math.min(200, Math.floor(maxOtherTokens / ESTIMATE_TOKENS_PER_FILE)));

    // 为用户查询构建轻量索引
    const fileIndices: FileIndex[] = [];
    const seenPaths = new Set<string>();

    for (const file of allFiles) {
      if (seenPaths.has(file.path)) continue;
      seenPaths.add(file.path);
      fileIndices.push(this.buildFileIndex(file));
    }

    // 根据用户查询对文件索引排序（关键词 + 时间融合）
    const lang = this.detectTextLanguage(userMessage);
    const timeRange = this.hasTimeIntent(userMessage) ? this.parseTimeRange(userMessage) : null;

    const rankedFiles = this.rankFilesByQuery(fileIndices, userMessage);

    let candidateFiles: TFile[];

    if (timeRange) {
      // ⏰ 时间 + 关键词融合排序
      // 对已有关键词排名结果，引入时间维度重新排序
      const queryKeywords = this.extractKeywordsWithSynonyms(userMessage, lang);

      const scoredWithTime = fileIndices.map((fi) => {
        const keywordScore =
          rankedFiles.indexOf(fi.file) >= 0
            ? 1 - rankedFiles.indexOf(fi.file) / Math.max(rankedFiles.length, 1)
            : 0;

        const fileDate = this.getFileEffectiveDate(fi);
        const timeScore = this.computeTimeScore(fileDate, timeRange);

        // 混合评分：无关键词时全依时间，有关键词时各占一半
        const hasKeywords = queryKeywords.length > 0;
        const combinedScore = hasKeywords ? keywordScore * 0.5 + timeScore * 0.5 : timeScore;

        return { file: fi.file, score: combinedScore };
      });

      scoredWithTime.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.file.basename.localeCompare(b.file.basename);
      });

      candidateFiles = scoredWithTime.map((s) => s.file).slice(0, topN);
    } else {
      // 🔤 纯关键词排序（现有逻辑）
      candidateFiles = rankedFiles.slice(0, topN);
    }

    // ── 阶段2: 详细读取 ──

    let currentFileContent = "";
    if (currentFile) {
      try {
        currentFileContent = await this.app.vault.read(currentFile);
      } catch (error) {
        console.error(`读取当前文件失败: ${currentFile.path}`, error);
      }
    }

    const resultParts: string[] = [];
    const sourcePathSet = new Set<string>();

    // 如果查询包含时间意图，在上下文中嵌入解析后的时间范围
    if (timeRange) {
      const fmtDate = (ts: number): string => {
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      resultParts.push(
        `## ⏰ Time Context\n> Query time range: ${fmtDate(timeRange.start)} ~ ${fmtDate(timeRange.end)}\n`,
      );
    }

    let remainingTokens = totalAvailableTokens;

    // 当前文件完整内容（优先占位）
    if (currentFile && currentFileContent) {
      const currentTokens = encode(currentFileContent).length;

      if (currentTokens <= remainingTokens) {
        const formattedPath = currentFile.path.replace(/\.md$/, "");
        resultParts.push(
          `## 📄 Current Note (Full Content)\n> Source: [[${formattedPath}]]\n\n${currentFileContent}`,
        );
        sourcePathSet.add(currentFile.path);
        remainingTokens -= currentTokens;
      } else {
        const ratio = Math.min(remainingTokens / currentTokens, 1);
        const truncateLen = Math.floor(currentFileContent.length * ratio * 0.9);
        const truncated =
          currentFileContent.substring(0, truncateLen) +
          `\n\n> *[Note truncated — the full note is ${Math.round(currentTokens)} tokens, only the first portion could be included]*`;

        const formattedPath = currentFile.path.replace(/\.md$/, "");
        resultParts.push(
          `## 📄 Current Note (Truncated)\n> Source: [[${formattedPath}]]\n\n${truncated}`,
        );
        remainingTokens = 0;
      }
    }

    // 处理候选文件（排除当前文件）
    const otherFiles = currentFile
      ? candidateFiles.filter((f) => f.path !== currentFile.path)
      : candidateFiles;

    if (otherFiles.length > 0 && remainingTokens > 0) {
      const allChunks: ContextChunk[] = [];

      for (const file of otherFiles) {
        try {
          const cached = await this.getFileContent(file);
          allChunks.push(...cached.chunks);
        } catch (error) {
          console.error(`读取文件失败: ${file.path}`, error);
        }
      }

      // 计算相关度并排序
      const scoredChunks = this.scoreChunks(allChunks, userMessage);
      scoredChunks.sort((a, b) => b.relevance - a.relevance);

      // 用剩余空间填充相关段落
      const relatedParts: string[] = [];

      for (const chunk of scoredChunks) {
        if (chunk.relevance <= 0 && relatedParts.length > 0) {
          continue;
        }

        const chunkText = `> Source: [[${chunk.sourcePath.replace(/\.md$/, "")}]]\n\n${chunk.content}`;
        const chunkTokens = encode(chunkText).length;

        if (chunkTokens > remainingTokens) {
          break;
        }

        relatedParts.push(chunkText);
        sourcePathSet.add(chunk.sourcePath);
        remainingTokens -= chunkTokens;
      }

      if (relatedParts.length > 0) {
        resultParts.push(`## 📚 Related Notes\n${relatedParts.join("\n\n---\n\n")}`);
      }
    }

    if (resultParts.length === 0) {
      return { context: null, sourcePaths: [] };
    }

    return {
      context: resultParts.join("\n\n"),
      sourcePaths: [...sourcePathSet],
    };
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
      mtime: file.stat.mtime,
    };

    this.contentCache.set(file.path, entry);
    return entry;
  }

  // ==================== 语言检测 ====================

  /**
   * 检测文本语言
   */
  private detectTextLanguage(text: string): TextLang {
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    return chineseCount > 0 ? "zh" : "en";
  }

  // ==================== 轻量文件索引（第一阶段检索） ====================

  /**
   * 为单个文件构建轻量索引
   * 利用 Obsidian 的 metadataCache，无需读取文件完整内容
   */
  private buildFileIndex(file: TFile): FileIndex {
    const cache = this.app.metadataCache.getFileCache(file);

    // 标题：优先 frontmatter title，回退到 basename
    let title = file.basename;
    const fmTitle = cache?.frontmatter?.title;
    if (typeof fmTitle === "string" && fmTitle.trim().length > 0) {
      title = fmTitle.trim();
    }

    // 别名：frontmatter aliases 可以是字符串或字符串数组
    const aliases: string[] = [];
    const fmAliases = cache?.frontmatter?.aliases;
    if (Array.isArray(fmAliases)) {
      for (const alias of fmAliases) {
        if (typeof alias === "string" && alias.trim().length > 0) {
          aliases.push(alias.trim());
        }
      }
    } else if (typeof fmAliases === "string" && fmAliases.trim().length > 0) {
      aliases.push(fmAliases.trim());
    }

    // 标题层级列表
    const headings = cache?.headings?.map((h) => h.heading) ?? [];

    // 标签（去掉 # 前缀）
    const tags = cache?.tags?.map((t) => t.tag.replace(/^#/, "")).filter((t) => t.length > 0) ?? [];

    // 从 frontmatter 解析日期
    const frontmatterDate = this.parseFrontmatterDate(cache?.frontmatter);

    return {
      file,
      basename: file.basename,
      title,
      aliases,
      headings,
      tags,
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      frontmatterDate,
    };
  }

  /**
   * 从 frontmatter 中解析日期字段
   * 按优先级尝试常见日期字段名
   */
  private parseFrontmatterDate(frontmatter: Record<string, unknown> | undefined): number | null {
    if (!frontmatter) return null;

    const dateFields = [
      "createTime",
      "created",
      "createdAt",
      "created_at",
      "date",
      "creation_date",
      "created_date",
    ];

    for (const field of dateFields) {
      const value = frontmatter[field];
      if (typeof value !== "string") continue;

      const trimmed = value.trim();
      if (trimmed.length === 0) continue;

      // Date.parse 支持 ISO 8601 ("2024-01-15", "2024-01-15T10:00:00") 等格式
      const timestamp = Date.parse(trimmed);
      if (!isNaN(timestamp)) return timestamp;
    }

    return null;
  }

  /**
   * 根据用户查询对文件索引进行相关度排序（第一阶段检索）
   *
   * 利用轻量索引（标题、别名、标题层级、标签）而非文件完整内容
   * 快速从全 vault 中筛选出最相关的文件，供第二阶段详细读取
   */
  private rankFilesByQuery(fileIndices: FileIndex[], query: string): TFile[] {
    const lang = this.detectTextLanguage(query);
    const queryKeywords = this.extractKeywordsWithSynonyms(query, lang);

    // 没有有效关键词时返回原始顺序
    if (queryKeywords.length === 0) {
      return fileIndices.map((fi) => fi.file);
    }

    // 为每个文件构建轻量文档并打分
    const scored: Array<{ file: TFile; score: number }> = [];

    for (const fi of fileIndices) {
      // 构建轻量文档文本（只用索引字段，不读文件内容）
      const docText = [fi.title, fi.basename, ...fi.aliases, ...fi.headings, ...fi.tags].join(" ");

      const docKeywords = this.extractKeywords(docText, lang);

      // 计算关键词重叠度
      const overlap = queryKeywords.filter((kw) => docKeywords.includes(kw)).length;
      const score = overlap / Math.max(queryKeywords.length, 1);

      scored.push({ file: fi.file, score });
    }

    // 按分数降序排列，分数相同时按文件名升序（保证稳定性）
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.file.basename.localeCompare(b.file.basename);
    });

    return scored.map((s) => s.file);
  }

  // ==================== 时间查询检测与解析 ====================

  /**
   * 检测用户查询是否包含时间意图
   */
  private static TIME_PATTERNS: Record<TextLang, RegExp[]> = {
    zh: [
      /最近\s*(今天|昨天|前天)/,
      /最近\s*\d+\s*(天|日|周|星期|个月|月|年)/,
      /(上|本|这个|上个|这)\s*(周|星期|个月|月|年)/,
      /(昨天|今天|前天|明天)/,
      /\d{4}\s*年/,
      /\d+\s*月(份)?/,
      /(年初|年末|月初|月末|年底|年初)/,
      /近\s*(期|日|来)/,
      /(过去|以往|之前)\s*\d+\s*(天|日)/,
    ],
    en: [
      /last\s+\d+\s+(day|days|week|weeks|month|months|year|years)/i,
      /(yesterday|today|tomorrow)/i,
      /(this|last|past|next)\s+(week|month|year|quarter)/i,
      /\b(19\d\d|20\d\d)\b/,
      /(past|recent|last)\s+\d+\s+(day|days|week|weeks)/i,
      /(in|during|for)\s+\d{4}\b/,
    ],
  };

  /**
   * 检测查询中是否包含时间意图
   */
  private hasTimeIntent(query: string): boolean {
    const lang = this.detectTextLanguage(query);
    const patterns = ContextBuilder.TIME_PATTERNS[lang];

    for (const pattern of patterns) {
      if (pattern.test(query)) return true;
    }

    return false;
  }

  /**
   * 从查询中解析时间范围
   * 返回 { start, end } 毫秒时间戳，或 null（无法解析）
   */
  private parseTimeRange(query: string): { start: number; end: number } | null {
    const lang = this.detectTextLanguage(query);
    const now = Date.now();

    if (lang === "zh") {
      // "最近X天/周/个月/年"
      const recentMatch = query.match(/最近\s*(\d+)\s*(天|日|周|星期|个月|月|年)/);
      if (recentMatch) {
        const num = parseInt(recentMatch[1], 10);
        const unit = recentMatch[2];
        let ms: number;
        switch (unit) {
          case "天":
          case "日":
            ms = num * 86400000;
            break;
          case "周":
          case "星期":
            ms = num * 7 * 86400000;
            break;
          case "个月":
          case "月":
            ms = num * 30 * 86400000;
            break;
          case "年":
            ms = num * 365 * 86400000;
            break;
          default:
            return null;
        }
        return { start: now - ms, end: now };
      }

      // "2024年"
      const yearMatch = query.match(/(\d{4})\s*年/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        const start = new Date(year, 0, 1).getTime();
        const end = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
        return { start, end };
      }

      // "昨天"
      if (/昨天/.test(query) && !/前天/.test(query)) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return { start, end: start + 86400000 - 1 };
      }

      // "今天"
      if (/今天/.test(query)) {
        const start = new Date().setHours(0, 0, 0, 0);
        return { start, end: start + 86400000 - 1 };
      }

      // "这个月"
      if (/这个月/.test(query) || /本月/.test(query)) {
        const d = new Date();
        const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        return { start, end };
      }

      // "上个月"
      if (/上个月/.test(query)) {
        const d = new Date();
        const start = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
        const end = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999).getTime();
        return { start, end };
      }
    }

    // English
    if (lang === "en") {
      // "last X days/weeks/months/years"
      const lastMatch = query.match(
        /last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)/i,
      );
      if (lastMatch) {
        const num = parseInt(lastMatch[1], 10);
        const unit = lastMatch[2].toLowerCase();
        let ms: number;
        if (unit.startsWith("day")) ms = num * 86400000;
        else if (unit.startsWith("week")) ms = num * 7 * 86400000;
        else if (unit.startsWith("month")) ms = num * 30 * 86400000;
        else if (unit.startsWith("year")) ms = num * 365 * 86400000;
        else return null;
        return { start: now - ms, end: now };
      }

      // "yesterday"
      if (/yesterday/i.test(query)) {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        return { start, end: start + 86400000 - 1 };
      }

      // "this month"
      if (/this\s+month/i.test(query)) {
        const d = new Date();
        const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        return { start, end };
      }

      // 4-digit year: "2024"
      const yearMatch = query.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        const start = new Date(year, 0, 1).getTime();
        const end = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
        return { start, end };
      }
    }

    return null;
  }

  /**
   * 获取文件的有效创建时间
   * 优先使用 frontmatterDate（用户显式设置的创建日期），
   * 没有则回退到文件系统 ctime
   */
  private getFileEffectiveDate(fi: FileIndex): number {
    return fi.frontmatterDate ?? fi.ctime;
  }

  /**
   * 计算文件与查询时间范围的相关度（0~1）
   */
  private computeTimeScore(fileDate: number, timeRange: { start: number; end: number }): number {
    // 文件日期在时间范围内 → 满分
    if (fileDate >= timeRange.start && fileDate <= timeRange.end) {
      return 1.0;
    }

    // 文件日期在范围外 → 按距离衰减
    const rangeDuration = timeRange.end - timeRange.start;
    // 衰减半衰期：等于时间范围本身（范围 30 天则衰减至 0.5 需要 30 天）
    const halfLife = Math.max(rangeDuration, 86400000); // 至少 1 天

    let distance: number;
    if (fileDate < timeRange.start) {
      distance = timeRange.start - fileDate;
    } else {
      distance = fileDate - timeRange.end;
    }

    // 指数衰减
    return Math.pow(0.5, distance / halfLife);
  }

  // ==================== 英文词干提取 ====================

  /**
   * 轻量英文词干提取（不引入外部库）
   * 将不同形态的英文词归一化：configuring → configur, configuration → configurat
   * 注意：这不是完整的 Porter 算法，但对关键词匹配已足够
   */
  private lightStem(word: string): string {
    const lower = word.toLowerCase();
    // 所有格/缩写去除
    let stem = lower.replace(/'(?:s|re|ve|ll|t|m|d)$/, "").replace(/^(?:')/, "");
    // 常见后缀剥离
    stem = stem
      .replace(/(?:tion|sion)$/, "t") // configuration → configurat
      .replace(/(?:ize|ise)$/, "") // optimize → optim
      .replace(/(?:ative|ive)$/, "") // creative → creat
      .replace(/(?:ment|ness)$/, "") // adjustment → adjust, darkness → dark
      .replace(/(?:ity|ty)$/, "t") // activity → activt
      .replace(/(?:ful|less|ous)$/, "") // helpful → help, useless → use
      .replace(/(?:able|ible)$/, "") // usable → us
      .replace(/ing$/, "") // running → runn
      .replace(/ly$/, "") // quickly → quick
      .replace(/s$/, "") // models → model
      .replace(/ed$/, "") // removed → remov
      .replace(/(?:er|or)$/, "") // teacher → teach
      .replace(/al$/, "") // global → glob
      // 重复字母简化（如 runn → run）
      .replace(/(.)\1{2,}/, "$1$1");
    return stem;
  }

  // ==================== 中文分词（基于 Intl.Segmenter） ====================

  /**
   * 对中文文本进行分词
   * 优先使用 Intl.Segmenter（现代 Electron/Obsidian 均有）
   * 回退到 bigram 方案
   */
  private segmentChinese(text: string): string[] {
    const words: string[] = [];

    // 尝试使用 Intl.Segmenter
    try {
      const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
      const segments = segmenter.segment(text);
      for (const seg of segments) {
        const word = seg.segment.trim();
        if (seg.isWordLike && word.length >= 2 && !this.isStopWord(word, "zh")) {
          words.push(word);
        }
      }
      if (words.length > 0) return [...new Set(words)];
    } catch {
      // Intl.Segmenter 不可用时回退到 bigram
    }

    // 回退方案：bigram（2-gram）提取
    // 对于 "今天天气怎么样" → ["今天", "天天", "天气", "气怎", "怎么", "么样"]
    // 然后再进一步用停用词过滤
    for (let i = 0; i < text.length - 1; i++) {
      const bigram = text.substring(i, i + 2);
      if (!this.isStopWord(bigram, "zh") && bigram.trim().length === 2) {
        words.push(bigram);
      }
    }

    return [...new Set(words)];
  }

  /**
   * 对英文文本进行分词
   */
  private segmentEnglish(text: string): string[] {
    const words: string[] = [];

    // 尝试使用 Intl.Segmenter
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "word" });
      const segments = segmenter.segment(text.toLowerCase());
      for (const seg of segments) {
        const raw = seg.segment.toLowerCase().trim();
        if (!seg.isWordLike) continue;
        if (raw.length <= 1) continue;
        if (this.isStopWord(raw, "en")) continue;
        words.push(this.lightStem(raw));
      }
      if (words.length > 0) return [...new Set(words)];
    } catch {
      // Intl.Segmenter 不可用时回退
    }

    // 回退方案：正则分词 + 词干提取
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((t) => t.length > 1 && t !== "'");
    for (const token of tokens) {
      if (this.isStopWord(token, "en")) continue;
      words.push(this.lightStem(token));
    }

    return [...new Set(words)];
  }

  // ==================== 同义词扩展 ====================

  /**
   * 使用同义词映射扩展关键词列表
   */
  private expandKeywords(keywords: string[], lang: TextLang): string[] {
    const expanded = new Set(keywords);

    for (const keyword of keywords) {
      const groups = SYNONYM_MAP[lang];
      for (const group of groups) {
        // 如果关键词属于这个同义词组，将同组所有词加入
        if (group.includes(keyword)) {
          for (const synonym of group) {
            expanded.add(synonym);
          }
        }

        // 英文场景：词干化后也可能匹配
        if (lang === "en") {
          const stemmedKeyword = this.lightStem(keyword);
          const stemmedGroup = group.map((w) => this.lightStem(w));
          if (stemmedGroup.includes(stemmedKeyword)) {
            for (const synonym of group) {
              expanded.add(synonym);
            }
          }
        }
      }
    }

    return [...expanded];
  }

  // ==================== 停用词检测 ====================

  /**
   * 判断是否为停用词
   */
  private isStopWord(word: string, lang: TextLang): boolean {
    const lower = word.toLowerCase().trim();
    const list = STOP_WORDS[lang];
    return list.includes(lower) || list.includes(word);
  }

  // ==================== 双语关键词提取 ====================

  /**
   * 从文本中提取关键词（中英文双语感知）
   * - 中文：Intl.Segmenter 分词 → 同义词扩展
   * - 英文：空格分词 + 词干提取 → 同义词扩展
   */
  private extractKeywords(text: string, lang?: TextLang): string[] {
    const detectedLang = lang ?? this.detectTextLanguage(text);
    const cleaned = text.toLowerCase().trim();

    // 分别提取中文和英文部分
    const chineseChars: string[] = [];
    const latinChars: string[] = [];

    let buffer = "";
    for (const char of cleaned) {
      if (/[\u4e00-\u9fff]/.test(char)) {
        if (buffer && /[a-zA-Z]/.test(buffer[0])) {
          latinChars.push(buffer);
          buffer = "";
        }
        buffer += char;
      } else if (/[a-zA-Z]/.test(char) || char === "'") {
        if (buffer && /[\u4e00-\u9fff]/.test(buffer[0])) {
          chineseChars.push(buffer);
          buffer = "";
        }
        buffer += char;
      } else {
        // 标点/空格等：终结当前 buffer
        if (buffer) {
          if (/[\u4e00-\u9fff]/.test(buffer[0])) {
            chineseChars.push(buffer);
          } else {
            latinChars.push(buffer);
          }
          buffer = "";
        }
      }
    }
    if (buffer) {
      if (/[\u4e00-\u9fff]/.test(buffer[0])) {
        chineseChars.push(buffer);
      } else {
        latinChars.push(buffer);
      }
    }

    const result: string[] = [];

    // 处理中文部分
    for (const ch of chineseChars) {
      result.push(...this.segmentChinese(ch));
    }

    // 处理英文部分
    for (const en of latinChars) {
      result.push(...this.segmentEnglish(en));
    }

    // 数字/代码 token（保留原样）
    const codeTokens = cleaned.match(/\b[a-z0-9_-]+\b/g);
    if (codeTokens) {
      for (const token of codeTokens) {
        if (token.length > 1 && !result.includes(token)) {
          result.push(token);
        }
      }
    }

    return [...new Set(result)];
  }

  /**
   * 带同义词扩展的关键词提取
   */
  private extractKeywordsWithSynonyms(text: string, lang?: TextLang): string[] {
    const detectedLang = lang ?? this.detectTextLanguage(text);
    const keywords = this.extractKeywords(text, detectedLang);
    return this.expandKeywords(keywords, detectedLang);
  }

  // ==================== 改进的分块策略 ====================

  /**
   * 将 Markdown 内容按标题分块
   * 每个块包含其标题路径，保持上下文
   * 相邻块之间有重叠窗口
   */
  private chunkContent(content: string, sourcePath: string): ContextChunk[] {
    const lines = content.split("\n");
    const chunks: ContextChunk[] = [];
    const MIN_CHUNK_SIZE = 30;
    const OVERLAP_LINES = 2; // 重叠行数

    // 先按标题分块
    const sections: Array<{ heading: string; contentLines: number[] }> = [];
    let currentHeading = "";
    let currentLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 保存上一个段落
        if (currentLines.length > 0) {
          sections.push({
            heading: currentHeading,
            contentLines: currentLines,
          });
        }

        // 更新当前标题
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        // 构建标题路径
        if (currentHeading) {
          const parentParts = currentHeading.split(" > ");
          const parentLevel = parentParts.length;
          if (level > parentLevel) {
            currentHeading = `${currentHeading} > ${title}`;
          } else if (level === parentLevel) {
            const parts = currentHeading.split(" > ");
            parts[parts.length - 1] = title;
            currentHeading = parts.join(" > ");
          } else {
            const parts = currentHeading.split(" > ");
            currentHeading = [...parts.slice(0, level), title].join(" > ");
          }
        } else {
          currentHeading = title;
        }

        currentLines = [];
      } else {
        currentLines.push(i);
      }
    }

    // 保存最后一个段落
    if (currentLines.length > 0) {
      sections.push({
        heading: currentHeading,
        contentLines: currentLines,
      });
    }

    // 将段落组装成块
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // 获取包含标题和内容的文本
      const startLine = section.contentLines[0];
      const endLine = section.contentLines[section.contentLines.length - 1];

      // 包含重叠区域
      const overlapStart =
        i > 0
          ? Math.max(section.contentLines[0] - OVERLAP_LINES, sections[i - 1].contentLines[0])
          : startLine;

      const overlapEnd =
        i < sections.length - 1
          ? Math.min(
              section.contentLines[section.contentLines.length - 1] + OVERLAP_LINES,
              sections[i + 1].contentLines[section.contentLines.length - 1],
            )
          : endLine;

      let chunkText = lines
        .slice(overlapStart, overlapEnd + 1)
        .join("\n")
        .trim();

      // 如果没有标题且内容很短，尝试和上一个或下一个合并
      if (!section.heading && chunkText.length < MIN_CHUNK_SIZE) {
        // 如果不是第一个段落，合并到上一个块
        if (i > 0) {
          const prevChunk = chunks[chunks.length - 1];
          if (prevChunk) {
            prevChunk.content += "\n" + chunkText;
          }
          continue;
        }
      }

      // 如果有标题，在前面加上标题行
      if (section.heading) {
        chunkText = `# ${section.heading}\n\n${chunkText}`;
      }

      if (chunkText.length >= MIN_CHUNK_SIZE) {
        chunks.push({
          content: chunkText,
          sourcePath,
          relevance: 0,
        });
      }
    }

    // 如果没有任何标题分块（纯文本），则回退到段落分块
    if (chunks.length === 0) {
      const paragraphs = content.split(/\n\n+/);
      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (trimmed.length >= MIN_CHUNK_SIZE) {
          chunks.push({
            content: trimmed,
            sourcePath,
            relevance: 0,
          });
        }
      }
    }

    return chunks;
  }

  // ==================== 改进的评分算法 ====================

  /**
   * 计算块与用户消息的相关度
   * 使用：关键词覆盖率 + 词频权重 + 位置偏置 + 长度惩罚
   */
  private scoreChunks(chunks: ContextChunk[], userMessage: string): ContextChunk[] {
    const lang = this.detectTextLanguage(userMessage);
    const queryKeywords = this.extractKeywordsWithSynonyms(userMessage, lang);

    if (queryKeywords.length === 0) {
      return chunks.map((chunk) => ({ ...chunk, relevance: 0 }));
    }

    // 按 sourcePath 分组，用于计算位置偏置
    const fileChunks = new Map<string, ContextChunk[]>();
    for (const chunk of chunks) {
      const list = fileChunks.get(chunk.sourcePath) ?? [];
      list.push(chunk);
      fileChunks.set(chunk.sourcePath, list);
    }

    // 记录每个文件下每个块的原始索引
    const chunkFileIndex = new Map<ContextChunk, { fileIndex: number; fileTotal: number }>();
    for (const [, fileChunkList] of fileChunks) {
      for (let idx = 0; idx < fileChunkList.length; idx++) {
        chunkFileIndex.set(fileChunkList[idx], {
          fileIndex: idx,
          fileTotal: fileChunkList.length,
        });
      }
    }

    return chunks.map((chunk) => {
      const chunkKeywords = this.extractKeywords(chunk.content, lang);

      // 1. 关键词覆盖率：匹配到不同关键词的种类占比
      const matchedKeywords = queryKeywords.filter((kw) => chunkKeywords.includes(kw));
      const coverage = matchedKeywords.length / Math.max(queryKeywords.length, 1);

      // 2. 词频权重（TF）：匹配词在块中出现次数 / 块总词数
      const totalWords = chunk.content.split(/[\s\n]+/).filter(Boolean).length || 1;
      let termFrequency = 0;
      for (const kw of matchedKeywords) {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedKw, "g");
        const count = (chunk.content.toLowerCase().match(regex) || []).length;
        termFrequency += count / totalWords;
      }

      // 3. 位置偏置
      let positionBoost = 1.0;
      const pos = chunkFileIndex.get(chunk);
      if (pos && pos.fileTotal > 1) {
        if (pos.fileIndex === 0) {
          positionBoost = 1.3; // 文档第一个块
        } else if (pos.fileIndex === pos.fileTotal - 1) {
          positionBoost = 1.15; // 文档最后一个块
        }
      }

      // 4. 长度惩罚：过长或过短的块降低权重
      let lengthPenalty = 1.0;
      const charLen = chunk.content.length;
      if (charLen < 50) {
        lengthPenalty = 0.7; // 太短的信息量少
      } else if (charLen > 2000) {
        lengthPenalty = 0.85; // 太长的可能包含无关内容
      }

      // 5. 组合评分
      const relevance = coverage * (1 + termFrequency) * positionBoost * lengthPenalty;

      return {
        ...chunk,
        relevance,
      };
    });
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

      result.push(`> Source: [[${chunk.sourcePath.replace(/\.md$/, "")}]]\n\n${chunk.content}`);
      currentTokens += chunkTokens;
    }

    return result.join("\n\n---\n\n");
  }
}
