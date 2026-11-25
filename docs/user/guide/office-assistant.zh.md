# 文件标签、整理与待办

[English](office-assistant.md) | 中文

## 概述

可选的办公助手能力包括集中式标签库、按规则整理文件夹、确认卡片、持久化个人待办和旧 TagSpaces 数据导入。标签与待办都存放在 Harness 数据中，不会在被管理目录里写入边车文件。发布配置默认关闭这些实验 bundle，请从插件页启用。

## 目录

- [启用能力](#enable)
- [给文件和文件夹打标签](#tags)
- [整理收件箱](#organize)
- [在聊天里确认](#confirm)
- [定时运行收件箱整理](#schedule-pass)
- [管理个人待办](#tasks)
- [导入旧 TagSpaces 数据](#import)
- [编辑或撤回已发送消息](#retract)
- [当前边界](#boundaries)
- [进一步探索](#further-exploration)

<a id="enable"></a>
## 启用能力

打开**插件页**，在 Official 分组启用**文件标签**与**任务**。文件标签会挂载标签库、标签工具、右侧栏标签页、整理器、整理确认卡片与 Office/PDF 文本读取；任务会挂载任务服务、六个任务工具与右侧栏任务页。

两个 bundle 都写入 Harness 主目录，不写入你管理的文件夹。禁用 bundle 会移除工具与面板，已存数据保留。

<a id="tags"></a>
## 给文件和文件夹打标签

让模型给某个路径打标签，或使用右侧栏“标签”页。标签是一个单词；`and`、`or`、`not` 保留给表达式。目录也可以打标签。搜索接受 `project and not archive` 这样的表达式。

基础工具是 `filetags_tag`、`filetags_untag`、`filetags_search`、`filetags_list`；第五个 `filetags_import` 见下文。

<a id="organize"></a>
## 整理收件箱

让模型整理收件箱，例如：

> 预览把 `~/Inbox` 的文件移到 `~/Documents/Library`：PDF 进 Contracts 并打 contract 标签，表格进 Sheets 并打 finance 标签，其余进 Unsorted 并打 triage 标签。

模型会调用 `organize_preview`，传入 `destination_root`、有序规则、`others_target` 和可选标签。预览列出每一次移动和跳过；在 `organize_apply` 之前不会移动任何文件。移动绝不覆盖已存在的目标，冲突会报告并保持原样。`organize_undo` 逆向恢复已完成批次，`organize_history` 重启后仍可查看历史。

<a id="confirm"></a>
## 在聊天里确认

挂载整理器与 action cards 后，预览批次会在答案下方显示卡片。**执行**运行批次，**取消**不动文件，**撤销**恢复已完成批次。定时或无界面运行直接调用工具。

<a id="schedule-pass"></a>
## 定时运行收件箱整理

没有独立的文件监视器或调度器。使用现有 Schedule 工具：创建一个任务，指令依次运行 `organize_preview`、`organize_apply`，并汇报移动、跳过与失败的文件。工作日 09:00 是常见选择；错过的触发只补最近一次。

<a id="tasks"></a>
## 管理个人待办

让模型添加任务，例如：

> 下周五提醒我交 Q4 报告。关联 `~/Work/report.docx`，标签 work，优先级高。

模型调用 `task_add`；`task_list` 按 open/done/all、标签、文件路径和数量过滤；`task_update` 修改字段；`task_complete` 完成或重新打开；`task_remove` 只删除记录。右侧栏任务页把未完成任务分成逾期、今天、本周、以后，已完成放在“已完成”，并支持快速添加与勾选完成。

任务不是重复提醒。需要重复时，用 Schedule 创建定时任务来调用任务工具或发送提醒。

<a id="import"></a>
## 导入旧 TagSpaces 数据

`filetags_import` 只读旧 TagSpaces 工作库：解析 `.ts/tsi.json` 标签记录与文件名中的 `[tag another]` 分组。先用 `confirm: false` 查看扫描文件数、标签与样例；再用 `confirm: true` 只写中央标签库。它不导入缩略图、历史、颜色或带空格的标签，也不重命名文件。

<a id="retract"></a>
## 编辑或撤回已发送消息

已完成的用户消息悬停时有**编辑**与**撤回**。两者都会把该消息、它的回答以及之后的全部轮次从模型上下文和聊天记录中隐藏，只保留一条“消息已撤回”标记。编辑会把原文放回输入框；发送后开始新的一轮。原始 Session 日志保留事件用于审计，因此这不是安全删除，已执行工具的外部副作用也不会撤销。

<a id="boundaries"></a>
## 当前边界

- 标签是集中式的；文件移动尚未跟随。在整理器之外移动已打标签文件后，需要对新路径重新打标签。
- 整理规则按路径与文件名，不按文件夹标签。
- 待办是单一扁平列表：没有项目、子任务、负责人或重复规则。
- 待办上的文件是引用；面板不跟随移动。
- 撤回只恢复文本，不恢复附件，也不是安全擦除。
- 标签页与任务页在打开时和自身操作后刷新。

<a id="further-exploration"></a>
## 进一步探索

- [filetags 包](../../../packages/experimental/filetags/README.zh.md)
- [file-organizer 包](../../../packages/experimental/file-organizer/README.zh.md)
- [tasks 包](../../../packages/experimental/tasks/README.zh.md)
- [任务面板](../../../packages/experimental/client-ui-tasks/README.zh.md)
- [定时提醒](schedule.zh.md)
