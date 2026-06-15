/**
 * Diff 引擎
 * 解析 AI 返回的结构化编辑操作，转换为可渲染的 ChangeGroup
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
}

/**
 * 解析 ==[DIFF_START]== ... ==[DIFF_END]== 外层标记
 * 返回 { path, body } 数组，body 为标记内的原始文本
 */
export function parseEditBlocks(
  text: string,
): Array<{ path: string; body: string }> {
  const results: Array<{ path: string; body: string }> = [];
  const regex =
    /==\[DIFF_START\]==\s*\n([\s\S]*?)\n---\n([\s\S]*?)\n==\[DIFF_END\]==/g;
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
 * 解析编辑操作的 JSON 行
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

/**
 * 将 EditOperation 转换为 ChangeGroup（用于渲染）
 * @param ops 编辑操作列表（已按行号排序）
 * @param originalContent 原文件完整内容
 * @returns { groups, errors } — groups 用于渲染，errors 为校验失败的操作
 */
export function buildChangeGroups(
  ops: EditOperation[],
  originalContent: string,
): { groups: ChangeGroup[]; errors: string[] } {
  const originalLines = originalContent.split("\n");
  const groups: ChangeGroup[] = [];
  const errors: string[] = [];

  // 按行号正序排列（用于显示）
  const sortedOps = [...ops].sort((a, b) => a.startLine - b.startLine);

  for (const op of sortedOps) {
    // 提取原文件中对应行
    const actualOldLines = originalLines.slice(
      op.startLine - 1,
      op.endLine,
    );
    const actualOld = actualOldLines.join("\n");

    // 校验旧行内容是否匹配
    if (op.old !== "" && op.old !== actualOld) {
      errors.push(
        `Line ${op.startLine}-${op.endLine}: content mismatch`,
      );
      continue;
    }

    const group: ChangeGroup = { removed: [], added: [] };

    // 构建 removed（旧行）
    if (op.old !== "") {
      const oldLines = op.old.split("\n");
      for (let i = 0; i < oldLines.length; i++) {
        group.removed.push({
          lineNum: op.startLine + i,
          content: oldLines[i],
        });
      }
    }

    // 构建 added（新行）
    if (op.new !== "") {
      const newLines = op.new.split("\n");
      for (let i = 0; i < newLines.length; i++) {
        group.added.push({
          lineNum: op.startLine + i,
          content: newLines[i],
        });
      }
    }

    // 跳过空操作（旧行和新行都为空）
    if (group.removed.length === 0 && group.added.length === 0) {
      continue;
    }

    groups.push(group);
  }

  return { groups, errors };
}

/**
 * 将编辑操作应用到原文，返回完整的修改后内容
 * 操作按行号从大到小处理，避免行号偏移问题
 */
export function applyOperations(
  originalContent: string,
  ops: EditOperation[],
): string {
  const lines = originalContent.split("\n");

  // 按行号从大到小排序（应用时从后往前，不影响前面的行号）
  const sorted = [...ops].sort((a, b) => b.startLine - a.startLine);

  for (const op of sorted) {
    const startIdx = op.startLine - 1;
    const deleteCount = op.endLine - op.startLine + 1;
    const newLines = op.new === "" ? [] : op.new.split("\n");
    lines.splice(startIdx, deleteCount, ...newLines);
  }

  return lines.join("\n");
}
