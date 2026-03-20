---
name: openclaw-memory-alibaba-mysql-install-skill
description: 安装 OpenClaw 阿里云 RDS 记忆插件环境。须先满足依赖再运行 install.py。注意：Skill 可能未被工作区加载；仅升级插件用 update.py，勿误跑 install.py（未检测到 memory 槽位时会走完整装机并可能新建 RDS）。建议密钥写在 ~/.openclaw/.env；改后常需 gateway 重启。须用户同意；非交互必须 --yes。
keywords: openclaw, memory, rds, aliyun, mysql, install.py
---

# OpenClaw Memory 阿里云 MySQL 安装 Skill

## 何时使用

- 用户要**安装或准备 OpenClaw 的阿里云 RDS 记忆插件**（`openclaw-memory-alibaba-mysql`）所需环境时使用本 Skill；具体创建规格与步骤由 **`scripts/install.py`** 完成，接受可能产生的**云资源费用**即可。

## 风险与用户提示（运行前告诉用户）

- 脚本会调用阿里云 API **创建 RDS 实例**等，可能**计费**；文案与脚本一致：基础版 Serverless、起步成本相对较低，之后可在控制台改规格。
- 创建与就绪轮询等步骤耗时较长，**约数分钟到十余分钟量级**（脚本内创建 API 单次最长等待 300 秒，实例变 Running 最长轮询 3600 秒）。
- **遇错即退出**，脚本**不做自动重试**；Agent 也**不要**自动重试，应把**完整输出**给用户再决定下一步。

**用户同意与 `--yes`**

- 交互终端：可先运行 `python3 scripts/install.py`（不带 `--yes`），脚本打印说明后需用户输入 **y / yes** 才继续。
- **非交互**（无 TTY、stdin 无法输入）：**必须**在用户已明确同意后加上 **`--yes`**。否则确认步骤读到 EOF 会当作「非 y」，脚本打印「已取消」并以 **0** 退出，**不会**创建资源。
- **禁止**在用户未明确同意创建资源时使用 `--yes`。

**Skill 找不到，以及「更新」误走完整安装**

- 本 Skill 来自**独立仓库**，OpenClaw / Agent **不一定**能自动发现；若工作区未包含本目录、或未通过 `skills.load.extraDirs` / 工作区 `skills` 等正确挂载，可能出现**找不到本 Skill**，进而乱猜命令或错误路径。
- **`install.py` 是否进入「仅更新插件」分支**，仅当本机 **`~/.openclaw/openclaw.json`** 中存在 **`plugins.slots.memory` 且值为 `openclaw-memory-alibaba-mysql`** 时成立（与脚本内 `_already_installed()` 一致）。否则脚本按**首次安装**执行，可能再次 **CreateDBInstance、产生费用**。常见误判场景：在**另一台机器**上跑、配置文件路径不是 `~/.openclaw/openclaw.json`、或尚未把 memory 槽位指到本插件。
- 用户明确只要**升级插件 npm 包、不碰 RDS**：在**本仓库根目录**执行 **`python3 scripts/update.py`**（可用仓库**绝对路径**，不依赖 Skill 是否被网关索引）。**不要**用 `install.py --yes` 代替，除非已确认上述 `openclaw.json` 条件满足且用户接受安装脚本的逻辑。
- Agent：用户说「更新记忆插件」时，优先确认意图是 **RDS 装机**还是 **仅 npm 升级**；后者应直接定位并执行 **`scripts/update.py`**，避免默认调用 `install.py` 并带 `--yes` 导致误建新实例。

## 环境变量（必须由运行环境注入，勿从对话粘贴真实密钥）

**建议写入 OpenClaw 配置目录下的 `.env`**

- 将 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`DASHSCOPE_API_KEY`（以及非 ECS 时可选的 `OPENCLAW_*` 四项等）写在 **OpenClaw 使用的配置目录**里的 **`.env`** 中，常见路径为 **`~/.openclaw/.env`**（若 `openclaw.json` 不在默认位置，以实际配置目录为准）。
- 这样与网关、技能进程加载环境变量的方式一致；**修改 `.env` 后通常需要执行 `openclaw gateway restart`（或等价重启）**，正在运行的网关才会重新读到新值。
- 安装脚本仍会从**当前进程的环境变量**读取上述变量（由 shell 已 `export`、或由启动器注入 `.env` 决定）；勿在聊天中传输真实密钥。

**必填（脚本会校验，缺失则退出）**

| 变量 | 说明 |
|------|------|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey ID |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `DASHSCOPE_API_KEY` | 百炼 API Key；说明见脚本报错文案或 [百炼控制台](https://bailian.console.aliyun.com) |

**可选**

| 变量 | 说明 |
|------|------|
| `ALIBABA_CLOUD_SECURITY_TOKEN` | STS 时使用 |

**购买参数（地域 + 网络四项，与代码中 `PARAM_KEYS` 一致）**

仅在 **脚本判定不在阿里云 ECS 上**（拉取 ECS 元数据失败）时需要，来源优先级为：**命令行 JSON 参数** → **环境变量** → **交互输入**（交互时逐项询问）。

| 环境变量 | 对应脚本内键名 |
|----------|----------------|
| `OPENCLAW_RDS_REGION` | `region_id` |
| `OPENCLAW_VPC_ID` | `vpc_id` |
| `OPENCLAW_VSWITCH_ID` | `vswitch_id` |
| `OPENCLAW_ZONE_ID` | `zone_id` |

**在阿里云 ECS 上**：若能读到加固元数据，脚本**固定使用元数据中的地域与 VPC/交换机/可用区**（多网卡时按默认路由匹配网卡），**忽略**命令行 JSON 与上述四项环境变量（见 `install.py` 中 `ecs_params` 分支）。

**仅在「账号已存在」等少数路径**：脚本可能要求设置 **`OPENCLAW_MEMORY_MYSQL_PASSWORD`**（用于写回 `~/.bashrc` / `.env`），否则退出；一般首次创建不会出现。

### 在 OpenClaw 里为本 skill 注入环境（示例）

在 `~/.openclaw/openclaw.json` 的 `skills.entries` 中配置 `env`（密钥由用户在本机填写）：

```json
{
  "skills": {
    "entries": {
      "openclaw-memory-alibaba-mysql-install-skill": {
        "enabled": true,
        "env": {
          "ALIBABA_CLOUD_ACCESS_KEY_ID": "...",
          "ALIBABA_CLOUD_ACCESS_KEY_SECRET": "...",
          "DASHSCOPE_API_KEY": "...",
          "OPENCLAW_RDS_REGION": "cn-hangzhou",
          "OPENCLAW_VPC_ID": "vpc-xxx",
          "OPENCLAW_VSWITCH_ID": "vsw-xxx",
          "OPENCLAW_ZONE_ID": "cn-hangzhou-h"
        }
      }
    }
  }
}
```

非 ECS 场景下，四项也可通过**脚本的位置参数 JSON** 传入（见下节），与 `OPENCLAW_*` 二选一即可（ECS 上 JSON 仍会被忽略）。

## 运行脚本前：先解决依赖（必做）

**在运行 `scripts/install.py` 之前**，须先完成下列项并确认无报错；**不要**在依赖未就绪时启动安装，以免中途失败、留下半套资源或状态。

1. **Python**：版本 **≥ 3.8**（`python3 --version`）。在 **本仓库根目录**执行 **`pip install -r requirements.txt`**（或 `pip3 …`），确保 `alibabacloud-rds20140815`、`alibabacloud_tea_openapi` 可导入（可选自检：`python3 -c "from alibabacloud_rds20140815.client import Client"`）。
2. **Node.js / npm**：已安装且可在 PATH 中调用（`node --version`、`npm --version`）；脚本会在 `~/.openclaw/plugins` 下执行 `npm install`。
3. **环境变量**：运行脚本的 **shell / 进程**已能读到上文「必填」变量；非 ECS 且**非交互**时，还须提前备好 **`OPENCLAW_*` 四项**或位置参数 JSON。
4. **`openclaw` CLI（建议）**：若希望把连接信息写到与 `openclaw.json` 同目录的 `.env`，需 **`openclaw` 在 PATH**；否则脚本会回退写到 `~/.openclaw`。
5. **网络与权限**：本机可访问阿里云 API。

全部就绪后，再进入下一节执行脚本。

## 如何执行（唯一入口）

1. **工作目录**：本仓库根目录（含 `scripts/install.py`、`requirements.txt`），且**已按上一节完成依赖**。
2. **已安装检测（跑 `install.py` 前先看）**：仅当 **`~/.openclaw/openclaw.json`** 中 **`plugins.slots.memory` 为 `openclaw-memory-alibaba-mysql`** 时，再运行 `install.py` 才会进入「是否仅更新插件」；确认 **y/yes** 或 **`--yes`** 会转调 **`scripts/update.py`** 并退出。**若不满足该条件，本条不生效**，脚本会走完整安装（见上文「更新误走完整安装」）。若用户只要升级插件包、不要动 RDS，应直接用 **`python3 scripts/update.py`**，见本节末段。
3. **只运行安装脚本**：`python3 scripts/install.py`（或 `python`）。**不要**为同一目的再手动建实例、单独 npm、手改 `~/.openclaw/openclaw.json` 完成同一套安装。
4. **日志**：建议使用 `PYTHONUNBUFFERED=1 python3 scripts/install.py` 或 `python3 -u ...`，并把 **stdout/stderr 完整**交给用户。
5. **参数形式**（与 `argparse` 一致）：可选 **`--yes` / `-y`**；可选**位置参数** `params_json`（一整段 JSON 字符串，须含 `region_id`、`vpc_id`、`vswitch_id`、`zone_id`）。示例（用户已同意、非交互）：  
   `python3 scripts/install.py --yes '{"region_id":"cn-hangzhou","vpc_id":"vpc-xxx","vswitch_id":"vsw-xxx","zone_id":"cn-hangzhou-h"}'`
6. **非 ECS**：脚本会提示安装后**可能**需在 **`~/.openclaw/openclaw.json`** 里调整数据库连接地址以保证网络可达（与脚本 stdout 一致）。
7. **结束后**：脚本成功结束时提示执行 **`openclaw gateway restart`**（或等价重启），使网关加载 **OpenClaw 目录下的 `.env`**（及插件配置）；若用户事先只在 `~/.openclaw/.env` 里改了 AK/SK/KEY 而未重启，也可能需要同样重启后才生效。不要求用户为安装目的再手动 `source ~/.bashrc`（脚本内已 `source` 过一次当前 shell 子进程）。

**仅升级插件（不创建 RDS）**：在仓库根目录执行 **`python3 scripts/update.py`**。这是**不依赖**「已安装检测」的升级入口；Skill 未被加载时也应通过**本仓库绝对路径**执行该脚本，而不要改跑 `install.py`。

实现细节与边界情况以 **`scripts/install.py` / `scripts/update.py` 源码**为准。
