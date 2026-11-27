---
description: "在插件页启用 Chromium 网页自动化、截图和交互录制。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-browser-use-playwright-bundle

[English](README.md) | 中文

## 概述

在 Web 或 Desktop 的插件页启用 Playwright 浏览器能力。该组合包挂载[浏览器使用提供方注册](../../browser-use/browser-use/README.zh.md)和 [Playwright MCP 提供方](../browser-use-playwright-mcp/README.zh.md)，为每个运行中的会话提供一个 Chromium 浏览器，并通过上游工具完成导航、点击、输入、截图、追踪和交互录制。Linux Desktop 安装包内置固定版本的 Chromium；其他安装使用 Playwright 的浏览器缓存或配置的可执行文件。随附配置默认关闭该组合包，只有 Linux Desktop 配置在首次启动时挂载它。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开插件页，在 Official 分组中启用 Playwright 浏览器。可以让模型打开网页，例如“打开公司知识库并总结发布检查清单”，或“录制提交报销单的步骤”。上游录制工具会保存一份 Playwright trace；停止录制时会返回 trace 文件路径，模型可以据此描述或重放步骤。

浏览器默认显示窗口，便于人工观察和接管。没有可用 Chromium 时，在拥有 MCP 服务端的安装目录执行 `pnpm exec playwright install chromium`，或把提供方的 `executablePath` 指向已有的 Chromium 可执行文件。

<a id="understand-the-implementation"></a>
## 实现说明

组合包补丁插入 `@deepseek-ai/dsh-browser-use` 和 `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`。提供方使用 Host 的 Node 可执行文件启动固定版本的 `@playwright/mcp` 服务端，为每个运行中的会话保留一个连接，并以 `mcp__playwright-mcp__` 命名空间暴露工具。浏览器状态属于会话，卸载或恢复后不会持久化。Linux Desktop 打包会把匹配版本的 Chromium 安装到 `resources/playwright-browsers`，并在 Host 启动前把 `PLAYWRIGHT_BROWSERS_PATH` 指向该目录。

<a id="model-experience"></a>
## 模型体验

### 浏览器工具与录制

#### 模型看到什么

上游 Playwright MCP 工具目录，包括 `browser_navigate`、`browser_click`、`browser_snapshot`、`browser_take_screenshot`、`browser_start_recording` 和 `browser_stop_recording`。工具名和 JSON schema 使用固定上游版本。停止录制会返回 trace 路径；截图走常规图片管道，需要支持图片的模型路由。

#### Token 影响

拥有浏览器连接的会话，每次请求都会带上完整的 MCP 工具目录和服务端说明。页面快照和截图会把文本或获准的图片加入会话历史；录制本身不增加逐轮文本。

#### KV Cache 影响

目录不变时保留工具定义前缀。页面内容和工具结果追加到历史；提供方或目录变化会降低前缀复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **Linux Desktop 之外默认关闭** — 需要在配置中启用，或使用首次启动即挂载的 Linux Desktop 安装包。
- **仅支持 Chromium** — 本组合包不能选择 Firefox 或 WebKit。
- **浏览器状态仅限会话** — 重载后恢复会得到新的浏览器，Cookie 和已打开页面不会恢复。
- **录制是 Playwright trace** — 不是视频；请使用 Playwright trace viewer 查看。
- **上游契约为实验性** — `@playwright/mcp` 固定版本，不提供 DSH 稳定性承诺。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

组合包只包含配置，不增加代码。Desktop 的 Linux 安装包在运行时准备完成后执行 `apps/desktop/scripts/prepare-playwright-browser.ts`；仅在离线构建且另行提供 Chromium 时设置 `DSH_DESKTOP_SKIP_PLAYWRIGHT_BROWSER=1`。

</details>
