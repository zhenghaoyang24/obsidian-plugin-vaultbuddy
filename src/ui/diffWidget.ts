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
  errors?: string[]; // 校验错误信息
  state: EditBlockState["state"];
  newContent: string; // 应用时写入的完整新内容
  app: App;
  onStateChange?: (newState: EditBlockState["state"]) => void;
  interactive?: boolean;
}

/**
 * 渲染 Diff 预览组件
 */
export function renderDiffWidget(options: DiffWidgetOptions): void {
  const {
    container,
    filePath,
    groups,
    errors,
    state,
    newContent,
    app,
    onStateChange,
    interactive = state === "pending",
  } = options;

  const wrapper = container.createDiv("vaultbuddy-diff");

  // ---- Header ----
  const header = wrapper.createDiv("vaultbuddy-diff-header");

  // 左上角：文件路径（可点击跳转）
  const pathEl = header.createSpan("vaultbuddy-diff-path");
  pathEl.textContent = filePath;
  pathEl.addEventListener("click", () => {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      void app.workspace.getLeaf(false).openFile(file);
    }
  });

  // 右上角：状态徽章
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

  if (groups.length === 0 && (!errors || errors.length === 0)) {
    body.createDiv("vaultbuddy-diff-no-changes").textContent = i18n("diff.noChanges");
  } else {
    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      // 组之间空行分隔
      if (gIdx > 0) {
        body.createDiv("vaultbuddy-diff-separator");
      }

      const group = groups[gIdx];
      const hunkEl = body.createDiv("vaultbuddy-diff-hunk");

      // 先渲染删除行（旧行）
      for (const line of group.removed) {
        const lineEl = hunkEl.createDiv("vaultbuddy-diff-line diff-remove");
        const numEl = lineEl.createSpan("vaultbuddy-diff-line-num");
        numEl.textContent = String(line.lineNum);
        const prefixEl = lineEl.createSpan("vaultbuddy-diff-prefix");
        prefixEl.textContent = "-";
        const contentEl = lineEl.createSpan("vaultbuddy-diff-content");
        contentEl.textContent = line.content;
      }

      // 再渲染新增行
      for (const line of group.added) {
        const lineEl = hunkEl.createDiv("vaultbuddy-diff-line diff-add");
        const numEl = lineEl.createSpan("vaultbuddy-diff-line-num");
        numEl.textContent = String(line.lineNum);
        const prefixEl = lineEl.createSpan("vaultbuddy-diff-prefix");
        prefixEl.textContent = "+";
        const contentEl = lineEl.createSpan("vaultbuddy-diff-content");
        contentEl.textContent = line.content;
      }
    }
  }

  // ---- Footer（仅 interactive 且 pending 且无校验错误时显示按钮）----
  if (interactive && state === "pending" && (!errors || errors.length === 0)) {
    const footer = wrapper.createDiv("vaultbuddy-diff-footer");

    const rejectBtn = footer.createEl("button");
    rejectBtn.textContent = i18n("diff.reject");
    rejectBtn.addClass("vaultbuddy-diff-btn", "vaultbuddy-diff-btn-reject");
    rejectBtn.addEventListener("click", () => {
      onStateChange?.("rejected");
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
        footer.remove();
        showBadgeEl(header, "accepted");
      });
    });
  }
}

/**
 * 在 header 中创建状态徽章元素
 */
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
