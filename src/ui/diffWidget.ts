/**
 * Diff 预览组件
 * 在聊天气泡中渲染行级差异，支持 Accept/Reject 操作
 */

import { App, Notice, TFile } from "obsidian";
import { ChangeGroup } from "../services/diffEngine";
import { EditBlockState } from "../core/types";
import { i18n } from "../core/i18n";

export interface DiffWidgetOptions {
  container: HTMLElement;
  filePath: string;
  groups: ChangeGroup[];
  errors?: string[];
  state: EditBlockState["state"];
  newContent: string;
  newLines: string[]; // 新文件按行分割，用于查找上下文行内容
  app: App;
  onStateChange?: (newState: EditBlockState["state"]) => void;
  /** 用户点击 Accept/Reject 后的反馈回调，用于向对话记录追加反馈消息 */
  onFeedback?: (filePath: string, outcome: "applied" | "rejected") => void;
  interactive?: boolean;
}

/**
 * 渲染 Diff 预览组件
 *
 * 渲染逻辑：对每个 hunk，从 contextStart 到 contextEnd 逐行输出：
 * - 命中 removed → 红色删除行
 * - 命中 added → 绿色新增行
 * - 否则 → 未变更上下文行（灰色）
 */
export function renderDiffWidget(options: DiffWidgetOptions): void {
  const {
    container,
    filePath,
    groups,
    errors,
    state,
    newContent,
    newLines,
    app,
    onStateChange,
    onFeedback,
    interactive = state === "pending",
  } = options;

  const wrapper = container.createDiv("vaultbuddy-diff");

  // ---- Header ----
  const header = wrapper.createDiv("vaultbuddy-diff-header");

  const pathEl = header.createSpan("vaultbuddy-diff-path");
  pathEl.textContent = filePath;
  pathEl.addEventListener("click", () => {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      void app.workspace.getLeaf(false).openFile(file);
    }
  });

  if (state !== "pending") {
    showBadgeEl(header, state);
  }

  // ---- 校验错误提示 ----
  if (errors && errors.length > 0) {
    const errEl = wrapper.createDiv("vaultbuddy-diff-errors");
    for (const err of errors) {
      const line = errEl.createDiv("vaultbuddy-diff-error-line");
      line.textContent = `⚠️ ${err}`;
    }
  }

  // ---- Body ----
  const body = wrapper.createDiv("vaultbuddy-diff-body");

  if (groups.length === 0) {
    body.createDiv("vaultbuddy-diff-no-changes").textContent = i18n("diff.noChanges");
  } else {
    // 构建快速查找表
    const removedMap = new Map<number, string>();
    const addedMap = new Map<number, string[]>();
    for (const group of groups) {
      for (const r of group.removed) removedMap.set(r.lineNum, r.content);
      for (const a of group.added) {
        if (!addedMap.has(a.lineNum)) addedMap.set(a.lineNum, []);
        addedMap.get(a.lineNum)!.push(a.content);
      }
    }

    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      // 组之间空两行分隔
      if (gIdx > 0) {
        body.createDiv("vaultbuddy-diff-separator");
        body.createDiv("vaultbuddy-diff-separator");
      }

      const group = groups[gIdx];
      const hunkEl = body.createDiv("vaultbuddy-diff-hunk");

      // 从 contextStart 到 contextEnd 逐行渲染
      for (let lineNum = group.contextStart; lineNum <= group.contextEnd; lineNum++) {
        const lineIdx = lineNum - 1;

        if (removedMap.has(lineNum)) {
          // 删除行
          const lineEl = hunkEl.createDiv("vaultbuddy-diff-line diff-remove");
          renderLineNum(lineEl, lineNum);
          renderPrefix(lineEl, "-");
          renderContent(lineEl, removedMap.get(lineNum)!);
        }

        if (addedMap.has(lineNum)) {
          // 新增行（可能多行）
          for (const content of addedMap.get(lineNum)!) {
            const lineEl = hunkEl.createDiv("vaultbuddy-diff-line diff-add");
            renderLineNum(lineEl, lineNum);
            renderPrefix(lineEl, "+");
            renderContent(lineEl, content);
          }
        }

        if (!removedMap.has(lineNum) && !addedMap.has(lineNum)) {
          // 未变更上下文行
          if (lineIdx >= 0 && lineIdx < newLines.length) {
            const lineEl = hunkEl.createDiv("vaultbuddy-diff-line diff-context");
            renderLineNum(lineEl, lineNum);
            renderPrefix(lineEl, " ");
            renderContent(lineEl, newLines[lineIdx]);
          }
        }
      }
    }
  }

  // ---- Footer ----
  if (interactive && state === "pending" && (!errors || errors.length === 0)) {
    const footer = wrapper.createDiv("vaultbuddy-diff-footer");

    const rejectBtn = footer.createEl("button");
    rejectBtn.textContent = i18n("diff.reject");
    rejectBtn.addClass("vaultbuddy-diff-btn", "vaultbuddy-diff-btn-reject");
    rejectBtn.addEventListener("click", () => {
      onStateChange?.("rejected");
      onFeedback?.(filePath, "rejected");
      footer.remove();
      showBadgeEl(header, "rejected");
    });

    const acceptBtn = footer.createEl("button");
    acceptBtn.textContent = i18n("diff.accept");
    acceptBtn.addClass("vaultbuddy-diff-btn", "vaultbuddy-diff-btn-accept");
    acceptBtn.addEventListener("click", () => {
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        new Notice(i18n("diff.fileNotFound"));
        return;
      }
      void app.vault.modify(file, newContent).then(() => {
        new Notice(i18n("diff.applySuccess"));
        onStateChange?.("accepted");
        onFeedback?.(filePath, "applied");
        footer.remove();
        showBadgeEl(header, "accepted");
      });
    });
  }
}

// ---- 辅助渲染函数 ----

function renderLineNum(el: HTMLElement, num: number): void {
  const span = el.createSpan("vaultbuddy-diff-line-num");
  span.textContent = String(num);
}

function renderPrefix(el: HTMLElement, prefix: string): void {
  const span = el.createSpan("vaultbuddy-diff-prefix");
  span.textContent = prefix;
}

function renderContent(el: HTMLElement, content: string): void {
  const span = el.createSpan("vaultbuddy-diff-content");
  span.textContent = content;
}

function showBadgeEl(header: HTMLElement, state: "accepted" | "rejected"): void {
  if (header.querySelector(".vaultbuddy-diff-badge")) return;
  const badge = header.createSpan("vaultbuddy-diff-badge");
  if (state === "accepted") {
    badge.textContent = i18n("diff.accepted");
    badge.addClass("badge-accepted");
  } else {
    badge.textContent = i18n("diff.rejected");
    badge.addClass("badge-rejected");
  }
}
