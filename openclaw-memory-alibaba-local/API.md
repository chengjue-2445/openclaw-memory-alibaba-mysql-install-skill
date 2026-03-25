# openclaw-memory-alibaba-local — 接口说明

本文以 **Gateway WebSocket RPC** 作为记忆管理**数据面**的规范写法（与 OpenClaw 网关帧协议一致）：先 `connect` 握手，再发送 `type:"req"` 业务帧，`method` 为下表 `memory.admin.*`。

- **集成方 / 自动化**：请按 **§1** 实现 WebSocket 客户端（回环场景下与官方 Control UI 策略一致）。
- **内置浏览器面板**：回环 hostname 时优先走 WebSocket；**非回环**（公网 IP、域名等）时自动改走 **§1.3** 的 **`POST /plugins/memory/api/v1/call`**（仅校验 `gateway.auth.token`，不依赖 WS 上的 `operator.admin` scope）。
- **网关 HTTP 根**：`{GATEWAY}`，例如 `http://127.0.0.1:12345`。
- **WebSocket URL**：`ws://` 或 `wss://` + 与页面/网关相同的 `host`（同端口）。
- **HTML 壳（仅页面）**：`GET {GATEWAY}/plugins/memory`（前缀匹配）。

**类型约定**

| 文档中的类型 | 含义 |
|--------------|------|
| `string` / `number` / `boolean` | JSON 基本类型 |
| `object` | JSON **对象**（键值对；与语言里的 Map 类似，但是标准 JSON） |
| `T[]` / `array` | JSON **数组**；若元素为对象，文档在下方单独给出「数组元素结构」表 |
| `—` | 不适用（如响应头说明） |

---

## 一、Gateway WebSocket RPC（管理面板数据）

### 1.1 连接与鉴权

1. 浏览器建立 `WebSocket` 到 `{WS_GATEWAY}`（与页面同源：`location` 的 host + `ws:`/`wss:`）。
2. 服务端先推送事件 `connect.challenge`（`payload.nonce`）。
3. 客户端发送首帧请求（OpenClaw 协议）。**内嵌面板**按页面 hostname 选择 `client`（与网关 `isLocalClient`、是否清空 `scopes` 一致）：

   - **回环**：`localhost` / `127.0.0.1` / `::1` → `id: "openclaw-control-ui"`，`mode: "ui"`。
   - **非回环**（如局域网 IP、自定义域名）：`id: "openclaw-probe"`，`mode: "probe"`（避免 Control UI 在非本机 HTTP 下直接握手失败）。

```json
{
  "type": "req",
  "id": "<任意唯一字符串>",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "openclaw-control-ui",
      "version": "memory-panel",
      "platform": "<navigator.platform 或 web>",
      "mode": "ui"
    },
    "role": "operator",
    "scopes": ["operator.admin"],
    "auth": { "token": "<与 openclaw.json gateway.auth.token 一致>" }
  }
}
```

4. 成功时收到 `type: "res"` 且 `ok: true`，`payload` 内含 `hello-ok` 等网关握手信息。浏览器连接会校验来源（`gateway.controlUi.allowedOrigins` 等），与官方 Control UI 一致。

**纯 WebSocket 场景下 `openclaw.json`（`gateway.controlUi`）**：

| 访问方式 | 典型配置 |
|----------|----------|
| 本机 `http://127.0.0.1` / `localhost` + Control UI 客户端 | **`allowInsecureAuth: true`**（否则握手报错 *control ui requires device identity*） |
| 局域网 IP / 非回环 hostname + Probe 客户端 | 除 token 外通常需 **`dangerouslyDisableDeviceAuth: true`**，否则握手可成功但网关会**清空 `scopes`**，`memory.admin.*` 报 *missing scope*（面板 403/502） |
| 生产/跨机更稳妥 | **HTTPS** + 设备配对，或 SSH 转发到本机后用 `127.0.0.1` + `allowInsecureAuth` |

示例（本机开发常见）：

```json
"gateway": {
  "controlUi": {
    "allowInsecureAuth": true
  }
}
```

局域网浏览器直连网关时（面板已用 probe 客户端）示例：

```json
"gateway": {
  "controlUi": {
    "dangerouslyDisableDeviceAuth": true
  }
}
```

5. 后续业务请求均为 **`type:"req"`** 帧（`id` 在会话内唯一，`method` / `params` 见下表）：

```json
{ "type": "req", "id": "<唯一>", "method": "<下表 method>", "params": { } }
```

成功：`{ "type": "res", "id": "…", "ok": true, "payload": <与 §2 各节「成功 payload 字段」一致> }`  
失败：`ok: false`，`error.message` 为人类可读原因；部分失败同时带 `payload`（如 `{ "error": "…", "status": 400 }`）。

#### 1.1.1 WebSocket 报文示例（节选）

服务端先推 **事件**（示例）：

```json
{ "type": "event", "event": "connect.challenge", "payload": { "nonce": "8f3a…" } }
```

客户端再发 **connect 请求**（字段见上文步骤 3 JSON）；成功时收到：

```json
{ "type": "res", "id": "<与 connect 请求 id 相同>", "ok": true, "payload": { "hello": "ok" } }
```

握手完成后，拉取面板配置（`memory.admin.config`）：

```json
{ "type": "req", "id": "m1", "method": "memory.admin.config", "params": {} }
```

成功响应（`payload` 全量字段见 §2.2）：

```json
{ "type": "res", "id": "m1", "ok": true, "payload": { "enableFullContextMemory": true, "tabCategories": {} } }
```

### 1.2 管理方法一览（WebSocket `method`）

| `method` | 说明 | `params`（JSON object） | 成功时 `payload` |
|----------|------|---------------------------|------------------|
| `memory.admin.config` | 面板配置 | 无必填字段 | 成功 `payload` 见 §2.2 |
| `memory.admin.facets` | 下拉去重值 | 可选 `tab`（保留字段，服务端可忽略） | 见 §2.3 |
| `memory.admin.dashboard` | 大盘统计 | `timeFrom`, `timeTo`（ISO 8601）、`agentId`；可选 `sessionId` | 见 §2.4 |
| `memory.admin.list` | 分页列表 | `tab`, `agentId`；可选 `sessionId`, `timeFrom`, `timeTo`, `category`, `page`, `limit`, `sortDesc`（布尔，默认 true） | 见 §2.5 |
| `memory.admin.delete` | 批量删除 | `items`: `{ agentId, id }[]` | 见 §2.6 |
| `memory.admin.add` | 手工插入 | `agentId`, `text`, `category` | 见 §2.7 |

### 1.3 HTTP 同源 RPC（可选；内置面板在非回环 hostname 下使用）

与 **§1.2 同一组 `method` / `params`**，不经 WebSocket，仅适用于**与网关同源**的 `fetch`（例如公网打开 `/plugins/memory` 时避免 WS `operator.admin` 限制）。

| 路径 | 行为 |
|------|------|
| `POST {GATEWAY}/plugins/memory/api/v1/call` | Body：`{"method":"memory.admin.list","params":{...}}`（`method` 与上表 WebSocket 方法名一致）。若配置了 `gateway.auth.token`，须 `Authorization: Bearer <token>` 或 URL `?token=`。成功时 HTTP 200，body 为与 WS `payload` 相同的 JSON；失败时 HTTP 状态码与 body 内 `error` 等与运维操作一致。 |

### 1.4 废弃的旧版 HTTP JSON 路径

| 路径 | 行为 |
|------|------|
| `GET/POST {GATEWAY}/plugins/memory/api/config` 等旧路径（非 `api/v1/call`） | 若配置了 gateway token，仍校验 `?token=` 或 `Authorization: Bearer`；未命中 `v1/call` 时返回 **`404`**，请使用 **`POST …/api/v1/call`**（§1.3）或 **WebSocket**（§1.2）。 |

---

## 二、Payload 字段参考（与 WebSocket 成功时 `payload` 一致）

以下各节以 **WebSocket `method`** 为主描述**成功时的 `payload` JSON 形状**；表中的 **历史 HTTP URI** 仅便于对照旧集成，**勿再调用**（返回 **404**）。

**时间约定（`memory.admin.*`）**：与「瞬时时刻」相关的 **入参 / 出参** 使用 **ISO 8601 字符串**（UTC，形如 `2026-03-25T06:28:00.000Z`，与 `Date.prototype.toISOString()` 一致）。`timeFrom` / `timeTo` 推荐使用带 `Z` 或时区偏移的 ISO；服务端仍接受 **数字毫秒**（epoch ms）作为兼容。大盘 `byBucket[].label` 等仅为图表展示用标签，**不是** ISO 8601。

### 2.1 `GET /plugins/memory`（仅 HTML，无 `memory.admin.*`）

| 项目 | 说明 |
|------|------|
| **功能** | 返回记忆管理端单页 HTML（壳）；页内脚本按 hostname 选择 **WebSocket** 或 **§1.3 HTTP** 拉取数据 |
| **URI** | `{GATEWAY}/plugins/memory` |

**入参**

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| — | — | — | — | 无查询参数 | — |

**出参**（成功 `200`）

| 字段 / 项 | 类型 | 说明 |
|-----------|------|------|
| 响应体 | `string` | HTML 文档 |
| 响应头 `Content-Type` | — | `text/html; charset=utf-8` |

---

### 2.2 `memory.admin.config`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.config` |
| **`params`** | `{}`（可省略字段） |
| **功能** | 返回面板开关、Tab 类别、中文标签、列表筛选项等 |
| **历史 HTTP URI（404）** | `GET {GATEWAY}/plugins/memory/api/config` |

**`params`**：无必填字段（可传 `{}`）。

**成功时 `payload`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableFullContextMemory` | `boolean` | 是否开启全文类记忆 |
| `enableSelfImprovingMemory` | `boolean` | 是否开启自进化类记忆 |
| `categoryLabelsZh` | `object` | 键：记忆类型代码 `string` → 值：中文展示名 `string`（动态键，无固定子字段表） |
| `tabCategories` | `object` | 固定三键，见下表「`tabCategories` 对象结构」 |
| `memoryTypeFilterOptions` | `object` | 固定三键，见下表「`memoryTypeFilterOptions` 对象结构」 |

**`tabCategories` 对象结构**（键固定）

| 键 | 类型 | 说明 |
|----|------|------|
| `user` | `string[]` | 用户 Tab 下的类型代码列表 |
| `self` | `string[]` | 自进化 Tab；功能关闭时可能为 `[]` |
| `full` | `string[]` | 全文 Tab；功能关闭时可能为 `[]` |

**`memoryTypeFilterOptions` 对象结构**（键固定）

| 键 | 类型 | 说明 |
|----|------|------|
| `user` | `object[]` | 筛选项列表，元素结构见下表 |
| `self` | `object[]` | 同上 |
| `full` | `object[]` | 同上 |

**`memoryTypeFilterOptions.*` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | `string` | 记忆类型代码 |
| `labelZh` | `string` | 界面展示用中文 |

---

### 2.3 `memory.admin.facets`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.facets` |
| **`params`** | 可选 `tab`（`string`，保留字段） |
| **功能** | 返回库中出现过的去重 `agentId`、`sessionId`（供下拉框） |
| **历史 HTTP URI（404）** | `GET {GATEWAY}/plugins/memory/api/facets` |

**成功时 `payload`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `agents` | `string[]` | 已排序的去重 Agent ID |
| `sessions` | `string[]` | 已排序的去重会话 ID |

---

### 2.4 `memory.admin.dashboard`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.dashboard` |
| **功能** | 指定时间范围 + Agent（可选会话）下的记忆大盘统计 |
| **历史 HTTP URI（404）** | `GET {GATEWAY}/plugins/memory/api/dashboard` |

**`params`（与 §1.3 `POST …/v1/call` 的 JSON 内层 `params` 同形）**

| 参数 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|----------------|--------|
| `timeFrom` | `string` | **是** | ISO 8601，须可被 `Date.parse` 解析；兼容传 **number** 毫秒 | 无 |
| `timeTo` | `string` | **是** | 同上 | 无 |
| `agentId` | `string` | **是** | 非空（trim 后） | 无 |
| `sessionId` | `string` | 否 | 非空则仅统计该会话；空表示不限 | 空 |

**成功时 `payload`（`res.ok === true`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | `number` | 满足条件的记忆条数 |
| `timeFrom` | `string` | 查询时间范围起点，ISO 8601（与入参范围对应） |
| `timeTo` | `string` | 查询时间范围终点，ISO 8601 |
| `byKind` | `object` | 四大类条数，子结构见下表 |
| `byCategory` | `object` | 键：类型代码 `string` → 值：条数 `number`（动态键） |
| `byBucket` | `object[]` | 时间趋势桶，元素结构见下表 |
| `topAgents` | `object[]` | 条数 Top Agent，**最多 10 条**，元素结构见下表 |
| `topSessions` | `object[]` | 条数 Top 会话，**最多 10 条**，元素结构见下表 |
| `importance` | `object` | 重要程度分档，子结构见下表 |
| `uniqueAgents` | `number` | 去重 Agent 数 |
| `uniqueSessions` | `number` | 去重会话数 |

**`byKind` 对象结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| `user` | `number` | 用户记忆类（`user_memory_*`） |
| `self` | `number` | 自进化类（`self_improving_*`） |
| `full` | `number` | 全文相关（含 `full_context_memory` 与 `full_context_*`） |
| `other` | `number` | 其余类型 |

**`byBucket` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 桶标识（如月份 `YYYY-MM` 或序号） |
| `label` | `string` | 展示用标签 |
| `count` | `number` | 该桶内条数 |

说明：跨度 ≤48 小时按**小时**桶；跨度大于 60 天按**本地自然月**桶；否则按**日**桶。

**`topAgents` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `agentId` | `string` | Agent ID |
| `count` | `number` | 条数 |

**`topSessions` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionId` | `string` | 会话 ID |
| `count` | `number` | 条数 |

**`importance` 对象结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| `low` | `number` | 重要度小于 0.34 的条数 |
| `mid` | `number` | 重要度大于等于 0.34 且小于 0.67 |
| `high` | `number` | 重要度不小于 0.67 |
| `avg` | `number` | 有效重要度的平均值；无有效值时为 `0` |

**失败**：WebSocket `ok: false`；经 **`POST …/v1/call`** 时常见 HTTP `400`：缺少/非法时间、缺少 `agentId`、或命中行数超过约 5 万等，body 多为 `{ "error": string }`。

---

### 2.5 `memory.admin.list`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.list` |
| **功能** | 分页列出记忆行（Tab 对应类别集合；全文 Tab 按 `batchId` 分组排序） |
| **历史 HTTP URI（404）** | `GET {GATEWAY}/plugins/memory/api/list` |

**`params`**：`sortDesc` 为 **boolean**（`false` 时部分 Tab 时间升序），`page` / `limit` 为 **number**。

| 参数 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|----------------|--------|
| `agentId` | `string` | **是** | 非空 | 无 |
| `tab` | `string` | 否 | `user` \| `self` \| `full`，决定基础类别集合 | `user` |
| `sessionId` | `string` | 否 | 仅该会话 | 空（不限） |
| `timeFrom` | `string` | 否 | ISO 8601，过滤创建时间下限；兼容传 **number** 毫秒 | 不限 |
| `timeTo` | `string` | 否 | ISO 8601，过滤创建时间上限；兼容传 **number** 毫秒 | 不限 |
| `category` | `string` | 否 | 须属当前 Tab 类别且出现在该 Tab 的 `memoryTypeFilterOptions` 中 | 不按子类型过滤 |
| `page` | `number` | 否 | 正整数页码 | `1` |
| `limit` | `number` | 否 | 每页 1～500 | `100` |
| `sortDesc` | `boolean` | 否 | `false` 时部分 Tab 改为时间升序；否则降序 | `true`（降序） |

**成功时 `payload`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `items` | `object[]` | 当前页记忆行，元素结构见下表 |
| `total` | `number` | 符合条件的总条数（分页前） |
| `page` | `number` | 当前页码 |
| `pageSize` | `number` | 本页条数（对应请求中的 `limit`） |

**`items` 数组元素（object）**

| 字段 | 类型 | 必填（于对象内） | 说明 |
|------|------|------------------|------|
| `id` | `string` | 是 | 行 UUID，删除时与 `agentId` 一起提交 |
| `agentId` | `string` | 是 | Agent ID |
| `sessionId` | `string` | 是 | 会话 ID，可能为空字符串 `""` |
| `text` | `string` | 是 | 正文 |
| `importance` | `number` | 是 | 重要程度 |
| `category` | `string` | 是 | 类型代码 |
| `createdAt` | `string` | 是 | 创建时间，ISO 8601 |
| `isDeleted` | `number` | 是 | 列表一般为未删除数据，常见 `0` |
| `batchId` | `string` | 否 | 全文快照批次 ID，用于成组展示 |
| `seqInBatch` | `number` | 否 | 批次内顺序 |
| `chunkIndex` | `number` | 否 | 多向量段时序号 |

**失败**：WebSocket `ok: false`；经 **`POST …/v1/call`** 时 HTTP `400`：`agentId` 缺失、`category` 与 Tab 不匹配、匹配过多等。

**特例**（功能关闭的 Tab）：`items` 为 `[]`，`total` 为 `0`，`page` 为 `1`，`pageSize` 为 `100`。

---

### 2.6 `memory.admin.delete`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.delete` |
| **功能** | 按行 ID 批量硬删除 |
| **历史 HTTP URI（404）** | `POST {GATEWAY}/plugins/memory/api/delete` |
| **`params` 建议大小** | 约 64KB 以内（与旧 Body 上限一致） |

**`params`**

| 参数 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|----------------|--------|
| `items` | `object[]` | **是** | 至少 1 个元素；元素结构见下表 | 无 |

**`items` 数组元素（object）**

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `agentId` | `string` | **是** | 非空 |
| `id` | `string` | **是** | 行 UUID |

**成功时 `payload`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `deleted` | `number` | 实际删除条数 |

说明：缺 `agentId` 或 `id` 的项会被跳过；若有效项为 0，业务失败（HTTP `v1/call` 为非 2xx；WebSocket 为 `ok: false`），`error` / `payload.error` 常见 `items required`。

---

### 2.7 `memory.admin.add`（WebSocket）

| 项目 | 说明 |
|------|------|
| **WebSocket `method`** | `memory.admin.add` |
| **功能** | 管理端手工写入一条逻辑记忆（可对应多段向量行） |
| **历史 HTTP URI（404）** | `POST {GATEWAY}/plugins/memory/api/add` |
| **`params` 建议大小** | 约 64KB 以内 |

**`params`**

| 参数 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|----------------|--------|
| `agentId` | `string` | **是** | 非空（trim） | 无 |
| `text` | `string` | **是** | trim 后非空；超长按约 8000 字符截断 | 无 |
| `category` | `string` | **是** | 见附录 A 与 config 开关；本接口不使用 `full_context_memory` 字面量 | 无 |

写入行的 `sessionId` 固定为 `manual_insert`。

**成功时 `payload`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 首段向量行的 UUID |
| `createdAt` | `string` | 首行创建时间，ISO 8601 |
| `chunkRows` | `number` | 写入的向量行数（段数） |

**失败**：业务错误时 WebSocket `ok: false`；经 **`POST …/v1/call`** 时 HTTP `400` / `502` / `503` 等，body 多为 `{ "error": string }`（见源码与运行时文案）。

---

### 2.8 调试示例（WebSocket 为规范；curl 演示 HTTP 可达路径）

**数据面**：以 **§1.1** 握手 + **§1.2** `type:"req"` 为准；成功时 `res.payload` 与 **`POST …/plugins/memory/api/v1/call`** 的 **200 响应体**相同（同一套 RPC 分发）。命令行无 WebSocket 客户端时，可用 **`v1/call`** 对照字段（见 §2.2–§2.7）。

```bash
export GATEWAY="http://127.0.0.1:12345"
export TOKEN="你的 gateway.auth.token"
```

鉴权（仅 HTTP）：`Authorization: Bearer $TOKEN` 或 URL `?token=`（与 §1.3 一致）。

**HTTP 状态码速查**

| 请求 | HTTP |
|------|------|
| `GET …/plugins/memory` | `200`（HTML 壳） |
| `POST …/plugins/memory/api/v1/call`（合法 `method` / `params` + token） | `200`，body 为等价 WebSocket 的 `payload`（或网关/插件错误 JSON） |
| `GET/POST …/plugins/memory/api/*`（**非** `api/v1/call`） | **`404`** |
| `POST …/v1/call`，错误 token | `401`（与网关一致） |

**1）`GET /plugins/memory`（无 token）**

```bash
curl -sS -D - -o /tmp/memory_panel.html "$GATEWAY/plugins/memory" | head -n 12
```

**响应头（实测前若干行）**

```http
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Type: text/html; charset=utf-8
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
```

**响应体**：HTML 单页（实测整页约 65KB）。正文开头如下，余下为内联样式与脚本。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>RDSClaw 记忆管理</title>
<style>
/* 与 OpenClaw Observability 面板一致的浅色卡片 + 红色主色 */
:root {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #212121;
  background: #f5f5f5;
  --oc-accent: #d32f2f;
  --oc-accent-hover: #b71c1c;
  --oc-secondary: #7e57c2;
  --oc-border: #e0e0e0;
  --oc-muted: #757575;
  --oc-card: #ffffff;
  --oc-page: #f5f5f5;
}
* { box-sizing: border-box; }
input[type="checkbox"] { accent-color: var(--oc-accent); }
body {
  margin: 0;
  padding: 20px 20px 32px;
```

---

**2）WebSocket 调试**

在浏览器打开 `$GATEWAY/plugins/memory`，DevTools → **Network** → 筛选 **WS**，选中连接即可看到 **`connect` 与 `memory.admin.*` 请求帧**（与 §1.1.1 JSON 形状一致）。自建客户端须先处理服务端推送的 `connect.challenge`，再发 `connect` 请求。

**3）`POST …/api/v1/call`：`memory.admin.config`（响应体与 WebSocket `payload` 相同）**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"memory.admin.config","params":{}}' \
  "$GATEWAY/plugins/memory/api/v1/call"
```

**4）`POST …/api/v1/call`：`memory.admin.list`**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"memory.admin.list","params":{"agentId":"main","tab":"user","page":1,"limit":2,"sortDesc":true}}' \
  "$GATEWAY/plugins/memory/api/v1/call"
```

**5）业务错误示例（空 `items` 删除）**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"memory.admin.delete","params":{"items":[]}}' \
  "$GATEWAY/plugins/memory/api/v1/call"
```

常见 HTTP `400`，body 形如 `{"error":"items required"}`。

**6）错误 token（`v1/call`）**

```bash
curl -sS -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"method":"memory.admin.config","params":{}}' \
  "$GATEWAY/plugins/memory/api/v1/call"
```

**7）旧版 `GET …/plugins/memory/api/config`（勿用）**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "$GATEWAY/plugins/memory/api/config"
```

预期 **`404`**。

---

## 三、Agent 工具（非 HTTP）

由网关注册为 **tool**；入参为工具调用 JSON，**不是**浏览器地址栏请求。

### 3.1 `memory_recall`

**入参**

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| `query` | tool 参数 | `string` | **是** | 检索语句 | 无 |
| `limit` | tool 参数 | `number` | 否 | 正整数；实际上限受插件约束 | 约 `30` |

**出参**（工具返回值，OpenClaw 惯例）

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `object[]` | 常为 `[{ "type": "text", "text": string }]`，给人/模型阅读 |
| `details` | `object` | 机器可读；子结构见下表（依场景不同） |

**`details` 常见形态**

| 场景 | `details` 类型 | 字段说明 |
|------|----------------|----------|
| 未配置插件 | `object` | `error`：`string`，如 `"not_configured"` |
| 无结果 | `object` | `count`：`number`，`0` |
| 有结果 | `object` | `count`：`number`；`memories`：`object[]`，元素见下表 |

**`details.memories` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 记忆行 ID |
| `text` | `string` | 正文 |
| `category` | `string` | 类型代码 |
| `importance` | `number` | 重要程度 |
| `score` | `number` | 相关度分数 |
| `createdAt` | `number` | 毫秒时间戳 |

---

### 3.2 `memory_store`

**入参**

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| `text` | tool 参数 | `string` | **是** | 待存储正文 | 无 |
| `importance` | tool 参数 | `number` | 否 | 建议 0～1 | `0.7` |
| `category` | tool 参数 | `string` | 否 | 枚举随配置；默认用户事实类 | `user_memory_fact` |

**出参**

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `object[]` | 文本摘要（`type: text`） |
| `details` | `object` | 成功时见下表；失败时常含 `error`：`string` |

**`details` 成功时（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `action` | `string` | `"created"` 或 `"updated"` |
| `id` | `string` | 记忆行 ID |

---

### 3.3 `memory_forget`

**入参**

| 参数 | 位置 | 类型 | 必须 | 合法值 / 说明 | 默认值 |
|------|------|------|------|----------------|--------|
| `memoryId` | tool 参数 | `string` | 否 | 行 UUID；与 `query` 二选一 | 无 |
| `query` | tool 参数 | `string` | 否 | 检索语句；与 `memoryId` 二选一 | 无 |

**出参**

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `object[]` | 文本说明 |
| `details` | `object` | 依场景不同，见下表 |

**`details` 常见形态**

| 场景 | 字段 | 类型 | 说明 |
|------|------|------|------|
| 未配置 | `error` | `string` | 如 `not_configured` |
| 缺参 | `error` | `string` | `missing_param` |
| 按 ID 删除成功 | `action` | `string` | `deleted` |
| 按 ID 删除成功 | `id` | `string` | 被删 ID |
| 按 ID 未找到 | `action` | `string` | `not_found` |
| 按 ID 未找到 | `id` | `string` | 请求的 ID |
| 按 query 无匹配 | `found` | `number` | `0` |
| 按 query 自动删除 | `action` | `string` | `deleted` |
| 按 query 自动删除 | `rows` | `number` | 删除行数 |
| 按 query 自动删除 | `id` | `string` | 代表行 ID |
| 按 query 仅候选 | `action` | `string` | `candidates` |
| 按 query 仅候选 | `candidates` | `object[]` | 元素含 `id`、`text`、`category`、`score` |

**`details.candidates` 数组元素（object）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 记忆 ID |
| `text` | `string` | 正文 |
| `category` | `string` | 类型 |
| `score` | `number` | 分数 |

---

## 四、附录

### A. `memory.admin.add` / 工具可用的类型代码（随配置增减）

| 场景 | 允许的 `category` 示例 |
|------|-------------------------|
| 始终 | `user_memory_fact`、`user_memory_preference`、`user_memory_decision` |
| 全文开启 | `full_context_user`、`full_context_assistant`、`full_context_system`、`full_context_tool`、`full_context_tool_result`、`full_context_others` |
| 自进化开启 | `self_improving_learnings`、`self_improving_errors`、`self_improving_feature_requests` |

### B. 运维备注

- Service id：`openclaw-memory-alibaba-local`；记忆面板另提供 **`GET /plugins/memory`** 与 **`POST …/plugins/memory/api/v1/call`**（见 §1.3），非独立进程端口。
- `autoRecall`、`autoCapture` 等为行为开关，无独立 URL。

---

*若与实现不一致，以仓库当前源码为准。*
