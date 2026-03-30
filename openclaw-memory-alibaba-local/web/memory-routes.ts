/**
 * Memory admin panel — /plugins/memory (HTML shell) + Gateway WebSocket RPC (memory.admin.*).
 * Auth aligned with OpenClaw gateway: connect with gateway token + operator scopes (same as Control UI).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayRequestHandlerOptions, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getMemoryPanelHtml } from "./memory-ui.js";
import {
  opMemoryAdminAdd,
  opMemoryAdminConfig,
  opMemoryAdminDashboard,
  opMemoryAdminDelete,
  opMemoryAdminFacets,
  opMemoryAdminList,
  type AdminOpResult,
  type MemoryAdminOpsContext,
  type MemoryAdminOpsOpts,
} from "./memory-admin-ops.js";

export type MemoryPanelRoutesOpts = MemoryAdminOpsOpts;

/** 异步初始化完成后再解析出 admin 用的 db/cfg（避免 WS 在 embedding 编译完成前报 unknown method）。 */
export type AdminOpsContextProvider = () => Promise<MemoryAdminOpsContext>;

export type RegisterHttpRoute = (params: {
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean | void> | boolean | void;
  auth: "gateway" | "plugin";
  match?: "exact" | "prefix";
  replaceExisting?: boolean;
}) => void;

type PluginLogger = { info: (m: string) => void; warn: (m: string) => void };

type RegisterGatewayMethod = OpenClawPluginApi["registerGatewayMethod"];

function resolveGatewayToken(): string | undefined {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const openclawConfigPath = process.env.OPENCLAW_CONFIG_PATH ?? path.join(stateDir, "openclaw.json");
  try {
    if (fs.existsSync(openclawConfigPath)) {
      const raw = fs.readFileSync(openclawConfigPath, "utf8");
      let t: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { gateway?: { auth?: { token?: string } } };
        t = parsed?.gateway?.auth?.token;
      } catch {
        const m = raw.match(
          /"gateway"\s*:\s*\{[\s\S]*?"auth"\s*:\s*\{[\s\S]*?"token"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );
        t = m?.[1]?.replace(/\\(.)/g, "$1");
      }
      if (typeof t === "string" && t.length > 0) {
        return t;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function parseUrl(req: IncomingMessage): URL {
  return new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
  res.end(html);
}

function applyAdminOpResult(respond: GatewayRequestHandlerOptions["respond"], result: AdminOpResult): void {
  if (result.ok) {
    respond(true, result.data);
    return;
  }
  const msg =
    typeof result.body.error === "string"
      ? result.body.error
      : JSON.stringify(result.body.error ?? result.body);
  respond(false, { ...result.body, status: result.status }, { message: msg, code: `http_${result.status}` });
}

/** Gateway WebSocket methods: memory.admin.config | facets | dashboard | list | delete | add */
export function registerMemoryAdminGatewayMethods(
  registerGatewayMethod: RegisterGatewayMethod,
  getCtx: AdminOpsContextProvider,
  logger: PluginLogger,
): void {
  registerGatewayMethod("memory.admin.config", async ({ params, respond }) => {
    void params;
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminConfig(ctxBase));
    } catch (e) {
      logger.warn(`memory.admin.config: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  registerGatewayMethod("memory.admin.facets", async ({ params, respond }) => {
    void params;
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminFacets(ctxBase));
    } catch (e) {
      logger.warn(`memory.admin.facets: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  registerGatewayMethod("memory.admin.dashboard", async ({ params, respond }) => {
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminDashboard(ctxBase, params ?? {}));
    } catch (e) {
      logger.warn(`memory.admin.dashboard: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  registerGatewayMethod("memory.admin.list", async ({ params, respond }) => {
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminList(ctxBase, params ?? {}));
    } catch (e) {
      logger.warn(`memory.admin.list: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  registerGatewayMethod("memory.admin.delete", async ({ params, respond }) => {
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminDelete(ctxBase, params ?? {}));
    } catch (e) {
      logger.warn(`memory.admin.delete: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  registerGatewayMethod("memory.admin.add", async ({ params, respond }) => {
    try {
      const ctxBase = await getCtx();
      applyAdminOpResult(respond, await opMemoryAdminAdd(ctxBase, params ?? {}));
    } catch (e) {
      logger.warn(`memory.admin.add: ${String(e)}`);
      respond(false, { error: String(e) });
    }
  });

  logger.info("[openclaw-memory-alibaba-local] Memory admin Gateway methods: memory.admin.* (config, facets, dashboard, list, delete, add)");
}

async function readJsonBody(req: IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on("data", (chunk: Buffer) => {
      n += chunk.length;
      if (n > maxBytes) {
        req.destroy();
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function dispatchMemoryAdminRpc(
  ctx: MemoryAdminOpsContext,
  method: string,
  params: unknown,
): Promise<AdminOpResult> {
  switch (method) {
    case "memory.admin.config":
      return opMemoryAdminConfig(ctx);
    case "memory.admin.facets":
      return opMemoryAdminFacets(ctx);
    case "memory.admin.dashboard":
      return opMemoryAdminDashboard(ctx, (params as Record<string, unknown>) ?? {});
    case "memory.admin.list":
      return opMemoryAdminList(ctx, (params as Record<string, unknown>) ?? {});
    case "memory.admin.delete":
      return opMemoryAdminDelete(ctx, (params as Record<string, unknown>) ?? {});
    case "memory.admin.add":
      return opMemoryAdminAdd(ctx, (params as Record<string, unknown>) ?? {});
    default:
      return { ok: false, status: 404, body: { error: "unknown method", method } };
  }
}

/**
 * HTTP: HTML at /plugins/memory；同源 HTTP POST /plugins/memory/api/v1/call 供非本机访问（仅需 gateway token，不经 WS operator scope）。
 */
export function registerMemoryPanelRoutes(
  registerHttpRoute: RegisterHttpRoute,
  getCtx: AdminOpsContextProvider,
  logger: PluginLogger,
): void {
  const requiredToken = resolveGatewayToken();
  const token = typeof requiredToken === "string" && requiredToken.length > 0 ? requiredToken : undefined;

  registerHttpRoute({
    path: "/plugins/memory",
    auth: "plugin",
    match: "prefix",
    handler: async (req, res) => {
      try {
        const url = parseUrl(req);
        const p = url.pathname;
        const isMemoryApi = p.startsWith("/plugins/memory/api/");

        if (isMemoryApi) {
          if (token) {
            const queryToken = (url.searchParams.get("token") ?? "").trim();
            const authHeader = (req.headers.authorization ?? req.headers.Authorization ?? "") as string;
            const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
            if (queryToken !== token && bearer !== token) {
              sendJson(res, 401, { error: { message: "Unauthorized", type: "unauthorized" } });
              return true;
            }
          }

          if (p === "/plugins/memory/api/v1/call" && req.method === "POST") {
            let raw: string;
            try {
              raw = await readJsonBody(req);
            } catch {
              sendJson(res, 400, { error: "invalid body" });
              return true;
            }
            let body: { method?: string; params?: unknown };
            try {
              body = JSON.parse(raw || "{}") as { method?: string; params?: unknown };
            } catch {
              sendJson(res, 400, { error: "invalid json" });
              return true;
            }
            const method = typeof body.method === "string" ? body.method.trim() : "";
            if (!method) {
              sendJson(res, 400, { error: "missing method" });
              return true;
            }
            try {
              const ctxBase = await getCtx();
              const result = await dispatchMemoryAdminRpc(ctxBase, method, body.params ?? {});
              if (result.ok) {
                sendJson(res, 200, result.data as unknown);
              } else {
                sendJson(res, result.status, { ...result.body, status: result.status });
              }
            } catch (e) {
              logger.warn(`memory api/v1/call ${method}: ${String(e)}`);
              sendJson(res, 500, { error: String(e) });
            }
            return true;
          }

          sendJson(res, 404, {
            error: "not found",
            detail: "POST /plugins/memory/api/v1/call with JSON { method, params } (same as memory.admin.* WebSocket RPC)",
          });
          return true;
        }

        sendHtml(res, getMemoryPanelHtml());
        return true;
      } catch (err) {
        logger.warn(`openclaw-memory-alibaba-local memory panel: ${String(err)}`);
        sendJson(res, 500, { error: "Internal error" });
        return true;
      }
    },
  });

  logger.info(
    "[openclaw-memory-alibaba-local] Memory admin UI at /plugins/memory/ (WS memory.admin.* on loopback; HTTP POST .../api/v1/call for remote)",
  );
}
