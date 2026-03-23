# openclaw-memory-alibaba-mysql

OpenClaw 记忆插件，使用阿里云 RDS MySQL 做向量存储。支持用户记忆、全文对话记录、自进化记忆；可与 OpenClaw 的 before_agent_start / agent_end 配合，自动召回与自动落库。

## 功能概览

- **用户记忆**：从对话中自动抽取事实、偏好、决策（如「喜欢寿司」「打算用 Python」），支持按向量检索并注入到每轮上下文。
- **全文记忆**：按消息来源分为用户、助手、系统、工具等 6 类，每类按会话保留一份，每轮更新；只存真实对话内容，不存系统注入的上下文块。
- **自进化记忆**：从对话中抽取学习要点、错误、需求等，可选参与召回。
- **冲突与去重**：可选用 LLM 判断新记忆与已有记忆是否矛盾或重复，避免重复、矛盾条目堆积。
- **时间衰减**：召回时可对旧记忆降权，让近期信息更突出。
- **工具**：提供 `memory_recall`（按查询搜记忆）、`memory_store`（显式写入）、`memory_forget`（删除）；若只依赖自动召回与自动抓取，可不给 agent 开放 recall/store，仅保留 forget 用于删除。

## 记忆分类

| 类型 | 说明 |
|------|------|
| 用户事实 / 偏好 / 决策 | 从用户话里抽取的事实、喜好、决定，用于后续对话的上下文 |
| 全文·用户 / 助手 / 系统 / 工具 / 工具结果 / 其它 | 按消息角色分的完整对话记录，按会话维护、每轮更新 |
| 自进化（学习 / 错误 / 需求） | 从对话中抽取的可复用经验，可选参与召回 |

## 配置示例

### 最简配置

只接 MySQL 和向量服务，其余用默认（自动召回 + 自动抓取用户记忆，不开启全文与自进化）：

```json
{
  "plugins": {
    "slots": { "memory": "openclaw-memory-alibaba-mysql" },
    "entries": {
      "openclaw-memory-alibaba-mysql": {
        "enabled": true,
        "config": {
          "mysql": {
            "host": "your-rds.aliyuncs.com",
            "port": 3306,
            "user": "openclaw",
            "password": "${MYSQL_PASSWORD}",
            "database": "openclaw",
            "ssl": true
          },
          "embedding": {
            "apiKey": "${DASHSCOPE_API_KEY}",
            "model": "text-embedding-v3",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
          }
        }
      }
    }
  }
}
```

### 功能全开

开启全文记忆、自进化、LLM 抽取与冲突处理、时间衰减等：

```json
{
  "plugins": {
    "slots": { "memory": "openclaw-memory-alibaba-mysql" },
    "entries": {
      "openclaw-memory-alibaba-mysql": {
        "enabled": true,
        "config": {
          "mysql": {
            "host": "your-rds.aliyuncs.com",
            "port": 3306,
            "user": "openclaw",
            "password": "${MYSQL_PASSWORD}",
            "database": "openclaw",
            "ssl": true
          },
          "embedding": {
            "apiKey": "${DASHSCOPE_API_KEY}",
            "model": "text-embedding-v3",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "dimensions": 1024
          },
          "llm": {
            "apiKey": "${DASHSCOPE_API_KEY}",
            "model": "qwen-plus",
            "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
          },
          "memory_duplication_conflict_process": true,
          "similarityThresholdUserMemory": 0.65,
          "similarityThresholdSelfImproving": 0.62,
          "enableFullContextMemory": true,
          "enableSelfImprovingMemory": true,
          "memoryExtractionMethod": "llm",
          "autoRecall": true,
          "autoCapture": true,
          "captureMaxChars": 5000,
          "enableMemoryDecay": true,
          "tableName": "openclaw_memories"
        }
      }
    }
  }
}
```

**常用配置说明**

- **mysql** / **embedding**：必填，用于连接数据库与生成向量。
- **llm**：使用「LLM 抽取」或「冲突/去重」时必填。
- **memoryExtractionMethod**：`"llm"`（默认）或 `"regex"`，控制如何从对话里抽取用户记忆与自改进记忆。
- **enableFullContextMemory**：是否按角色保存全文对话（每会话每类一份，每轮更新）。
- **enableSelfImprovingMemory**：是否启用自进化记忆的写入与召回。
- **memory_duplication_conflict_process**：是否用 LLM 做写入前的去重与矛盾判断。
- **captureMaxChars**：单条记忆与全文截断的最大字符数，建议 5000 以保留完整当轮对话。
- **enableMemoryDecay**：召回时是否对旧记忆做时间衰减（近期记忆权重更高）。
- **tableName**：存储表名，默认 `openclaw_memories`。

## 环境变量

配置中可使用占位符引用环境变量，例如 `${MYSQL_PASSWORD}`、`${DASHSCOPE_API_KEY}`。常见需要准备的有：

- **MYSQL_HOST**, **MYSQL_USER**, **MYSQL_PASSWORD**：MySQL 连接信息。
- **DASHSCOPE_API_KEY**：DashScope API Key，用于 embedding（以及 LLM 若使用 DashScope）。
