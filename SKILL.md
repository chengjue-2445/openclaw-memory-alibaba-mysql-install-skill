---
name: openclaw-memory-alibaba-mysql-install-skill
description: 一键安装阿里云 RDS MySQL 8.0 记忆插件环境（购买实例、开启向量、建库建账号、白名单、写入 ~/.bashrc 与 OpenClaw 配置目录 .env）。必须先与用户确认后再创建，禁止未获同意使用 --yes。全流程约 10 分钟。遇错即退出不重试。需配置 AK/SK。请将脚本 stdout/stderr 完整反馈给用户。
keywords: openclaw, memory, rds, aliyun, mysql, 8.0, 向量, 安装
---

# OpenClaw Memory 阿里云 MySQL 安装 Skill

本 Skill 用于**一键安装 ALIBABA RDS 记忆插件**所需环境：在阿里云上购买 MySQL 8.0 实例、开启向量支持、创建数据库与账号、配置白名单；将连接信息写入 `~/.bashrc`（`export`，便于交互式 shell），并在由 `openclaw config file | grep openclaw.json` 解析出的 OpenClaw 配置目录下写入 `.env`（纯 `KEY=VALUE`，供网关等读取）。

## 重要提示

- **本 SKILL 会购买阿里云 RDS 实例，可能产生费用。** 将创建一个**基础版 Serverless 实例**，起步成本低；可在控制台换成高可用版本或其他固定规格。
- **必须先与用户确认后再创建实例。** 脚本会先提示费用与流程，**必须等待用户输入 y/yes 才继续**；**禁止**在未获用户明确同意的情况下使用 `--yes` 或自动开始创建。**整过程约需 10 分钟**，请提前告知用户。
- **遇错即退出，不重试。** 脚本与调用方均不应自动重试；出错时请将错误完整反馈给用户，由用户决定是否重新执行。
- 安装流程会：检查 `DASHSCOPE_API_KEY` → 创建 RDS MySQL 8.0 Serverless 实例、建库建账号、白名单、写 `~/.bashrc` 与配置目录 `.env` → 执行 `npm install openclaw-memory-alibaba-mysql` → 在 `~/.openclaw/openclaw.json` 中注册插件（不覆盖已有插件）。

## 调用本 Skill 时（面向 AI/Agent）

- **必须先与用户确认后再执行，禁止未获同意就创建实例。** 脚本会打印费用与流程说明，**必须由用户输入 y/yes 后才可继续**；**不得**在用户未明确同意前使用 `--yes` 或自动执行创建。即便在阿里云 ECS 内可自动带出地域/VPC 等参数，也**必须先完成用户确认**。全流程约 **10 分钟**，请事先告知用户。
- **凭证**：AK/SK、`DASHSCOPE_API_KEY` 仅从**环境变量**读取，不要从 LLM 输入中提取。
- **购买参数**：若在**阿里云 ECS 内**运行，脚本**一律采用 ECS 元数据**（加固模式）的地域、VPC、交换机、可用区，**忽略**调用输入或环境变量中的购买参数。若未在 ECS 内，需从调用输入传入 JSON（`region_id`, `vpc_id`, `vswitch_id`, `zone_id`）。示例命令（非 ECS 且**用户已确认后**）：  
  `python scripts/install.py --yes '{"region_id":"cn-hangzhou","vpc_id":"vpc-xxx","vswitch_id":"vsw-xxx","zone_id":"cn-hangzhou-h"}'`
- **请将安装脚本的标准输出与标准错误实时完整反馈给调用者。** 脚本会输出带 `[安装]` 前缀的各阶段日志（含创建实例阶段每 10 秒一条的状态），调用者需要看到这些日志以了解进度与结果；若脚本报错，也请将 stderr 或退出码一并反馈，便于排查。
- **不重试**：脚本**遇错即退出**，不做任何自动重试。调用方（Agent/平台）**不要**在脚本失败后自动重试，应把错误信息完整反馈给用户，由用户决定是否重新执行。
- **安装完成后的提示**：安装成功时告知用户执行 **`openclaw gateway restart`**（或等价重启方式）使插件生效即可。**不要**再要求用户手动执行 `source ~/.bashrc`；凭证与连接信息已由脚本写入配置目录下的 `.env`。

## 何时使用

- 用户需要为 OpenClaw Memory 准备阿里云 RDS MySQL 8.0 环境，且接受购买 RDS 可能产生的费用。
- 用户希望一条命令完成：买实例 → 开向量 → 建库建账号 → 写白名单 → 写 `~/.bashrc` 与 OpenClaw 配置目录 `.env`。

## 本 Skill 的安装与路径

本 Skill 是**独立项目**，需从**项目根目录**运行（即包含 `scripts/install.py` 和 `skill.yaml` 的目录），**不会**被安装到 `node_modules/openclaw/skills/` 下。

- **正确**：在 OpenClaw 或 Agent 中配置本 Skill 时，将 **skill 根路径** 指向本项目的实际目录（例如克隆后的 `openclaw-memory-alibaba-mysql-install-skill` 所在路径），执行入口为 `python scripts/install.py`，且**当前工作目录**为该项目根目录。
- **错误**：从 `node_modules/openclaw/skills/memory-alibaba-mysql-install/` 或类似路径解析本 Skill 会报「File not found」，因本 Skill 不在此处。

若通过 OpenClaw 网关调用，请确保该 Skill 的注册配置中 **path / cwd** 指向本项目根目录，以便 `scripts/install.py` 能被正确找到并执行。

## 前置条件

1. **Python**：运行 `scripts/install.py` 需 Python 3.8+，并安装本目录下 `requirements.txt` 中的依赖（仅需 alibabacloud-rds20140815 与 alibabacloud_tea_openapi，不依赖 rds-openapi-skill）。
2. **凭证**：必须提供阿里云 AK/SK 及百炼 API Key 环境变量：
   - `ALIBABA_CLOUD_ACCESS_KEY_ID`
   - `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
   - `DASHSCOPE_API_KEY`（记忆插件使用百炼做向量与对话，可前往 [阿里巴巴百炼平台](https://bailian.console.aliyun.com) 申请）
   - （可选）`ALIBABA_CLOUD_SECURITY_TOKEN`（STS）
3. **Node.js / npm**：安装脚本会在 `~/.openclaw/plugins` 下执行 `npm install openclaw-memory-alibaba-mysql` 并写入 `~/.openclaw/openclaw.json` 注册插件，需本机已安装 Node.js 与 npm。
4. **购买参数**：仅需地域与网络 4 项（实例固定为基础版 Serverless）：
   - **在阿里云 ECS 内运行**：脚本**优先采用 ECS 元数据**（[加固模式](https://help.aliyun.com/zh/ecs/user-guide/view-instance-metadata)），有则一律使用其 `region_id`、`vpc_id`、`vswitch_id`、`zone_id`，忽略传入的 JSON 或环境变量。**多网卡时**使用**默认路由所在网卡**的 VPC 与交换机（用 `ip route get` 的 src 与各网卡 `primary-ip-address` 匹配），确保 RDS 建在 ECS 主出口所在 VPC。**RDS 实例 IP 白名单**在同网卡上读取 `vswitch-cidr-block`，优先写入**整段交换机 CIDR**（若元数据未返回则回退为与原先一致的本机 IP / 公网 IP 逻辑）。
   - **非 ECS 环境**：需由调用输入（JSON）、环境变量或交互提供 4 项；示例：  
     `python scripts/install.py --yes '{"region_id":"cn-hangzhou","vpc_id":"vpc-xxx","vswitch_id":"vsw-xxx","zone_id":"cn-hangzhou-h"}'`  
     或设置 `OPENCLAW_RDS_REGION`、`OPENCLAW_VPC_ID`、`OPENCLAW_VSWITCH_ID`、`OPENCLAW_ZONE_ID`，或在交互终端下逐项输入。安装后可能需在 `~/.openclaw/openclaw.json` 中修改数据库连接域名以保证网络可达。

## 配置 entries（推荐）

在 OpenClaw 的 `~/.openclaw/openclaw.json` 的 `skills.entries` 中为 `openclaw-memory-alibaba-mysql-install-skill` 配置 `env`，写入 AK/SK 及上述购买参数（可选）：

```json
{
  "skills": {
    "entries": {
      "openclaw-memory-alibaba-mysql-install-skill": {
        "enabled": true,
        "env": {
          "ALIBABA_CLOUD_ACCESS_KEY_ID": "你的 AccessKey ID",
          "ALIBABA_CLOUD_ACCESS_KEY_SECRET": "你的 AccessKey Secret",
          "OPENCLAW_RDS_REGION": "cn-hangzhou",
          "OPENCLAW_VPC_ID": "vpc-xxx",
          "OPENCLAW_VSWITCH_ID": "vsw-xxx",
          "OPENCLAW_ZONE_ID": "cn-hangzhou-h",
          "DASHSCOPE_API_KEY": "你的百炼 API Key"
        }
      }
    }
  }
}
```

购买参数也可由调用方通过命令行 JSON 传入（见上文「使用方式」）；仅需 4 项（地域与网络），实例固定为基础版 Serverless。

## 使用方式

- **凭证**：`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`DASHSCOPE_API_KEY` 必须通过**环境变量**配置（不可从 LLM 输入传入）。
- **购买参数**：由**调用输入**传入（与 rds-openapi-skill 一致），即 LLM/Agent 构造的 JSON 作为脚本参数；未传时再从环境变量或交互输入读取。

1. 确认已配置 AKSK 与 DASHSCOPE_API_KEY 环境变量。
2. **务必先让用户确认**：运行 `python scripts/install.py`（可不带参数），脚本会提示费用与流程，**必须等待用户输入 y/yes 后才继续**；不得在用户未同意前使用 `--yes`。全流程约 10 分钟。
3. 用户确认后，若需带参数可执行：  
   `python scripts/install.py --yes '<JSON>'`（`<JSON>` 含 `region_id`, `vpc_id`, `vswitch_id`, `zone_id`）；或在无 `--yes` 时由脚本从环境变量或交互读取 4 项。
4. 等待实例创建、轮询 Running、开启向量、建库建账号、写白名单、追加 `~/.bashrc` 并在 OpenClaw 配置目录写入 `.env`；脚本会在子 shell 内执行一次 `source ~/.bashrc`（不影响对用户说明）。随后在 `~/.openclaw/plugins` 执行 `npm install openclaw-memory-alibaba-mysql` 并合并写入 `~/.openclaw/openclaw.json` 注册插件（见下节）。
5. 安装完成后请执行 **`openclaw gateway restart`**（或等价方式）以使插件读取 `.env` 并生效；**无需**提示用户 `source ~/.bashrc`。

## 更新插件（update.py）

- **用途**：将 **plugins.load.paths 里已配置的 openclaw-memory-alibaba-mysql 插件目录内的文件** 更新到最新版本（通过 `npm install openclaw-memory-alibaba-mysql`）。**不修改** `~/.openclaw/openclaw.json` 中的 path 配置本身。
- **使用场景**：已安装过本插件，只想升级插件代码时，在项目根目录执行：  
  `python scripts/update.py`
- **已安装时**：若再次运行 `python scripts/install.py` 且检测到已安装（memory 槽位已是本插件），脚本会提示「是否更新 openclaw-memory-alibaba-mysql 插件？(y/yes 更新，其他退出)」；输入 y/yes 或带 `--yes` 将执行 **update.py** 完成更新，然后退出。

## npm 安装后如何写入 openclaw 配置（精准说明）

脚本在**用户确认并完成 RDS 创建与白名单等步骤后**会执行：

1. **npm 安装位置**  
   在目录 `~/.openclaw/plugins` 下执行 `npm install openclaw-memory-alibaba-mysql`（若不存在会先 `npm init -y`）。  
   插件安装路径为：**`~/.openclaw/plugins/node_modules/openclaw-memory-alibaba-mysql`**（脚本会解析为该目录的绝对路径 `plugin_path`）。

2. **写入 `~/.openclaw/openclaw.json`**  
   脚本读取已有的 `~/.openclaw/openclaw.json`（不存在则当作空对象），在 **`plugins`** 下做**合并**（不覆盖已有其他插件）：
   - **`plugins.load.paths`**：若 `plugin_path` 不在数组中则追加；
   - **`plugins.slots.memory`**：设为 `"openclaw-memory-alibaba-mysql"`（若已有 memory 则覆盖为本插件）；
   - **`plugins.entries["openclaw-memory-alibaba-mysql"]`**：写入或更新为 `{ "enabled": true, "config": { "mysql": { "host": "${MYSQL_HOST}", ... }, "embedding": { ... }, "llm": { ... }, "captureMaxChars": 50000, ... } }`（config 内使用环境变量占位符 `${MYSQL_HOST}`、`${MYSQL_USER}`、`${MYSQL_PASSWORD}`、`${DASHSCOPE_API_KEY}`）；
   - **`plugins.allow`**：若数组中无 `"openclaw-memory-alibaba-mysql"` 则追加。

   其他已有 `plugins` 配置（其他 paths、slots、entries、allow）保持不变。

## 实时日志输出要求

本 Skill 执行时间较长（**约 10 分钟**），**必须实时输出进度日志**，避免用户长时间无反馈等待。

### 执行要求

1. **使用无缓冲模式执行脚本**
   ```bash
   PYTHONUNBUFFERED=1 python3 scripts/install.py [参数]
   ```
   或 `python3 -u scripts/install.py [参数]`。

2. **Agent 必须定期轮询日志**
   - 用 exec + poll 实时推送日志
   - 执行后每 5–10 秒调用 process poll；
   - 有新输出立即转发给用户；
   - 不要等脚本执行完成才一次性输出。


3. **聊天页面实时推送（关键！）**
   - **每次轮询拿到新日志后，必须立即发消息到聊天页面**，不能只在后台轮询不推送；
   - 示例流程：
     ```
     exec command="PYTHONUNBUFFERED=1 python3.8 scripts/install.py --yes", background=true
     → 立即开始循环：
        process poll (timeout=5000) → 拿到新日志 → 发消息给用户 → 继续 poll
     ```
   - 用户应在聊天页面看到类似这样的实时滚动输出：
     ```
     [安装] ⏳ CreateDBInstance 仍在处理中（已等待 10 秒）
     [安装] ⏳ CreateDBInstance 仍在处理中（已等待 20 秒）
     [安装] 实例已创建，DBInstanceId: rm-xxx
     ```
   - **错误做法**：后台轮询但不发消息，等脚本结束后才一次性输出所有日志（用户看到黑屏等待）。

4. **脚本已启用行缓冲**
   - 已配置 `sys.stdout.reconfigure(line_buffering=True)`（Python 3.7+）；
   - 所有关键步骤均有 `print(..., flush=True)`。

### 预期日志格式

用户应看到类似以下的实时进度：

```
[安装] 阶段：创建 RDS MySQL 8.0 实例（预计 3–5 分钟）...
[安装] ⏳ CreateDBInstance 仍在处理中（已等待 10 秒）
[安装] ⏳ CreateDBInstance 仍在处理中（已等待 20 秒）
[安装] 实例已创建，DBInstanceId: rm-xxx
[安装] 等待实例状态变为 Running（每 10 秒检查并输出状态）...
[安装] 创建实例阶段：已等待 30 秒，当前状态: Creating
[安装] 实例已 Running（耗时 93 秒）。
...
```

### 禁止行为

- 执行脚本后不轮询，等退出才输出；
- 超过 30 秒无任何日志反馈；
- 吞没中间进度，只报告最终结果。

## 安装过程日志

脚本在各阶段会输出带 `[安装]` 前缀的日志；执行时建议无缓冲（见「实时日志输出要求」）。阶段顺序：Python 校验、已安装检测、**用户确认（y/yes）**、AKSK / DASHSCOPE 校验、购买参数（或 ECS 元数据）、创建实例（API 调用）、**等待实例 Running（每 10 秒输出一次状态）**、开启向量、建库、建账号与授权、白名单、写入 `~/.bashrc` 与配置目录 `.env`、脚本内 `source ~/.bashrc`（子 shell）、npm 安装、合并写入 openclaw.json 插件配置、安装完成。

## ~/.bashrc 与 OpenClaw 配置目录 `.env`

**`~/.bashrc`**：安装成功后会追加如下内容（注释 + `export`，便于新开交互式 shell 时使用）：

```bash
# OpenClaw Memory RDS
export MYSQL_HOST="<实例连接地址>"
export MYSQL_USER="openclaw_memory"
export MYSQL_PASSWORD="<随机 8 位密码>"
export MYSQL_DATABASE="openclaw_memory"
```

**配置目录 `.env`**：与上表同值的 `MYSQL_*` / `DASHSCOPE_API_KEY` 另以纯 `KEY=VALUE` 形式写入 `openclaw.json` 所在目录下的 `.env`（路径由 `openclaw config file | grep openclaw.json` 解析；解析失败时回退 `~/.openclaw`）。示例：

```bash
# OpenClaw Memory RDS
DASHSCOPE_API_KEY="sk-..."
MYSQL_HOST="<实例连接地址>"
MYSQL_USER="openclaw_memory"
MYSQL_PASSWORD="<随机 8 位密码>"
MYSQL_DATABASE="openclaw_memory"
```

## 注意事项

- 所有写操作（创建实例、建库、建账号、改白名单）会真实变更阿里云资源，请确认账号权限与计费。
- 若 ModifyDBInstanceVectorSupportStatus 在您使用的 SDK 版本中不可用，脚本会尝试通过 OpenAPI 调用并给出说明。
