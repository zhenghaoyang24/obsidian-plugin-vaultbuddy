/**
 * Diff 引擎
 * 解析 AI 返回的结构化编辑操作，转换为可渲染的 ChangeGroup
 *
 * 算法：LCS（最长公共子序列）行级 diff + hunk 合并 + 上下文行
 */

/** AI 返回的单个编辑操作 */
export interface EditOperation {
  startLine: number; // 原文件起始行号（从 1 开始）
  endLine: number; // 原文件结束行号（包含）
  old: string; // 原始内容（多行用 \n 连接）
  new: string; // 新内容（多行用 \n 连接）
}

/** 渲染用的变化块 */
export interface ChangeGroup {
  removed: Array<{ lineNum: number; content: string }>;
  added: Array<{ lineNum: number; content: string }>;
  /** 上下文起始行号（1-based），含 */
  contextStart: number;
  /** 上下文结束行号（1-based），含 */
  contextEnd: number;
}

// ==================== 标记解析 ====================

/**
 * 解析 %% DIFF_START ... %% / %% DIFF_END %% 外层标记
 * 返回 { path, body } 数组，body 为标记内的原始文本
 */
export function parseEditBlocks(
  text: string,
): Array<{ path: string; body: string }> {
  const results: Array<{ path: string; body: string }> = [];
  const regex =
    /(?:<tool_call>\s*)?%%\s*DIFF_START\s+(\{.*?\})\s*%%\s*\n([\s\S]*?)\n\s*%%\s*DIFF_END\s*%%(?:\s*<\/tool_call>)?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const meta = JSON.parse(match[1].trim());
      if (meta.path && typeof meta.path === "string") {
        results.push({ path: meta.path, body: match[2] });
      }
    } catch {
      // JSON 解析失败，跳过
    }
  }

  return results;
}

/**
 * 解析编辑操作的 JSON 行（每行一个 JSON 对象）
 * 每行格式：{"startLine":3,"endLine":5,"old":"...","new":"..."}
 */
export function parseEditOperations(body: string): EditOperation[] {
  const ops: EditOperation[] = [];
  const lines = body.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (
        typeof obj.startLine === "number" &&
        typeof obj.endLine === "number" &&
        typeof obj.old === "string" &&
        typeof obj.new === "string"
      ) {
        ops.push({
          startLine: obj.startLine,
          endLine: obj.endLine,
          old: obj.old,
          new: obj.new,
        });
      }
    } catch {
      // 跳过无法解析的行
    }
  }

  // 按行号排序（从大到小，便于后续应用）
  ops.sort((a, b) => b.startLine - a.startLine);
  return ops;
}

// ==================== LCS Diff 算法 ====================

/**
 * 计算两个字符串数组的最长公共子序列（LCS）长度表
 * 时间/空间 O(n*m)
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/**
 * 从 LCS 表回溯，提取公共子序列元素
 * 返回数组，每项 [oldIdx, newIdx, content]
 */
function backtrackLcs(
  dp: number[][],
  a: string[],
  b: string[],
): Array<[number, number, string]> {
  const result: Array<[number, number, string]> = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push([i - 1, j - 1, a[i - 1]]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  result.reverse();
  return result;
}

/** 单行 diff 结果 */
interface DiffLine {
  type: "remove" | "add";
  lineNum: number;
  content: string;
}

/**
 * 对两段文本做行级 diff，返回原始差异行列表（不含上下文）
 * 使用 LCS 算法，只输出真正变化的行
 *
 * 行号规则（新文件行号）：
 * - 所有删除行：统一使用 newStartLine（替换起始位置）
 * - 新增行：使用 newStartLine + newIndex（新文件中的实际位置）
 */
function computeLineDiff(
  oldLines: string[],
  newLines: string[],
  newStartLine: number,
): DiffLine[] {
  if (oldLines.length === 0 && newLines.length === 0) return [];

  // 纯插入（old 为空）
  if (oldLines.length === 0) {
    return newLines.map((content, i) => ({
      type: "add" as const,
      lineNum: newStartLine + i,
      content,
    }));
  }

  // 纯删除（new 为空）
  if (newLines.length === 0) {
    return oldLines.map((content) => ({
      type: "remove" as const,
      lineNum: newStartLine,
      content,
    }));
  }

  // 通用 LCS diff
  const dp = lcsTable(oldLines, newLines);
  const common = backtrackLcs(dp, oldLines, newLines);

  // 构建 LCS 索引集合
  const commonOldSet = new Set(common.map((c) => c[0]));
  const commonNewSet = new Set(common.map((c) => c[1]));

  const lines: DiffLine[] = [];

  // 删除行：旧内容中不在 LCS 中的行，统一标记在 newStartLine
  for (let i = 0; i < oldLines.length; i++) {
    if (!commonOldSet.has(i)) {
      lines.push({
        type: "remove",
        lineNum: newStartLine,
        content: oldLines[i],
      });
    }
  }

  // 新增行：新内容中不在 LCS 中的行，使用新文件实际位置
  for (let i = 0; i < newLines.length; i++) {
    if (!commonNewSet.has(i)) {
      lines.push({
        type: "add",
        lineNum: newStartLine + i,
        content: newLines[i],
      });
    }
  }

  return lines;
}

// ==================== Hunk 合并 + 上下文行 ====================

interface RawHunk {
  minLine: number;
  maxLine: number;
  changes: DiffLine[];
}

const CONTEXT_LINES = 3; // 变更块前后各显示的未修改行数
const MERGE_GAP = 4; // 相邻更改块间未改变行数 ≤ 3 时合并（即 minLine 差 ≤ 4）

/**
 * 将原始差异行列表合并为相邻 hunk，并计算上下文范围
 *
 * 渲染时从 contextStart 到 contextEnd 逐行输出：
 * - 命中 removed → 红色删除行
 * - 命中 added → 绿色新增行
 * - 否则 → 未变更上下文行
 *
 * 这样合并后的 hunk 中间的未变更行也能正确显示。
 */
export function mergeAndAddContext(
  allDiffs: DiffLine[],
  newLineCount: number,
): ChangeGroup[] {
  if (allDiffs.length === 0) return [];

  // 1. 按行号排序
  const sorted = [...allDiffs].sort((a, b) => a.lineNum - b.lineNum);

  // 2. 分组为初始 hunk（行号连续 ≤1 归为同组）
  const rawGroups: DiffLine[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].lineNum - sorted[i - 1].lineNum <= 1) {
      rawGroups[rawGroups.length - 1].push(sorted[i]);
    } else {
      rawGroups.push([sorted[i]]);
    }
  }

  // 3. 转为 RawHunk 并合并间距过小的
  const rawHunks: RawHunk[] = rawGroups.map((group) => ({
    minLine: group[0].lineNum,
    maxLine: group[group.length - 1].lineNum,
    changes: group,
  }));

  const merged: RawHunk[] = [rawHunks[0]];
  for (let i = 1; i < rawHunks.length; i++) {
    const last = merged[merged.length - 1];
    const curr = rawHunks[i];
    if (curr.minLine - last.maxLine <= MERGE_GAP) {
      last.maxLine = curr.maxLine;
      last.changes.push(...curr.changes);
    } else {
      merged.push(curr);
    }
  }

  // 4. 计算上下文范围
  const groups: ChangeGroup[] = merged.map((hunk) => {
    const contextStart = Math.max(1, hunk.minLine - CONTEXT_LINES);
    const contextEnd = Math.min(newLineCount, hunk.maxLine + CONTEXT_LINES);

    return {
      removed: hunk.changes
        .filter((c) => c.type === "remove")
        .map((c) => ({ lineNum: c.lineNum, content: c.content })),
      added: hunk.changes
        .filter((c) => c.type === "add")
        .map((c) => ({ lineNum: c.lineNum, content: c.content })),
      contextStart,
      contextEnd,
    };
  });

  return groups;
}

// ==================== 行号剥离 ====================

/**
 * 剥离 AI 输出中可能携带的行号前缀 [N]
 * AI 看到的上下文文件带 [1], [2] ... 行号，有时会复制到 old/new 字段
 */
function stripLineNumbers(text: string): string {
  return text.replace(/^\[\d+]\s?/gm, "");
}

// ==================== 主入口 ====================

/**
 * 将 EditOperation 列表转换为 ChangeGroup 列表（用于渲染）
 *
 * 核心改进：逐操作累积偏移量，确保所有行号使用新文件（应用编辑后）的位置。
 * 上下文行也从新文件内容中提取，而非原文件。
 *
 * @param ops 编辑操作列表
 * @param originalContent 原文件完整内容
 * @returns { groups, errors }
 */
export function buildChangeGroups(
  ops: EditOperation[],
  originalContent: string,
): { groups: ChangeGroup[]; errors: string[] } {
  const errors: string[] = [];

  // 按行号正序排列（用于 diff 计算）
  const sortedOps = [...ops].sort((a, b) => a.startLine - b.startLine);

  // 收集所有操作的原始 diff 行，使用新文件行号
  const allDiffs: DiffLine[] = [];
  let cumulativeOffset = 0;

  for (const op of sortedOps) {
    const cleanOld = stripLineNumbers(op.old);
    const cleanNew = stripLineNumbers(op.new);
    const oldLines = cleanOld === "" ? [] : cleanOld.split("\n");
    const newLines = cleanNew === "" ? [] : cleanNew.split("\n");

    // 新文件行号 = 原始起始行 + 之前所有操作的累积偏移
    const newStartLine = op.startLine + cumulativeOffset;

    const diffs = computeLineDiff(oldLines, newLines, newStartLine);
    allDiffs.push(...diffs);

    // 更新累积偏移：本次操作插入行数 - 删除行数
    cumulativeOffset += newLines.length - oldLines.length;
  }

  // 计算新文件总行数
  const originalLines = originalContent.split("\n");
  const totalOldLines = originalLines.length;
  const newLineCount = totalOldLines + cumulativeOffset;

  // 合并 hunk 并添加上下文行
  const groups = mergeAndAddContext(allDiffs, newLineCount);

  return { groups, errors };
}

// ==================== 应用操作 ====================

/**
 * 将编辑操作应用到原文，返回完整的修改后内容
 * 操作按行号从大到小处理，避免行号偏移问题
 */
export function applyOperations(originalContent: string, ops: EditOperation[]): string {
  const lines = originalContent.split("\n");

  // 按行号从大到小排序（应用时从后往前，不影响前面的行号）
  const sorted = [...ops].sort((a, b) => b.startLine - a.startLine);

  for (const op of sorted) {
    const startIdx = op.startLine - 1;
    const deleteCount = op.endLine - op.startLine + 1;
    const cleanNew = stripLineNumbers(op.new);
    const newLines = cleanNew === "" ? [] : cleanNew.split("\n");
    lines.splice(startIdx, deleteCount, ...newLines);
  }

  return lines.join("\n");
}
