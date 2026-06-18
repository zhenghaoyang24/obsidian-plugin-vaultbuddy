<div align="right">

中文 | [English](https://github.com/zhenghaoyang24/obsidian-plugin-vaultbuddy/blob/master/README.md)

</div>

# VaultBuddy

Obsidian AI 对话助手，基于本地笔记智能回答问题。

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-插件-7C3AED?logo=obsidian)](https://obsidian.md/plugins)

<img style="width: 100%; height: auto; display: block;" alt="chat" src="https://github.com/user-attachments/assets/2d8cef5d-4aa2-48b6-a44a-17318f5e07ae" />
<img style="width: 100%; height: auto; display: block;" alt="edit" src="https://github.com/user-attachments/assets/38c31a07-965c-43bd-9a87-3bdbbdfcfc5b" />
<img style="width: 100%; height: auto; display: block;" alt="setting" src="https://github.com/user-attachments/assets/441e28ea-82ba-482b-8644-4a3b1bbf46b0" />

## 功能特性

- **📖 基于笔记的问答** — 提出问题，AI 从你的笔记中自动检索相关内容作为上下文，给出有据可循的答案。
- **📄 当前笔记全量感知** — 你正在编辑的笔记会完整地注入上下文，无论是总结、优化还是讨论，AI 都能看到全貌。
- **🔗 跨笔记关联** — 串联不同笔记中的信息，AI 能够发现分散在多个文件中的相关内容。
- **✏️ 笔记修改** — AI 可以建议修改你的笔记，并提供可视化差异预览。逐行查看更改，一键接受或拒绝。
- **🎯 自定义技能** — 创建可复用的技能，包含特定指令，根据你的消息自动激活。非常适合翻译、格式化、总结等重复性任务。
- **🤖 多模型支持** — 可配置多个 OpenAI 兼容模型（DeepSeek、OpenAI、Groq 等），随时切换。
- **🔒 本地安全加密** — API Key 使用 Web Crypto API 加密存储，对话记录自动保存在本地。

## 数据保存

- **API Key** — 使用 Web Crypto API 本地加密存储，不会被同步或上传到任何服务器。
- **个人数据** — 聊天记录、技能配置、插件设置、模型设置等保存在 `data.json` 文件中。

如果你有多端使用需求，建议通过 Git 同步 `data.json` 文件。如果你的 `.gitignore` 中忽略了整个插件目录，可以这样排除 `data.json`：

```gitignore
.obsidian/plugins/*
!.obsidian/plugins/vaultbuddy/
!.obsidian/plugins/vaultbuddy/data.json
```

## 工作原理

VaultBuddy 采用**两阶段检索**策略，从你的笔记库中精准找到最相关的内容。

### 第一阶段：轻量索引（快速扫描）

当你提问时，VaultBuddy 会利用 Obsidian 内置的 metadata cache 为 **vault 中的每个文件**构建一个轻量索引——不需要读取文件完整内容。它从每个笔记中提取以下关键信息：

- **标题** — 来自 frontmatter `title` 或文件名
- **标题层级** — 笔记中所有的 `#` 标题
- **标签** — 笔记中使用的 `#tag`
- **别名** — 来自 frontmatter `aliases`
- **创建时间** — 文件系统时间或 frontmatter 中的日期

这些轻量化的"文件卡片"会通过关键词匹配和同义词扩展与你的问题进行相关性评分，排名靠前的文件被选为候选。

### 第二阶段：完整读取（深度分析）

只有候选文件才会被完整读取并**分块**（按标题分组的段落）。每个块会与你的问题重新评分，最相关的块被组装到 AI 的上下文窗口中——适配模型的 token 限制。

### 优先级：当前笔记

如果你提问时正在编辑某篇笔记，它的**完整内容会优先纳入**，确保 AI 在总结或优化当前笔记时拥有完整的上下文。

> **提示**：你的笔记元数据越丰富（描述性的标题、有意义的标签、清晰的标题层级），VaultBuddy 就能越精准地匹配到合适的笔记来回答问题。

## 安装方法

### 从社区商店安装

1. 打开 Obsidian → 设置 → 第三方插件 → 浏览
2. 搜索 **VaultBuddy**
3. 点击安装 → 启用

### 手动安装

1. 前往 [GitHub Releases](https://github.com/zhenghaoyang24/obsidian-plugin-vaultbuddy/releases) 下载以下 3 个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 在你的仓库中创建文件夹 `.obsidian/plugins/vaultbuddy/`
3. 将这 3 个文件放入该文件夹
4. 打开设置 → 第三方插件 → 启用 VaultBuddy

## 快速上手

### 添加模型

打开 **设置 → VaultBuddy**，点击 **+ 添加模型**。填写以下信息：

| 字段       | 示例值                                      |
| ---------- | ------------------------------------------- |
| 显示名称   | `DeepSeek`                                  |
| Base URL   | `https://api.deepseek.com/chat/completions` |
| API Key    | `sk-...`                                    |
| 模型 ID    | `deepseek-chat`                             |
| 上下文窗口 | `131072`                                    |

> **Base URL** 需填写 cURL 兼容的聊天补全接口地址（如 `https://api.openai.com/v1/chat/completions`）。

点击 **保存模型**，然后在下方的下拉框中选择默认模型。

## 配置项说明

| 配置项             | 说明                                |
| ------------------ | ----------------------------------- |
| 模型配置           | 添加、编辑、删除、测试 API 模型     |
| 默认模型           | 新对话使用的模型                    |
| 最大回复 Token     | AI 回答的最大长度（推荐 4096-8192） |
| 自定义规则         | 附加到系统提示词的额外指令          |
| 技能管理           | 创建、编辑、删除自定义技能          |
| 启动时恢复上次对话 | 打开插件时自动加载上次的对话记录    |


## 兼容性

- ✅ **桌面端** — Obsidian v0.15.0+
- ✅ **移动端** — 完全支持（`isDesktopOnly: false`）
- ✅ **API** — 兼容 OpenAI 格式接口（DeepSeek、OpenAI、Groq 等）

## 参与贡献

欢迎参与贡献！以下是几种方式：

1. **报告 Bug** — 提交 Issue 并附上复现步骤
2. **建议功能** — 在 Discussions 中分享你的想法
3. **提交 PR** — Fork 仓库，创建分支，提交 Pull Request

请遵循现有代码风格，适用时请包含测试。

## 许可证

[MIT](LICENSE)
