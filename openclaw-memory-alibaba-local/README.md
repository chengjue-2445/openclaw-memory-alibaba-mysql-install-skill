# openclaw-memory-alibaba-local

OpenClaw 记忆插件：**本地 LanceDB** 向量存储。支持用户记忆三分类（`user_memory_fact` / `user_memory_preference` / `user_memory_decision`）、可选全文按角色落库、自进化记忆、LLM 或正则抽取、可选 LLM 去重/冲突处理、可选召回时间衰减；通过 `before_agent_start` 自动召回、`agent_end` 自动写入。默认 **DashScope 兼容** 的 embedding / LLM。相似度分数与 OpenClaw 内置 **memory-lancedb** 一致：`score = 1 / (1 + L2_distance)`。

## 与官方 memory-lancedb 共用目录时的表名

默认 **`dbPath`** 与官方插件相同：`~/.openclaw/memory/lancedb`。本插件使用独立表 **`openclaw_memories_alibaba_local`**，不与官方的 `memories` 表混用。

## 最简配置

```json
{
  "plugins": {
    "slots": { "memory": "openclaw-memory-alibaba-local" },
    "entries": {
      "openclaw-memory-alibaba-local": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "${DASHSCOPE_API_KEY}",
            "model": "text-embedding-v3",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
          },
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

默认 **`memoryExtractionMethod` 为 `llm`**，因此需要配置 **`llm`**。若改为 **`regex`**，可不配 `llm`（除非开启 **`memory_duplication_conflict_process`**）。

## 依赖

- Node 环境下需能加载 **`@lancedb/lancedb`** 原生绑定（部分平台与官方 memory-lancedb 相同限制）。

## 源码与发布

本包为可独立安装的 OpenClaw 插件；远程仓库地址以 **`package.json`** 中 **`repository`** 字段为准。

## 许可证

MIT
