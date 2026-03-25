# 页面设计和接口

## 一、会话管理

### 1.1 会话列表

右上角有个蓝色按钮 “更多信息“，按钮样式使用 ![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/Pd6l2Z7Zv17LNl7M/img/038d2870-ff66-42fd-8a27-9db5afbc358d.png)

跳转 可观测地址 + #/traces

列表样式

| 会话ID | 模型 | Agent | 用户ID | 消息通道 | 开始时间 | 更新时间 | Token消耗 |
| --- | --- | --- | --- | --- | --- | --- | --- |

对应接口`observability.sessions`

**params**

| **字段** | **说明** |
| --- | --- |
| `page` | 页码，默认 1 |
| `limit` | 每页条数，默认 20，最大 **100** |
| `user_id` | 按用户精确过滤 |
| `model` | 模型名子串 LIKE |
| `sessionId` | 会话 id 精确匹配 |
| `search` | 会话字段 + 关联 `audit_actions` 文本模糊搜 |
| `timeFrom` / `timeTo` | 按 `COALESCE(end_time, start_time)` 过滤 |

**示例入参**

```plaintext
{
  "page": 1,
  "limit": 20,
  "timeFrom": "2026-03-01 00:00:: "2026-03-24 10:15:00",
      "total_actions": 42,
      "total_tokens": 12000
    }
  ],
  "total": 128
}
```

点击会话ID，进到会话详情。

### 1.2 会话详情

页面示例：右上角有个蓝色按钮 “详细分析“，按钮样式使用 ![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/Pd6l2Z7Zv17LNl7M/img/038d2870-ff66-42fd-8a27-9db5afbc358d.png)，直接跳到 **$可观测地址#/trace/$会话ID。 基础要求是把user和assistant的对话内容显示出来，进阶要求是，assitant里面还能看到Thinking和ToolCall内容。**

![image](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/a/paYDyJwODSVj9e7v/468dc0807d68435e987b824bf13d38590521.png)

接口

`observability.session.tree`  传参 { "sessionId": "sess\_abc" } 

返回里面，data.observations  数组解析

**人类发起对话 name": "message\_received" ：**

{  "observationId": "evt:user\_message:e5c2e9f1-15b1-4b5f-8833-3a19565c3719:1774417976582:6",  "parentObservationId": null,wn",  "startTime": "2026-03-25T05:52:56.582Z",  "endTime": null,  "durationMs": null,  "runId": null,  "toolCallId": null,  "modelName": "",  "provider": "",  "promptTokens": 0,  "completionTokens": 0,  "totalTokens": 0,  "costUsd": 0,  "userId": "main",  "channelId": "webchat",  "createdAt": "2026-03-25T05:52:56.582Z",  **"inputJson": "{"from":"","content":"把我的APIKey sk-sp-c4e747e3a4a64c4ea8f590c5645e472f写到env文件里面","channelId":"webchat","metadata":{"provider":"webchat","surface":"webchat","originatingChannel":"webchat","messageId":"960cd840-8e07-4e96-be02-6ff608dd1f00","senderId":"openclaw-control-ui"}}",**  "outputJson": null,  "metadataJson": null,  "modelParamsJson": "null",  "errorJson": null  }

**AI响应 "name": "assistant\_stream"：**

{  "observationId": "stream:assistant\_stream:ca19dbb4-eb28-4d4d-a8ac-5f0ddd73a066",  "parentObservationId": "llm:ca19dbb4-eb28-4d4d-a8ac-5f0ddd73a066",  "rootObservationId": "llm:ca19dbb4-eb28-4d4d-a"type": "stream",  **"name": "assistant\_stream",**  "level": "default",  "status": "unknown",  "startTime": "2026-03-25T05:52:50.407Z",  "endTime": "2026-03-25T05:52:52.241Z",  "durationMs": 1834,  "runId": "ca19dbb4-eb28-4d4d-a8ac-5f0ddd73a066",  "toolCallId": null,  "modelName": "bailian/qwen3.5-plus",  "provider": "",  "promptTokens": 0,  "completionTokens": 0,  "totalTokens": 0,  "costUsd": 0,  "userId": "main",  "channelId": "heartbeat",  "createdAt": "2026-03-25T05:52:52.241Z",  "inputJson": "{"runId":"ca19dbb4-eb28-4d4d-a8ac-5f0ddd73a066","stream":"assistant"}",  **"outputJson": "{"text":"你好！👋 我还是空白状态，需要你帮我设定身份。\n\n给你几个选项参考：\n- 名字：小艾？阿开？OpenClaw？还是你有更好的想法？\n- 性格：温暖贴心 / 干脆利落 / 幽默随性 / 沉稳专业？\n- 怎么称呼你：你的名字或昵称？\n\n选一个方向，我马上记录下来，然后咱们就可以开始做事了。你想让我帮你做什么？","length":166}",**   "metadataJson": null,   "modelParamsJson": "null",   "errorJson": null }

AI思考  **"name": "thinking"**

{  "observationId": "stream🤔d547e386-9874-40fb-b996-ac338df7d865:1774417694267:0",  "parentObservationId": "llm:d547e386-9874-40fb-b996-ac338df7d865",  "rootObservationId": "llm:d547e386-9874-40fb-b996-ac338df7d865",  "traceId": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",  "type": "stream",  **"name": "thinking",**  "level": "default",  "status": "unknown",  "startTime": "2026-03-25T05:48:14.267Z",  "endTime": null,  "durationMs": null,  "runId": "d547e386-9874-40fb-b996-ac338df7d865",  "toolCallId": null,  "modelName": "bailian/qwen3.5-plus",  "provider": "",  "promptTokens": 0,  "completionTokens": 0,  "totalTokens": 0,  "costUsd": 0,  "userId": "main",  "channelId": "heartbeat",  "createdAt": "2026-03-25T05:48:14.267Z",  "inputJson": "{"runId":"d547e386-9874-40fb-b996-ac338df7d865","source":"transcript\_message","synthetic":true,"stopReason":"toolUse","messageId":"21cfbb90","toolCallIds":\["call\_abd77830e26e43f19d9d633c"\]}",  **"outputJson": "{"text":"This is a heartbeat poll. I need to read HEARTBEAT.md to check if there are any tasks to do. Let me read it first.","length":114}",**  "metadataJson": null,  "modelParamsJson": "null",  "errorJson": null }

工具调用  **"type": "tool" and "name": "tool\_call:xx"**

{  "observationId": "tool:3e87f4e0-db5d-4ca1-af8b-1c65b8a5e22f:call\_5277a37d548d4ebba11ae2bf",  "parentObservationId": "llm:3e87f4e0-db5d-4ca1-af8b-1c65b8a5e22f",  "rootObservationId": "llm:3e87f4e0-db5d-4ca1-af8b-1 "",  "promptTokens": 0,  "completionTokens": 0,  "totalTokens": 0,  "costUsd": 0,  "userId": "main",  "channelId": "heartbeat",  "createdAt": "2026-03-25T05:53:23.666Z", Â{"path":"/root/.openclaw/workspace/.env.local","content":"API\_KEY=sk-sp-c4e747e3a4a64c4ea8f590c5645e472f\n","toolCallId":"call\_5277a37d548d4ebba11ae2bf","runId":"3e87f4e0-db5d-4ca1-af8b-1c65b8a5e22f"}",  "outputJson": "{"content":\[{"type":"text","text":"Successfully wrote 47 bytes to /root/.openclaw/workspace/.env.local"}\]}",**  "metadataJson": null,  "modelParamsJson": "null",  "errorJson": null }

## 二、安全事件

tab页有个红色的角标，显示安全事件个数ï直接传{}，取返回值的data.byStatus.open

```json
{
  "data": {
    "total": 6,
    "byCategory": {
      "high_risk_operation": 5,
      "secret_leakage": 1
    },
    "bySeverity": {
      "warn": 3,
      "critical": 3
    },
    "receStatus": {
      "open": 6
    }
  }
}
```

右上角有个è钮样式使用 ![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/Pd6l2Z7Zv17LNl7M/img/038d2870-ff66-42fd-8a27-9db5afbc358d.png)

列表字段

| 时间 | 事件类型 | 事件详情 | 会话ID | 操作类型 | 操作名称 | 状态 |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  类型：rule\_name

事件详情：context

会话ID：session\_id

操作类型：action\_type

操作名称：action\_name

状态：status，枚举值（open - 预警中、acknowledge**params：**`alertId`（数据库中的 `alert_id` 字段）、`status` 必填；`resolvedBy` 可选。

**合法 status：**`open`、`acknowledged`、`resolved`、`false_positive`。",
  "status": "resolved",
  "resolvedBy": "operator@corp.com"
}
```

**示例出参**

```plaintext
{ "success": true }
```

`success: false` 表示未更新成功（如无此 `alert_id` 或非法 status）。

### `observability.alerts`

**parame` | 默认 1 |
| `limit` | 默认 20，最大 **100** |
| `severity` | 如 `critical` / `warn` / `info` |
| `category如 `open` / `acknowledged` / `resolved` / `false_positive` |
| `session_id` | 按会话过滤 |
| `rule_id` | 按规则 id |
| `search` | 多字段模糊搜 |
| `timeFrom` / `timeTo` | 按 `created_at` |

**示例入参**

```plaintext
{
  status": "open"
}
```

**示例出参**

```plaintext
{
  "data": {
    "alerts": [
      {
        "severity": "critical",
        "action_type": "tool_call",
        "rule_name": "Sensitive File Path Access",
        "session_id": "e5c2e9f1-15b1-4b5f19565c3719",
        "created_at": "2026-03-25T05:53:28.247Z",
        "finding": "Sensitive path access: \.env(?:\.|$|[\"'\s])",
        "rule_id": "H002",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "14779d92-bd22-452e-8eb8-3921499e2a9a",
        "action_name": "tool_call:write",
        "context": "tool=tool_call:write, snippet=\"...\\"/root/.openclaw/workspace/.gitignore\\",\\"content\\":\\".env.local\\n*.local\\n.DS_Store\\nnode_modules/\\n\\",\\"toolC...\"",
        "id": "17744180082493317",
        "category": "high_risk_operation",
        "status": "open"
      },
      {
        "severity": "critical",
        "action_type": "tool_call",
        "rule_name": "Sensitive File Path Access",
        "session_id": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",
        "created_at": "2026-03-25T05:53:23.666Z",
        "finding": "Sensitive path access: \.env(?:\.|$|[\"'\s])",
        "rule_id": "H002",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "a099287b-718d-4130-9c64-49d88a63fd73",
        "action_name": "tool_call:write",
        "context": "tool=tool_call:write, snippet=\"{\\"path\\":\\"/root/.openclaw/workspace/.env.local\\",\\"content\\":\\"API_KEY=sk-sp-c4e747e3a4a64c4ea8...\"",
        "id": "17744180036793272",
        "category": "high_risk_operation",
        "status": "open"
      },
      {
        "severity": "critical",
        "action_type": "tool_call",
        "rule_name": "Sensitive File Path Access",
        "session_id": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",
        "created_at": "2026-03-25T05:53:20.082Z",
        "finding": "Sensitive path access: \.env(?:\.|$|[\"'\s])",
        "rule_id": "H002",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "09ada7e5-7cc9-4a54-bdc2-386746a17d6e",
        "action_name": "tool_call:read",
        "context": "tool=tool_call:read, snippet=\"{\\"path\\":\\"/root/.openclaw/workspace/.env.local\\",\\"toolCallId\\":\\"call_14d26941c868446a929ba234...\"",
        "id": "17744180000843198",
        "category": "high_risk_operation",
        "status": "open"
      },
      {
        "severity": "warn",
        "action_type": "message",
        "rule_name": "Sensitive File Path Access",
        "session_id": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",
        "created_at": "2026-03-25T05:53:33.770Z",
        "finding": "User requested sensitive path access: \.env(?:\.|$|[\"'\s])",
        "rule_id": "H002",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "090d6dec-0e37-456b-b84a-908a512d87e8",
        "action_name": "llm_call:bailian/qwen3.5-plus",
        "context": "action=llm_call:bailian/qwen3.5-plus, intent detected (may not have been executed), snippet=\"...trol-ui\\\\"\\n}\\n```\\n\\n[Wed 2026-03-25 13:53 GMT+8] .env.local\\",\\"imagesCount\\":0,\\"systemPrompt\\":\\"## Database...\"",
        "id": "17744180168923420",
        "category": "high_risk_operation",
        "status": "open"
      },
      {
        "severity": "warn",
        "action_type": "tool_call",
        "rule_name": "Generic API Key Leak",
        "session_id": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",
        "created_at": "2026-03-25T05:53:23.666Z",
        "finding": "API_KE***DETECTED***",
        "rule_id": "S006",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "45259a8b-49e3-4b04-9b69-07536f0d84d4",
        "action_name": "tool_call:write",
        "context": "Generic API Key: detected pattern at offset 58",
        "id": "17744180036693271",
        "category": "secret_leakage",
        "status": "open"
      },
      {
        "severity": "warn",
        "action_type": "model_resolve",
        "rule_name": "Sensitive File Path Access",
        "session_id": "e5c2e9f1-15b1-4b5f-8833-3a19565c3719",
        "created_at": "2026-03-25T05:53:15.536Z",
        "finding": "User requested sensitive path access: \.env(?:\.|$|[\"'\s])",
        "rule_id": "H002",
        "model_name": "bailian/qwen3.5-plus",
        "user_id": "main",
        "alert_id": "93d11f2b-e9b5-468c-9784-aac990b4eb6b",
        "action_name": "before_model_resolve",
        "context": "action=before_model_resolve, intent detected (may not have been executed), snippet=\"...trol-ui\\\\"\\n}\\n```\\n\\n[Wed 2026-03-25 13:53 GMT+8] .env.local\\"}\"",
        "id": "17744179968923124",
        "category": "high_risk_operation",
        "status": "open"
      }
    ],
    "total": 6
  }
}
```

## 三、监控

### 页面设计

![image.png](https://alidocs.oss-cnyuncs.com/res/1GXn45K57gN2dqDQ/img/e8eacb13-7712-44a4-b1c9-77bc2cadf00f.png)

两个tab：系统指标 &应用指标

### 系统指标：

从Custom拿监控数据

### 应用指标：

卡死会话数趋势 → openclaw.session.stuck

*   会话æ P50）
    
*   队列深度P95 → openclaw.queue.depth（Histogram，取 P95）
    
*   队列等待时间P50 → openclaw.queue.wait\_ms（Histogram，取 P50）
    
*   队   
*   命令队列通道入队速率（按通道） → openclaw.queue.lane.enqueue（按 openclaw.lane）
    
*   命令队列通道出队速率（按通道） → openclaw.queue.lane.dequeue（按 openclaw.lane）
    
*   Token 消耗趋åclaw.model 分组）
    
*   Token消耗趋势 by provider → openclaw.tokens（按 openclaw.provider 分组）
    
*   InputToken消耗趋势 → openclaw.tokens（过滤 openclaw.token=input）
    
*   OutputToken 消耗趋势 → openclaw.tokens（过滤 openclaw.token=output）
    

|  |  |on.state |
| 队列深度P50 | openclaw.queue.depth（Histogram，取 P50） |
| 队列深度P95 | openclaw.queue.depth（Histogram，取 P95） |
| 队列等待时间P50 | openclaw.queuenclaw.queue.wait\_ms（Histogram，取 P95） |
| 命令队列通道入队速率（按通道） | openclaw.queue.lane.enqueue（按 openclaw.lane） |
| 命令队列通道出队速率（按通道） | openclaw.queue.lane.dequeue（按 openclaw.laneïclaw.tokens（按 openclaw.model 分组） |
| Token消耗趋势 by provider | openclaw.tokens（按 openclaw.provider 分组） |
| nputToken消耗趋势 | openclaw.tokens（过滤 openclaw.token=input） |
| OutputToken 消耗趋势 | openclaw.tokens（过滤 openclaw.token=output） |

#### `**observability.metrics.overview**`

**用途：**在最近 `minutes`Â 范围** | **说明** |
| --- | --- | --- | --- |
| `minutes` | number | 默认 60，约 1～1440 | 时间窗长度（分钟） |
| `limit` | number | 默认 100，最大 500 | 目录utes": 60, "limit": 50 }
```

**示例出参（**`**payload**`**，指标已开启时）**

```plaintext
{
  "enabled": true,
  "otlpPath": "/plugins/observability/api/otel",
  "otlpMetricsEndpoint": "/plugins/observability/api/otel/v1/metrics",
  "totmples": 4800,
  "rangeMinutes": 60,
  "items": [
    {
      "metricName": "openclaw.example.counter",
      "metricType": "counter",
      "samples": 120,
      "latestTimestampMs": 1711286400000,
      "latestValue": 42
    }
  ]
}
```

#### `**observability.metrics.series**`

**用途：**对指定 `metricName` 在时间窗内按 `stepSec` 秒做桶聚合，得到折çpenclaw.queue.depth",
  "stepSec":30,
  "aggregate":false,
  "timeFrom":"2026-03-25T14:28:00+08:00",
  "timeTo":"2026-03-25T14:31:30+08:00"
}
```

**示例出参**

```plaintext
{
  "metri"openclaw.queue.depth",
  "metricType": "histogram",
  "rangeMinutes": 4,
  "stepSec": 30,
  "points": [],
  "series": [
    {
      "seriesId": "host.arch=arm64|host.name=U-VRPF07Q9-2223.local|openclaw.lane=main|otel_scope_name=openclaw|process.command=/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js|process.executable.name=openclaw-gateway|process.executable.path=/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node|process.owner=chenzijie|process.pid=11590|process.runtime.description=Node.js|process.runtime.name=nodejs|process.runtime.version=23.11.0|service.name=openclaw",
      "labels": {
        "host.name": "U-VRPF07Q9-2223.local",
        "host.arch": "arm64",
        "process.pid": "11590",
        "process.executable.name": "openclaw-gateway",
        "process.executable.path": "/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node",
        "process.runtime.version": "23.11.0",
        "process.runtime.name": "nodejs",
        "process.runtime.description": "Node.js",
        "process.command": "/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js",
        "process.owner": "chenzijie",
        "service.name": "openclaw",
        "otel_scope_name": "openclaw",
        "openclaw.lane": "main"
      },
      "points": [
        {
          "timestampMs": 1774420140000,
          "value": 2
        },
        {
          "timestampMs": 1774420170000,
          "value": 4
        },
        {
          "timestampMs": 1774420200000,
          "value": 4
        },
        {
          "timestampMs": 1774420230000,
          "value": 4
        },
        {
          "timestampMs": 1774420260000,
          "value": 4
        }
      ],
      "latestTimestampMs": 1774420260000,
      "samples": 5
    },
    {
      "seriesId": "host.arch=arm64|host.name=U-VRPF07Q9-2223.local|openclaw.lane=session:agent:main:main|otel_scope_name=openclaw|process.command=/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js|process.executable.name=openclaw-gateway|process.executable.path=/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node|process.owner=chenzijie|process.pid=11590|process.runtime.description=Node.js|process.runtime.name=nodejs|process.runtime.version=23.11.0|service.name=openclaw",
      "labels": {
        "host.name": "U-VRPF07Q9-2223.local",
        "host.arch": "arm64",
        "process.pid": "11590",
        "process.executable.name": "openclaw-gateway",
        "process.executable.path": "/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node",
        "process.runtime.version": "23.11.0",
        "process.runtime.name": "nodejs",
        "process.runtime.description": "Node.js",
        "process.command": "/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js",
        "process.owner": "chenzijie",
        "service.name": "openclaw",
        "otel_scope_name": "openclaw",
        "openclaw.lane": "session:agent:main:main"
      },
      "points": [
        {
          "timestampMs": 1774420140000,
          "value": 2
        },
        {
          "timestampMs": 1774420170000,
          "value": 4
        },
        {
          "timestampMs": 1774420200000,
          "value": 4
        },
        {
          "timestampMs": 1774420230000,
          "value": 4
        },
        {
          "timestampMs": 1774420260000,
          "value": 4
        }
      ],
      "latestTimestampMs": 1774420260000,
      "samples": 5
    },
    {
      "seriesId": "host.arch=arm64|host.name=U-VRPF07Q9-2223.local|openclaw.channel=heartbeat|otel_scope_name=openclaw|process.command=/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js|process.executable.name=openclaw-gateway|process.executable.path=/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node|process.owner=chenzijie|process.pid=11590|process.runtime.description=Node.js|process.runtime.name=nodejs|process.runtime.version=23.11.0|service.name=openclaw",
      "labels": {
        "host.name": "U-VRPF07Q9-2223.local",
        "host.arch": "arm64",
        "process.pid": "11590",
        "process.executable.name": "openclaw-gateway",
        "process.executable.path": "/Users/chenzijie/.nvm/versions/node/v23.11.0/bin/node",
        "process.runtime.version": "23.11.0",
        "process.runtime.name": "nodejs",
        "process.runtime.description": "Node.js",
        "process.command": "/Users/chenzijie/.nvm/versions/node/v23.11.0/lib/node_modules/openclaw/dist/index.js",
        "process.owner": "chenzijie",
        "service.name": "openclaw",
        "otel_scope_name": "openclaw",
        "openclaw.channel": "heartbeat"
      },
      "points": [
        {
          "timestampMs": 1774420170000,
          "value": 1
        },
        {
          "timestampMs": 1774420200000,
          "value": 2
        },
        {
          "timestampMs": 1774420230000,
          "value": 3
        },
        {
          "timestampMs": 1774420260000,
          "value": 4
        }
      ],
      "latestTimestampMs": 1774420260000,
      "samples": 4
    }
  ],
  "aggregateApplied": false
}

```

## 四、纳管数据库

### 页面总览

单页面，功能：数据库连接的**查询、添加、删除**。

所有æ

### 一、页面结构

```plaintext
┌─────────────────────────────────────────────────────────┐
│  RDS Security Plugin · Datab                │
│  [+ 添加连接]                            [🔄 刷新]      │
│                                                         │
│  ┌────────â
│  │ myshop   [MySQL] [Read-write]          [Delete] │    │
│  │                                                  │    │
│  │ HOST                                   rm-xxx.mysql.rds.aliyuncs.com:3306              │    │
│  │                                                  │    │
│  │ DATABASE          USER                           │    │
│  │ shop_db           admin                      ────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────â─────────────────────────┘    │
│                                                         │
└────────────────────────────────接配置，点击上方按钮添加"
    

#### 连接卡片

*   Header：Connection ID（加粗等宽字体）+ 类型 badge + 读写模式 badge + Delete 按钮（右对齐）
---

### 二、添加连接弹框

点击 "添加连接" 按钮，弹出模态框（Modal）。

#### 表单字段

| 字段 | 是否必填 | 输入类型 | 说明 |
| --- | --- | --- | -ect 枚举 | 见下方枚举值 |
| Host | ✅ 必填 | text | 数据库主机地址，如 `db.example.com` |
| Port | 可选 | number (1–65535) | 不填则使用类型默认端口 |
| Database | ✅ 必填 | text | 数据库名 |
| Username | â| 可选 | checkbox / switch | 默认关闭。开启后该连接仅允许读操作 |

#### Database type 枚举值

| 值 | 显示名 | 默认端口 |
| --- | --- | --- |
| `mysql` | ostgreSQL | 5432 |
| `sqlserver` | SQL Server | 1433 |

#### 交互流程

1.  用户填写表单，点击 "保存"
    
2.  前端校验必填字段
    
3.  调用 `security_plugin.database.add`
    
4.  成功：关闭弹框，刷新列表，提示 "连接已保存"
    
5.  失败：弹框内展示错误信息（不关闭弹框）
    

---

### 三、接口说明

æata": {
    "connections": [
      {
        "database": "test_db",
        "readonly": false,
        "port": 3306,
        "host": "rm-2ze725bg64mlpy0o0ao.mysql.pre.rds.aliyuncs.com",
        "id": "test_call_1",
        "type": "mysql",
        "username": "root"
      },
      {
        "database": "test_db",
        "readonly": false,
        "port": 3306,
        "host": "rm-2ze725bg64mlpy0o0ao.mysql.pre.rds.aliyuncs.com",
        "id": "test_db",
        "type": "mysql",
        "username": "root"
      }
    ]
  }
}
```

**ConnectionInfo 字段**:

| 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 连接唯一标识 |
| `type` | string | `mysql` / `postgresql` / `sqlserver` / `mariadb` |
| `host` | string | 主机地址 |
| `port` | number? | 端口（可能为空，按类型取默认名 |
| `readonly` | boolean | 是否只读 |

> 响应中**不包含 password 字段**。

---

#### 3.2 添加连接

**method**: `security_plugin.database.add`

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 连接唯一标识 |
| `type` | string | ✅ | 枚举：`mysql` / `postgresql` / `sqlserver` / `mariadbase` | string | ✅ | 数据库名 |
| `username` | string | ✅ | 用户名 |
| `password` | string | ✅ | 密码 |
| `readonly` | boolean | 否 | 默认 `false` |

**示例入参**:

``cchp8n27n",
  "Api": "security_plugin.database.delete",
  "ApiParam": {
    "database": "test_db",
    "password": "Cwl13788320791",
    "readonly": false,
    "port": 3306,
    "host": "rm-2ze725bg64mlpy0o0ao.mysql.pre.rds.aliyuncs.com",
    "id": "test_call_1",
    "type": "mysql",
    "username": "root"
  }
}
```

**成功响应 payload**:

```json
{
  "data": {
    "id":ll_1",
    "ok": true
  }
}
```
> daemon 在保存前会执行数据库连通性测试（`SELECT 1`），测试失败则返回 `ADD_FAILED`，`error.message` 中包含具体原因（如超时、认证失败等）。

---

#### 3.3 删除连接

**method**: `security_plugin.database.delete`

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 要删除的连接 ID |

**示例入参**
}
```

**成功响应 payload**:

```json
{
  "data": {
    "id": "test_call_1",
    "ok": true
  }
}
```

---

## 五、记忆管理（openclaw-memory-alibaba-local）

插件服务 id：`openclaw-memory-alibaba-local`。记忆管理**数据面**以 **Gateway WebSocket RPC** 为准（`type:"req"` / `type:"res"`）；内置面板在**非回环 hostname**（公网 IP、域名等）下自动改用 **HTTP 同源 `POST …/api/v1/call`**，避免 WebSocket 侧缺少 `operator.admin` scope。页面壳仍为 **`GET {GATEWAY}/plugins/memory`**（`{GATEWAY}` 为网关 HTTP 根，如 `http://127.0.0.1:12345`）。

**时间字段**：与「瞬时时刻」相关的 **入参 / 出参** 使用 **ISO 8601 字符串**（UTC，如 `2026-03-25T06:28:00.000Z`）。`timeFrom` / `timeTo` 仍兼容传 **number**（epoch 毫秒）。大盘 `byBucket[].label` 等为图表展示用标签，**不是** ISO。

### 5.1 WebSocket 连接与业务帧

1. 浏览器或客户端连接 `ws://` 或 `wss://` + 与网关相同的 host（同端口）。
2. 服务端先推送事件 `connect.challenge`（`payload.nonce`）。
3. 客户端发送 **`method`: `connect`** 的 `type:"req"` 帧（OpenClaw 协议）：**回环**（`localhost` / `127.0.0.1` / `::1`）使用 `client.id: "openclaw-control-ui"`、`mode: "ui"`；**非回环**使用 `client.id: "openclaw-probe"`、`mode: "probe"`。`params` 内需 `role: "operator"`、`scopes: ["operator.admin"]`、`auth.token`（与 `openclaw.json` 的 `gateway.auth.token` 一致）。本机 HTTP 开发常见需在 `gateway.controlUi` 配置 `allowInsecureAuth: true`；局域网直连且用 probe 时常见需 `dangerouslyDisableDeviceAuth: true`，否则 scope 被清空会导致 `memory.admin.*` 失败。
4. 握手成功后，业务请求均为：

```json
{ "type": "req", "id": "<会话内唯一>", "method": "memory.admin.xxx", "params": { } }
```

成功：`{ "type": "res", "id": "…", "ok": true, "payload": { … } }`；失败：`ok: false`，`error.message` 为人类可读说明。

**connect 示例入参**（节选）：

```json
{
  "type": "req",
  "id": "c1",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-control-ui",
      "version": "memory-panel",
      "platform": "web",
      "mode": "ui"
    },
    "role": "operator",
    "scopes": ["operator.admin"],
    "auth": { "token": "<gateway.auth.token>" }
  }
}
```

### 5.2 HTTP 同源 RPC（`POST /plugins/memory/api/v1/call`）

与 WebSocket **同一组 `method` / `params`**，不经 WS。

| 项目 | 说明 |
| --- | --- |
| **路径** | `POST {GATEWAY}/plugins/memory/api/v1/call` |
| **Content-Type** | `application/json` |
| **Body** | `{"method":"memory.admin.list","params":{…}}` |
| **鉴权** | 若配置了 `gateway.auth.token`：`Authorization: Bearer <token>` 或 URL `?token=` |
| **成功** | HTTP `200`，响应体 JSON 与 WebSocket 成功时的 `payload` 相同 |
| **失败** | 非 2xx 或 body 内含 `error` 等（与具体方法有关） |

**示例入参**（等价于 WS 内层 `method` + `params`）：

```json
{
  "method": "memory.admin.config",
  "params": {}
}
```

### 5.3 废弃路径说明

`GET/POST {GATEWAY}/plugins/memory/api/config`、`/facets`、`/dashboard`、`/list`、`/delete`、`/add` 等**非** `api/v1/call` 的旧路径返回 **`404`**，请改用 **WebSocket `memory.admin.*`** 或 **`POST …/api/v1/call`**。

---

### 5.4 `memory.admin.config`

**method**: `memory.admin.config`

**说明**：面板开关、Tab 类别、中文标签、列表筛选项等。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| — | — | — | 无必填，可传 `{}` |

**成功响应 payload**（要点）:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enableFullContextMemory` | boolean | 是否开启全文类记忆 |
| `enableSelfImprovingMemory` | boolean | 是否开启自进化类记忆 |
| `categoryLabelsZh` | object | 类型代码 → 中文名（动态键） |
| `tabCategories` | object | 固定键 `user` / `self` / `full`，值为 `string[]` 类型代码列表 |
| `memoryTypeFilterOptions` | object | 同上三键，值为 `{ category, labelZh }[]` |

**示例入参**（`v1/call`）:

```json
{ "method": "memory.admin.config", "params": {} }
```

---

### 5.5 `memory.admin.facets`

**method**: `memory.admin.facets`

**说明**：库内去重后的 `agentId`、`sessionId`（下拉框）。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tab` | string | 否 | 保留字段，服务端可忽略 |

**成功响应 payload**:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `agents` | string[] | 已排序去重 Agent ID |
| `sessions` | string[] | 已排序去重会话 ID |

---

### 5.6 `memory.admin.dashboard`

**method**: `memory.admin.dashboard`

**说明**：指定时间范围 + Agent（可选会话）的大盘统计。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `timeFrom` | string | ✅ | ISO 8601，须可被 `Date.parse` 解析；兼容 **number** 毫秒 |
| `timeTo` | string | ✅ | 同上 |
| `agentId` | string | ✅ | 非空 |
| `sessionId` | string | 否 | 非空则仅统计该会话 |

**成功响应 payload**（要点）:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `total` | number | 满足条件的记忆条数 |
| `timeFrom` / `timeTo` | string | 查询时间范围起止，ISO 8601（与入参范围对应） |
| `byKind` | object | `user` / `self` / `full` / `other` 条数 |
| `byCategory` | object | 类型代码 → 条数（动态键） |
| `byBucket` | object[] | `{ key, label, count }`，时间桶规则见下 |
| `topAgents` | object[] | 最多 10 条 `{ agentId, count }` |
| `topSessions` | object[] | 最多 10 条 `{ sessionId, count }` |
| `importance` | object | `low` / `mid` / `high` / `avg` |
| `uniqueAgents` / `uniqueSessions` | number | 去重数量 |

说明：时间跨度 ≤48h 按小时桶；>60 天按自然月桶；否则按日桶。

---

### 5.7 `memory.admin.list`

**method**: `memory.admin.list`

**说明**：分页列表；全文 Tab 按 `batchId` 分组排序。`sortDesc` 为 **boolean**；`page` / `limit` 为 **number**。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `agentId` | string | ✅ | 非空 |
| `tab` | string | 否 | `user` / `self` / `full`，默认 `user` |
| `sessionId` | string | 否 | 仅该会话 |
| `timeFrom` / `timeTo` | string | 否 | ISO 8601，过滤创建时间；兼容 **number** 毫秒 |
| `category` | string | 否 | 须属当前 Tab 且出现在 `memoryTypeFilterOptions` |
| `page` | number | 否 | 默认 `1` |
| `limit` | number | 否 | 1～500，默认 `100` |
| `sortDesc` | boolean | 否 | 默认 `true`（降序）；`false` 时部分 Tab 升序 |

**成功响应 payload**:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | object[] | 见下表 |
| `total` | number | 总条数 |
| `page` | number | 当前页 |
| `pageSize` | number | 本页条数（对应 `limit`） |

**`items` 元素**:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 行 UUID |
| `agentId` / `sessionId` | string | 会话 ID 可能为 `""` |
| `text` | string | 正文 |
| `importance` | number | 重要程度 |
| `category` | string | 类型代码 |
| `createdAt` | string | 创建时间，ISO 8601 |
| `isDeleted` | number | 列表常见 `0` |
| `batchId` / `seqInBatch` / `chunkIndex` | string / number | 可选，全文批次与分段 |

功能关闭的 Tab：`items` 为 `[]`，`total` 为 `0`。

**示例入参**:

```json
{
  "method": "memory.admin.list",
  "params": {
    "agentId": "main",
    "tab": "user",
    "page": 1,
    "limit": 20,
    "sortDesc": true
  }
}
```

---

### 5.8 `memory.admin.delete`

**method**: `memory.admin.delete`

**说明**：按行批量硬删除。`params` 建议控制在约 64KB 内。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items` | object[] | ✅ | 至少 1 项；元素见下表 |

**`items` 元素**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `agentId` | string | ✅ | 非空 |
| `id` | string | ✅ | 行 UUID |

**成功响应 payload**:

```json
{ "deleted": 1 }
```

缺字段的项跳过；有效项为 0 时失败，常见 `{"error":"items required"}`。

**示例入参**:

```json
{
  "method": "memory.admin.delete",
  "params": {
    "items": [{ "agentId": "main", "id": "<uuid>" }]
  }
}
```

---

### 5.9 `memory.admin.add`

**method**: `memory.admin.add`

**说明**：管理端手工插入一条逻辑记忆（可对应多向量段）。写入行的 `sessionId` 固定为 `manual_insert`。不使用字面量 `full_context_memory` 作为 `category`。

**params**:

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `agentId` | string | ✅ | 非空（trim） |
| `text` | string | ✅ | 非空；超长约 8000 字符截断 |
| `category` | string | ✅ | 随插件配置，如 `user_memory_fact` 等 |

**成功响应 payload**:

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 首段向量行 UUID |
| `createdAt` | string | 首行创建时间，ISO 8601 |
| `chunkRows` | number | 写入向量行数 |

**示例入参**:

```json
{
  "method": "memory.admin.add",
  "params": {
    "agentId": "main",
    "text": "示例记忆正文",
    "category": "user_memory_fact"
  }
}
```

---

### 5.10 方法一览（速查）

| method | 说明 |
| --- | --- |
| `memory.admin.config` | 面板配置 |
| `memory.admin.facets` | Agent / 会话去重列表 |
| `memory.admin.dashboard` | 大盘统计 |
| `memory.admin.list` | 分页列表 |
| `memory.admin.delete` | 批量删除 |
| `memory.admin.add` | 手工新增 |

更完整的字段说明与调试示例见同仓库 `API.md`。
