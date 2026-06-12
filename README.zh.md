<div align="right">

[**English**](README.md) | [**中文**](README.zh.md)

</div>

# VaultTalk

> Obsidian AI 对话助手，基于本地笔记智能回答问题。

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-插件-7C3AED?logo=obsidian)](https://obsidian.md/plugins)

---

## 功能特性

**VaultTalk** 将你的 Obsidian 笔记变为知识库。只需提出问题，AI 即可基于你的内容给出回答。插件会自动读取整个知识库，根据问题识别最相关的段落，并将其作为上下文发送给 AI 模型——因此每个回答都有你的笔记作为依据。无论你是想在分散的文件中查找特定信息、尝试将不同笔记中的观点建立联系，还是需要对你写过的某个笔记进行总结或建议，VaultTalk 都能为你找到并引用相关来源。支持多种 AI 服务商（DeepSeek、OpenAI、Groq 或任何兼容 OpenAI 的 API），可随时切换模型，API Key 本地加密存储不会被同步。所有对话自动保存。

---

## 安装方法

### 从社区商店安装（上架后）

1. 打开 Obsidian → 设置 → 第三方插件 → 浏览
2. 搜索 **VaultTalk**
3. 点击安装 → 启用

### 手动安装

1. 前往 [GitHub Releases](https://github.com/zhenghaoyang24/obsidian-plugin-vaulttalk/releases) 下载以下 3 个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 在你的仓库中创建文件夹 `.obsidian/plugins/vaulttalk/`
3. 将这 3 个文件放入该文件夹
4. 打开设置 → 第三方插件 → 启用 VaultTalk

---

## 快速上手

### 添加模型

打开 **设置 → VaultTalk**，点击 **+ 添加模型**。填写以下信息：

| 字段       | 示例值                                      |
| ---------- | ------------------------------------------- |
| 显示名称   | `DeepSeek`                                  |
| Base URL   | `https://api.deepseek.com/chat/completions` |
| API Key    | `sk-...`                                    |
| 模型 ID    | `deepseek-chat`                             |
| 上下文窗口 | `131072`                                    |

> **Base URL** 需填写 cURL 兼容的聊天补全接口地址（如 `https://api.openai.com/v1/chat/completions`）。

点击 **保存模型**，然后在下方的下拉框中选择默认模型。

---

## 配置项说明

| 配置项             | 说明                                |
| ------------------ | ----------------------------------- |
| 模型配置           | 添加、编辑、删除、测试 API 模型     |
| 默认模型           | 新对话使用的模型                    |
| 最大回复 Token     | AI 回答的最大长度（推荐 4096-8192） |
| 自定义规则         | 附加到系统提示词的额外指令          |
| 启动时恢复上次对话 | 打开插件时自动加载上次的对话记录    |

---

## 开发指南

```bash
# 安装依赖
npm install

# 监听模式（自动重构建）
npm run dev

# 生产构建
npm run build

# 仅类型检查
tsc --noEmit
```

### 项目结构

```
vaulttalk/
├── manifest.json          # 插件元数据
├── package.json           # 依赖配置
├── styles.css             # 样式文件
├── build/                 # 构建输出
└── src/
    ├── core/              # 插件入口 & 类型定义
    │   ├── main.ts
    │   ├── types.ts
    │   └── i18n.ts        # 多语言模块
    ├── services/          # 业务逻辑
    │   ├── aiService.ts   # API 调用 & 流式输出
    │   ├── contextBuilder.ts # 知识库压缩
    │   └── storage.ts     # 对话持久化
    ├── ui/                # 界面组件
    │   ├── view.ts        # 对话面板
    │   └── settings.ts    # 设置页
    └── utils/
        └── sourceManager.ts
```

---

## 兼容性

- ✅ **桌面端** — Obsidian v0.15.0+
- ✅ **移动端** — 完全支持（`isDesktopOnly: false`）
- ✅ **API** — 兼容 OpenAI 格式接口（DeepSeek、OpenAI、Groq 等）

---

## 参与贡献

欢迎参与贡献！以下是几种方式：

1. **报告 Bug** — 提交 Issue 并附上复现步骤
2. **建议功能** — 在 Discussions 中分享你的想法
3. **提交 PR** — Fork 仓库，创建分支，提交 Pull Request

请遵循现有代码风格，适用时请包含测试。

---

## 许可证

[MIT](LICENSE)

## 作者

**zhenghaoyang24** — [GitHub](https://github.com/zhenghaoyang24/)
