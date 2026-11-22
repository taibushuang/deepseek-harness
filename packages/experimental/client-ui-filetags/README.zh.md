---
description: "右侧栏标签面板：过滤标签、按标签表达式搜索，并通过 fileTags 远程命名空间修改路径的标签。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-filetags

[English](README.md) | 中文

## 概述

右侧栏的标签页。它列出每个标签及其路径数量，随输入过滤列表，执行 `project and not archive` 这类标签表达式，并就地修改单个路径的标签。在 Desktop 宿主上，每个结果还能用原生应用打开。读写都通过 [filetags](../filetags/README.zh.md) 拥有的 `fileTags` 远程命名空间完成；面板本身不保存数据。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在 Web 或 Desktop 的插件页启用[文件标签 bundle](../filetags-bundle/README.zh.md)。该 bundle 会把此面板与宿主服务及其模型工具一起挂载。打开右侧栏，从添加菜单选择“标签”，然后选择标签或输入表达式。

点击标签会把其加入表达式；再选一个标签会扩展这个合取。在表达式字段输入会替换标签选择。宿主对结果上限为 200 行，面板按路径在本地过滤。每行列出其标签，可添加在行内输入的标签名，也可通过 × 控件移除标签。写入成功后才刷新该行与标签计数；写入失败会保留原状态并报告。

当宿主回答可以把路径交给桌面应用时，每行还会显示“打开”，用默认应用打开存储的绝对路径。Web、没有桌面回答、或未挂载 [open-in-app](../../client/ui-open-in-app/README.zh.md) 包时，该按钮隐藏。面板只向宿主发送绝对路径。

<a id="understand-the-implementation"></a>
## 理解实现

`src/client/mount.ts` 用 `ctx.remote.$mount` 挂载生成的 `fileTags` 贡献，读取可选的 `ctx.openInApp` 服务，然后注册 `tags` 标签页类型、其正文位置和八种语言字典。`createFace` 解开 `RemoteResult`，把参数错误映射为对应的本地化提示，并在服务缺失或没有桌面时隐藏打开动作。`src/client/FiletagsBody.tsx` 维护一次防抖的表达式查询和一个代际计数：写入成功后计数递增，从而重新加载标签列表并重跑当前搜索。`src/client/presentation.ts` 存放纯函数，包括遵循 Client 搜索规则的两个内存过滤器——标签名按模糊键匹配，路径按连续子串匹配。

<a id="model-experience"></a>
## 模型体验

### 标签面板

#### 模型所见内容

无。面板通过 `fileTags` 远程命名空间读写标签记录；它不发送模型请求，也不新增 Session 事件。

#### Token 影响

无直接 Token 影响。面板修改标签数据库，后续的文件标签工具调用会读取它，但它本身不贡献提示词或工具 schema。

#### KV 缓存影响

不会失效。面板不增加请求 token；面板打开期间，Session 的提示词前缀与工具 schema 保持不变。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **打开需要 Desktop 宿主** — 该动作从 `ctx.openInApp` 读取每页一次的回答；Web 会隐藏它，打开失败只报告本地化错误而不重试。
- **没有缺失路径状态** — 数据库记录了 `missing` 标志，但移动跟随尚未实现，面板暂不标记过期行。
- **没有虚拟滚动** — 宿主把一次搜索限制为 200 行，列表全部渲染。
- **仅绝对路径** — 面板显示存储的绝对路径，不会缩略为 Session 工作区相对路径。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

无。

</details>
