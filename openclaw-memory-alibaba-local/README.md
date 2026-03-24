# openclaw-memory-alibaba-local

OpenClaw 记忆插件：**本地 LanceDB** 向量存储。支持用户记忆三分类（`user_memory_fact` / `user_memory_preference` / `user_memory_decision`）、可选 **全文按条** 落库（`full_context_*`）、自进化记忆、LLM 或正则抽取、可选 LLM 去重/冲突处理、可选召回时间衰减。

- **自动召回**：`before_prompt_build`（不含 `full_context_*`，仅用户记忆 + 自进化）。
- **自动写入**：仅在 **`agent_end`**（本轮成功结束）时处理：按 **消息 role（source）** 维护游标，计算各 source 的 **delta** → 对 `full_context_*` **立即 embedding 并写入 LanceDB**（同一轮共用 `batchId`，管理端全文 Tab **按 batch 可折叠**）→ **`Promise.all` 并行**：仅 **user** 的 delta 走 **用户记忆** 抽取链路；**user + assistant** 的 delta 拼成上下文走 **自进化** 链路。游标文件：`dbPath` 下 `memory-alibaba-local-agent-end-cursors.json`（若存在旧版 `memory-alibaba-local-full-context-cursor.json` 会在首次加载时尝试改名为新文件并迁移为按 role 计数）。

**Embedding** 支持 **`local`**（默认，本机 `llama-embedding` 从 **stdin** 读入文本）与 **`remote`**（OpenAI 兼容 `/v1/embeddings`）。**LLM** 仍可用 DashScope 兼容接口。相似度与官方 **memory-lancedb** 一致：`score = 1 / (1 + L2_distance)`。

**长文本**：按**空行分段**；每段用 **约 `maxToken` 个 token（字数/4）** 为上限，超长段再切分。每段单独算向量并**单独占一行**（不向量化合并）；召回时对查询各段分别搜向量，再按 **`contentHash` 合并**取最高分。

## 与官方 memory-lancedb 共用目录时的表名

默认 **`dbPath`** 与官方插件相同：`~/.openclaw/memory/lancedb`。本插件使用独立表 **`openclaw_memories_alibaba_local`**（常量 `LANCEDB_TABLE_NAME`），不与官方的 `memories` 表混用。

### 表字段与重建（`chunkIndex`）

设计上每条向量行带有 **`seqInBatch`**（如 `agent_end` 同一 `batchId` 内的消息序）与 **`chunkIndex`**（同一条逻辑记忆因长文本切分产生的多段向量序号，从 0 递增）。**新建表**会自动带上这些列。

若你曾在无 `chunkIndex` 的旧版本下建过表，管理端列表可能出现 *No field named "chunkIndex"*。测试或升级时可**删掉该 LanceDB 表后重启**（插件会按新 schema 建表），例如在本机 `dbPath` 目录下删除名为 `openclaw_memories_alibaba_local` 的表数据（具体文件布局以 LanceDB 版本为准），或临时改用新的 `dbPath`。**注意：会清空本插件表内全部记忆行。**

## 最简配置（默认本机 embedding）

```json
{
  "plugins": {
    "slots": { "memory": "openclaw-memory-alibaba-local" },
    "entries": {
      "openclaw-memory-alibaba-local": {
        "enabled": true,
        "config": {
          "embedding": { "mode": "local" },
          "llm": {
            "apiKey": "${DASHSCOPE_API_KEY}",
            "model": "qwen-plus",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
          }
        }
      }
    }
  }
}
```

可选 **`local`** 字段：`commandPrefix`（默认使用 `llama-embedding -m ~/.openclaw/embedding_model/embeddinggemma-300M-Q8_0.gguf -f /dev/stdin --embd-output-format json`）、`dimensions`（默认 **768**）、`maxToken`（默认 **2048**）。命令需从 **stdin** 读入待嵌入文本；推荐使用 **`--embd-output-format json`**（与 OpenAI 列表格式兼容）。

## 远程 embedding（OpenAI 兼容）

必须显式 **`"mode": "remote"`**，并填写 **`apiKey` / `model` / `baseUrl` / `dimensions` / `maxToken`**（不在此写默认值；配置错误通常在**第一次 embed** 时失败，启动阶段不校验远程连通性）。

```json
"embedding": {
  "mode": "remote",
  "apiKey": "${DASHSCOPE_API_KEY}",
  "model": "text-embedding-v3",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "dimensions": 1024,
  "maxToken": 2048
}
```

默认 **`memoryExtractionMethod` 为 `llm`**，因此需要可用的 **`llm.apiKey`** 与 **`llm.model`**（可在插件里写全，或见下节从主机配置补齐）。若改为 **`regex`**，可不配 `llm`（除非开启 **`memory_duplication_conflict_process`**）。

## LLM 默认值（`openclaw.json`）

当需要 LLM 时，若插件 **`config.llm`** 未写某字段，会按顺序从主机 OpenClaw 配置文件读取（路径：`OPENCLAW_CONFIG_PATH`，否则为 `OPENCLAW_STATE_DIR/openclaw.json`，再否则 `~/.openclaw/openclaw.json`）：

| 插件字段 | 来源 |
|----------|------|
| `apiKey` | `models.providers.bailian.apiKey`（支持字符串或 `SecretRef`，如 `{ "source": "env", "provider": "default", "id": "DASHSCOPE_API_KEY" }`） |
| `baseUrl` | `models.providers.bailian.baseUrl`（缺省仍为 DashScope 兼容地址） |
| `model` | `agents.defaults.model`：可为字符串，或对象里的 **`primary`**（OpenClaw 常用 `bailian/qwen-plus` 形式） |

**模型名格式**：若 `primary` 为 `bailian/xxx` 或 `dashscope/xxx`，发给 Chat Completions 时会自动去掉 provider 前缀，只保留 **`xxx`**，与 DashScope 兼容接口一致。

插件里显式写的 `llm` 字段始终优先于上述默认值。若既未在插件中提供完整 `apiKey`+`model`，主机配置也无法补齐，启动会报错。

## 依赖

- Node 环境下需能加载 **`@lancedb/lancedb`** 原生绑定（部分平台与官方 memory-lancedb 相同限制）。

## 源码与发布

本包为可独立安装的 OpenClaw 插件；远程仓库地址以 **`package.json`** 中 **`repository`** 字段为准。

## 许可证

MIT
