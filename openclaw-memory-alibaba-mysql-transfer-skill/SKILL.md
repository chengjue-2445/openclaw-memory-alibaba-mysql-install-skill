---
name: openclaw-memory-alibaba-mysql-transfer-skill
description: 当用户说「迁移本地记忆到 RDS 记忆插件」等类似表述时，读取 OpenClaw 配置目录下 workspace/MEMORY.md，逐行调用 memory_store 写入向量库。执行前需校验 RDS 记忆插件已配置。
keywords: 迁移, 记忆, MEMORY.md, RDS, 导入, 本地记忆, 记忆迁移
---

# OpenClaw Memory 迁移 SKILL

本 Skill 用于将 **workspace/MEMORY.md** 中的本地记忆逐条导入到 **openclaw-memory-alibaba-mysql** 的 RDS 向量库中。由 Agent 在用户表达迁移意图时执行，使用 `read` 与 `memory_store` 工具完成。

## 何时使用

用户意图为以下之一时触发：

- 「迁移本地记忆到 RDS 记忆插件」
- 「导入 MEMORY.md 到记忆」
- 「把 workspace 里的记忆导入 RDS」
- 「将 MEMORY.md 写入向量库」

## 执行步骤（Agent 必须遵循）

### 1. 校验 RDS 记忆插件

- 读取 OpenClaw 配置文件（路径见下节「解析配置目录」）
- æson`，从输出中提取包含 `openclaw.json` 的路径
- 取该路径的目录部分（dirname）作为配置目录
- 若命令失败或无法解析，回退使用 `~/.openclaw`

### 3. 读取 MEMORY.md

- 路径：`{配置目录}/workspace/MEMORY.md`
- 使用 `read` 工具读取文件内容
- **若文件不存在**：告知用户「workspace/MEMORY.md 不存在，请先创建该文件并填入待迁移的记忆（每行一条）」，并终止

### 4. 解析与导入

- 按行拆分文件内容，过滤空行（`trim` 后为空则忽略）
- 对每条非空行：
  - 调用 `memory_store`，参数：
    - `text`：该行内容（trim 后）
    - `category`：`user_memory_fact`（或省略，使用插件默认）
  - 去重、冲突检测由记忆插件内部逻辑处理（若配置了 `memory_duplication_conflict_process` 则会执行）
- 若某行调用失败：记录该行内容，继续处理其余行

### 5. 反馈

- 汇总成功导入条数
- 若有失败，列出失败条及原因

## 边界æid>.tools.allow`（非空），则 `memory_store` 与 `read` 必须在该白名单中，否则无法调用。未配置 allow 时默认允许所有工具。示例（在 `openclaw.json` 中）：
  ```json
  "agents": { "defaults": { "tools": { "allow": ["read", "memory_store"] } } }
  ```
- `workspace/MEMORY.md` 格式：每行一条记忆，空行忽略

