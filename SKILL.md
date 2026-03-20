---
name: openclaw-memory-alibaba-mysql-install-skill
description: 安装 OpenClaw 阿里云 RDS 记忆插件环境。ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET、DASHSCOPE 按优先级从环境变量、~/.bashrc、配置目录 .env 读取；写 .env 后直接运行 install，安装成功后再 gateway 重启。脚本或 Agent 遇错勿自行重试。每次执行前须依赖检查。仅升级用 update.py。须用户同意；非交互必须 --yes。
keywords: openclaw, memory, rds, aliyun, mysql, install.py
---

# OpenClaw Memory 阿里云 MySQL 安装 Skill

## 何时使用

- 用户要**安装或准备 OpenClaw 的阿里云 RDS 记忆插件**（`openclaw-memory-alibaba-mysql`）所需环境时使用本 Skill；具体创建规格与步骤由 **`scripts/install.py`** 完成，接受可能产生的**云资源费用**即可。

## 风险与用户提示（运行前告诉用户）

- 脚本会调用阿里云 API **创建 RDS 实例**等，可能**计费**；文案与脚本一致：基础版 Serverless、起步成本相对较低，之后可在控制台改规格。
- 创建与就绪轮询等步骤耗时较长，**约数分钟到十余分钟量级**（脚本内创建 API 单次最长等待 300 秒，实例变 Running 最长轮询 3600 秒）。
- **遇错即退出**，脚本**不做自动重试**。
- **Agent / 助手禁止自行重试**：脚本一旦**失败、超时或异常退出**，**不得**在未获用户**明确指示**前再次执行、循环重试或改用手动命令代替。应**停止**，把 **完整 stdout/stderr 与退出码**交给用户，由用户决定下一步。

**用户同意与 `--yes`**

- 交互终端：可先运行 `python3 scripts/install.py`（不带 `--yes`），脚本打印说明后需用户输入 **y / yes** 才继续。
- **非交互**（无 TTY、stdin 无法输入）：**必须**在用户已明确同意后加上 **`--yes`**。否则确认步骤读到 EOF 会当作「非 y」，脚本打印「已取消」并以 **0** 退出，**不会**创建资源。
- **禁止**在用户未明确同意创建资源时使用 `--yes`。

**Skill 找不到，以及「更新」误走完整安装**

- **是否进入「仅更新插件」分支**，仅当本机 **OpenClaw 配置目录内 `openclaw.json`** 中存在 **`plugins.slots.memory` 且值为 `openclaw-memory-alibaba-mysql`** 时成立。否则脚本按**首次安装**执行，可能再次 **CreateDBInstance、产生费用**。常见误判场景：在**另一台机器**上跑、配置目录与当前 OpenClaw 不一致、或尚未把 memory 槽位指到本插件。
- 用户明确只要**升级插件 npm 包、不碰 RDS**：在**本仓库根目录**执行 **`python3 scripts/update.py`**（可用仓库**绝对路径**，不依赖 Skill 是否被网关索引）。**不要**用 `install.py --yes` 代替，除非已确认上述 `openclaw.json` 条件满足且用户接受安装脚本的逻辑。
- Agent：用户说「更新记忆插件」时，优先确认意图是 **RDS 装机**还是 **仅 npm 升级**；后者应直接定位并执行 **`scripts/update.py`**，避免默认调用 `install.py` 并带 `--yes` 导致误建新实例。

**禁止在 npm 失败/超时后「手动补装」（常见误操作）**

- 脚本在 npm 阶段**报错、超时或退出**后，**禁止**助手自行执行 `mkdir`、`cd`、`npm install` 等命令来「代替脚本完成安装」。会与脚本逻辑脱节，易留下半套配置。
- **应做**：把 **完整 stderr/stdout 与退出原因**交给用户；可说明可能原因（网络、代理等），但**不要**在用户未开口前自动重跑或重试。待用户修好环境并**明确同意**后再执行 **`install.py`** 或 **`update.py`**——**不要**裸 `npm install` 当修复手段。
- **半截状态**：若日志显示 **RDS 已创建成功**但后续步骤失败，**不要盲目**重跑完整 `install.py`（可能再次尝试购实例或进入未定义状态）。应先向用户说明现状，由用户结合控制台与脚本输出决定：例如仅修网络后是否只适跑 **`update.py`**、或需人工清理资源后再装——**此类分支以用户确认为准**，Skill 不替用户自动选「手动 npm」捷径。

## 环境变量（`install.py` 的读取逻辑）

**首选**：用户在本机自行配置，**不要在聊天里发送完整密钥**；助手也不要在回复中**复述**用户口述的密钥全文。

**`install.py` 在启动时按以下优先级加载三个必填变量**（缺则退出）：

1. **环境变量**（当前进程已 `export` 的）
2. **`~/.bashrc`**（解析 `KEY=value` 或 `export KEY=value` 行）
3. **OpenClaw 配置目录下的 `.env`**（配置目录由 `openclaw config file | grep openclaw.json` 解析，解析失败时回退 `~/.openclaw`）

任一处写全即可，**无需**在写 `.env` 后先 `source` 或重启 gateway 再跑脚本；脚本会自行读取。

**修改 OpenClaw 配置目录 `.env` 后**，**已运行的网关**需 **`openclaw gateway restart`**（或等价重启）才会重新加载；但**不要在写 `.env` 后立即重启**——应先运行 `install.py` 并让用户看到完整安装进度，**安装成功后再**提示用户执行 gateway 重启。否则 gateway 重启会导致聊天界面重载，用户无法看到正在进行的安装。

**检查阶段未通过：用户口述密钥、由 AI 协助写入文件时**

- 用户可能通过交互口述 **ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET、`DASHSCOPE_API_KEY`**，请 AI 帮忙写入。写入后**直接运行 `install.py`** 即可（脚本会从 `.env` 或 `~/.bashrc` 读取）；**不要**在写完后立即执行 `openclaw gateway restart`，以免聊天界面重载、用户看不到安装进度。

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

**在阿里云 ECS 上**：若能读到加固元数据，脚本**固定使用元数据中的地域与 VPC/交换机/可用区**，**忽略**命令行 JSON 与上述四项环境变量。

**仅在「账号已存在」等少数路径**：脚本可能要求设置 **`OPENCLAW_MEMORY_MYSQL_PASSWORD`**（用于写回 `~/.bashrc` 与 OpenClaw 配置目录下的 `.env`），否则退出；一般首次创建不会出现。

### 在 OpenClaw 里为本 skill 注入环境（示例）

在 **OpenClaw 配置目录**下的 `openclaw.json` 的 `skills.entries` 中配置 `env`（密钥由用户在本机填写）：

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

**硬性规则**：凡是准备执行 **`scripts/install.py` 或 `scripts/update.py`**，**每一次执行前都必须先完成本节依赖检查**，**禁止**不检查就直接跑脚本。

- **`update.py`**：至少确认 **Python 3.8+ 可运行**（用于启动该脚本）、**Node.js / npm 可用**、**工作目录为仓库根目录**（或脚本路径正确）、**npm 可访问 registry**（与网络有关）。
- **`install.py`**：除上述与 **npm** 相关项外，还须满足 **pip 依赖（阿里云 SDK）**、上文 **必填环境变量**（及非 ECS 时的 **`OPENCLAW_*` / JSON**）、**`openclaw` CLI（建议）**、**本机可访问阿里云 API** 等**全部**条目。

检查清单（按项确认无报错后再执行对应脚本）：

1. **Python**：版本 **≥ 3.8**（`python3 --version`）。**仅运行 `install.py` 时**：在 **本仓库根目录**执行 **`pip install -r requirements.txt`**，并确保 `alibabacloud-rds20140815`、`alibabacloud_tea_openapi` 可导入（可选：`python3 -c "from alibabacloud_rds20140815.client import Client"`）。**运行 `update.py` 前**仍须确认本机 **`python3` 可执行该脚本**，但不必为 `update.py` 单独安装 RDS SDK。
2. **Node.js / npm**：已安装且在 PATH 中（`node --version`、`npm --version`）；两脚本都会在 **`~/.openclaw/plugins`** 下执行 **`npm install`**（或等价逻辑），**缺一不可**。
3. **环境变量（仅 `install.py`）**：三个必填变量（ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET、`DASHSCOPE_API_KEY`）须已写入 **环境变量**、**`~/.bashrc`** 或 **OpenClaw 配置目录 `.env`** 中任一处（脚本会按此优先级读取，无需 `source` 或 gateway 重启后再跑）。非 ECS 且非交互时备好 **`OPENCLAW_*`** 或位置参数 JSON。**`update.py` 不依赖** ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET / `DASHSCOPE_API_KEY`。
4. **`openclaw` CLI（建议，仅 `install.py`）**：脚本通过 `openclaw config file | grep openclaw.json` 解析配置目录；若 `openclaw` 不在 PATH 或解析失败，回退 `~/.openclaw`。
5. **网络**：**两脚本**均需 **npm 源可达**；**仅 `install.py`** 另需本机可访问 **阿里云 API**（及账号权限）。

全部与即将执行的脚本相匹配的项就绪后，再进入下一节。

## 如何执行（唯一入口）

1. **工作目录与依赖**：本仓库根目录（含 `scripts/install.py`、`requirements.txt` / `update.py`）。**先完成上一节依赖检查**，再运行 **`install.py` 或 `update.py`**（**每次**执行任一脚本前都须检查，**不要**跳过）。
2. **已安装检测（跑 `install.py` 前先看）**：仅当 **OpenClaw 配置目录内 `openclaw.json`** 中 **`plugins.slots.memory` 为 `openclaw-memory-alibaba-mysql`** 时，再运行 `install.py` 才会进入「是否仅更新插件」；确认 **y/yes** 或 **`--yes`** 会转调 **`scripts/update.py`** 并退出。**若不满足该条件，本条不生效**，脚本会走完整安装（见上文「更新误走完整安装」）。若用户只要升级插件包、不要动 RDS，应直接用 **`python3 scripts/update.py`**，见本节末段。
3. **只运行安装脚本**：`python3 scripts/install.py`（或 `python`）。**不要**为同一目的再手动建实例、**不要在 npm 超时/失败后用手动 `npm install` 补装**、不要手改 `~/.openclaw/openclaw.json` 完成同一套安装（见上文 **「禁止在 npm 失败/超时后手动补装」**）。任一脚本**失败或超时后**，**不要自行立刻再跑一遍**；须用户看过日志并明确说要重试后再执行（见上文 **「Agent 禁止自行重试」**）。
4. **日志**：建议使用 `PYTHONUNBUFFERED=1 python3 scripts/install.py` 或 `python3 -u ...`，并把 **stdout/stderr 完整**交给用户。
5. **参数形式**（与 `argparse` 一致）：可选 **`--yes` / `-y`**；可选**位置参数** `params_json`（一整段 JSON 字符串，须含 `region_id`、`vpc_id`、`vswitch_id`、`zone_id`）。示例（用户已同意、非交互）：  
   `python3 scripts/install.py --yes '{"region_id":"cn-hangzhou","vpc_id":"vpc-xxx","vswitch_id":"vsw-xxx","zone_id":"cn-hangzhou-h"}'`
6. **非 ECS**：脚本会提示安装后**可能**需在 **OpenClaw 配置目录的 `openclaw.json`** 里调整数据库连接地址以保证网络可达（与脚本 stdout 一致）。
7. **结束后**：脚本成功结束时提示执行 **`openclaw gateway restart`**（或等价重启），使网关加载 **OpenClaw 配置目录下的 `.env`**（及插件配置）；若用户事先改了配置目录下的 `.env` 而未重启，也可能需要同样重启后才生效。不要求用户为安装目的再手动 `source ~/.bashrc`（脚本内已 `source` 过一次当前 shell 子进程）。

**仅升级插件（不创建 RDS）**：在仓库根目录执行 **`python3 scripts/update.py`**（执行前**同样**须先完成上一节依赖检查，至少含 Python/npm/网络）。这是**不依赖**「已安装检测」的升级入口；Skill 未被加载时也应通过**本仓库绝对路径**执行该脚本，而不要改跑 `install.py`。

实现细节与边界情况以 **`scripts/install.py` / `scripts/update.py` 源码**为准。
