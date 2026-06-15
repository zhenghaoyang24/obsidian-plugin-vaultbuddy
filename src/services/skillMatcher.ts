import { Skill } from "../core/types";

/**
 * 轻量关键词匹配器
 * 根据用户输入匹配已配置的 Skill，返回匹配到的 Skill 列表（按匹配度降序）
 */

// 中文停用词（精简版）
const ZH_STOP: Set<string> = new Set([
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
]);

// 英文停用词（精简版）
const EN_STOP: Set<string> = new Set([
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
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "have",
  "has",
  "had",
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
  "make",
  "made",
  "much",
  "also",
  "well",
  "even",
  "still",
  "now",
  "here",
  "there",
  "up",
  "down",
  "out",
  "into",
  "over",
  "again",
  "once",
  "because",
  "since",
  "until",
  "while",
  "though",
  "after",
  "before",
  "between",
  "under",
  "off",
  "during",
  "without",
  "across",
  "through",
  "am",
  "upon",
]);

/**
 * 从文本中提取中文关键词（Bigram）
 */
function extractChinese(text: string): string[] {
  const words: string[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    const bigram = text.substring(i, i + 2);
    if (!ZH_STOP.has(bigram) && bigram.trim().length === 2) {
      words.push(bigram);
    }
  }
  return [...new Set(words)];
}

/**
 * 从文本中提取英文关键词
 */
function extractEnglish(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 1 && t !== "'" && !EN_STOP.has(t));
  return [...new Set(tokens)];
}

/**
 * 从用户消息中提取关键词（中英文双语感知）
 */
function extractKeywords(text: string): string[] {
  const cleaned = text.toLowerCase().trim();
  const result: string[] = [];

  // 分离中英文分别处理
  const chineseParts: string[] = [];
  const englishParts: string[] = [];
  let buffer = "";

  for (const char of cleaned) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      if (buffer && /[a-zA-Z]/.test(buffer[0])) {
        englishParts.push(buffer);
        buffer = "";
      }
      buffer += char;
    } else if (/[a-zA-Z]/.test(char) || char === "'") {
      if (buffer && /[\u4e00-\u9fff]/.test(buffer[0])) {
        chineseParts.push(buffer);
        buffer = "";
      }
      buffer += char;
    } else {
      if (buffer) {
        if (/[\u4e00-\u9fff]/.test(buffer[0])) {
          chineseParts.push(buffer);
        } else {
          englishParts.push(buffer);
        }
        buffer = "";
      }
    }
  }
  if (buffer) {
    if (/[\u4e00-\u9fff]/.test(buffer[0])) {
      chineseParts.push(buffer);
    } else {
      englishParts.push(buffer);
    }
  }

  for (const ch of chineseParts) {
    result.push(...extractChinese(ch));
  }
  for (const en of englishParts) {
    result.push(...extractEnglish(en));
  }

  return [...new Set(result)];
}

/**
 * 判断 Skill 的名称或描述是否包含匹配的关键词
 */
function matchesSkill(keywords: string[], name: string, description: string): number {
  if (keywords.length === 0) return 0;

  const searchText = `${name.toLowerCase()} ${description.toLowerCase()}`;

  // 计算关键词覆盖率
  let matchCount = 0;
  for (const kw of keywords) {
    if (searchText.includes(kw)) {
      matchCount++;
    }
  }

  return matchCount / keywords.length;
}

/**
 * 匹配用户输入与所有已配置的 Skill
 * 返回匹配到的 Skill 列表（按匹配度降序）
 */
export function matchSkills(userMessage: string, skills: Skill[]): Skill[] {
  if (!userMessage.trim() || skills.length === 0) return [];

  const keywords = extractKeywords(userMessage);
  if (keywords.length === 0) return [];

  const scored: Array<{ skill: Skill; score: number }> = [];

  for (const skill of skills) {
    const score = matchesSkill(keywords, skill.name, skill.description);
    if (score > 0) {
      scored.push({ skill, score });
    }
  }

  // 按匹配度降序排列
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.skill);
}
