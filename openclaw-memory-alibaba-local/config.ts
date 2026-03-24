import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryCategory } from "./categories.js";
import { ALL_CATEGORIES, USER_MEMORY_FACT } from "./categories.js";

/** OpenAI-compatible HTTP embeddings; all fields required — invalid/empty values fail on first embed, not at startup. */
export type EmbeddingConfigRemote = {
  mode: "remote";
  apiKey: string;
  model: string;
  baseUrl: string;
  dimensions: number;
  maxToken: number;
};

/** Local `llama-embedding` (stdin) or compatible CLI; defaults: commandPrefix, dimensions 768, maxToken 2048. */
export type EmbeddingConfigLocal = {
  mode: "local";
  commandPrefix?: string;
  dimensions?: number;
  maxToken?: number;
};

export type EmbeddingConfig = EmbeddingConfigRemote | EmbeddingConfigLocal;

export type LLMConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type MemoryConfig = {
  /** Omitted when plugin is loaded without embedding (e.g. npm install); required at runtime for memory ops. */
  embedding?: EmbeddingConfig;
  /** LanceDB directory; same default as OpenClaw memory-lancedb (~/.openclaw/memory/lancedb). */
  dbPath?: string;
  /** LLM decides insert vs update among similar memories; requires llm. Default true; set false to disable. */
  memory_duplication_conflict_process: boolean;
  /** Required when memory_duplication_conflict_process is true or memoryExtractionMethod is "llm". */
  llm?: LLMConfig;
  similarityThresholdUserMemory: number;
  similarityThresholdSelfImproving: number;
  /** Full-context snapshots per role per session. Default true; set false to disable. */
  enableFullContextMemory: boolean;
  /** self_improving_* capture + recall. Default true; set false to disable. */
  enableSelfImprovingMemory: boolean;
  memoryExtractionMethod: "regex" | "llm";
  autoRecall: boolean;
  autoCapture: boolean;
  captureMaxChars: number;
  /** Recall time decay. Default true; set false to disable. */
  enableMemoryDecay: boolean;
  memoryDecayHalfLifeDays: number;
  memoryDecayStrategy: "exponential" | "linear" | "none";
};

/** Re-export for tools and DB (user_memory_* + full_context + self_improving_*) */
export { ALL_CATEGORIES, USER_MEMORY_FACT };
export type { MemoryCategory };

export const DEFAULT_CAPTURE_MAX_CHARS = 50000;

const LEGACY_STATE_DIRS: string[] = [];

function resolveDefaultDbPath(): string {
  const home = homedir();
  const preferred = join(home, ".openclaw", "memory", "lancedb");
  try {
    if (fs.existsSync(preferred)) {
      return preferred;
    }
  } catch {
    // best-effort
  }

  for (const legacy of LEGACY_STATE_DIRS) {
    const candidate = join(home, legacy, "memory", "lancedb");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // best-effort
    }
  }

  return preferred;
}

export const DEFAULT_DB_PATH = resolveDefaultDbPath();

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-v3": 1024,
  "text-embedding-v2": 1536,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "embed-english-v3.0": 1024,
  "embed-multilingual-v3.0": 1024,
  "embed-english-light-v3.0": 384,
  "embed-multilingual-light-v3.0": 384,
  "jina-embeddings-v3": 1024,
  "jina-embeddings-v2-base-en": 768,
  "jina-embeddings-v2-base-zh": 768,
  "bge-large-zh-v1.5": 1024,
  "bge-large-en-v1.5": 1024,
  "bge-m3": 1024,
  "nomic-embed-text": 768,
  "text-embedding-004": 768,
};

const FLEX_DIMS_MODELS = new Set([
  "text-embedding-v3",
  "text-embedding-3-small",
  "text-embedding-3-large",
  "jina-embeddings-v3",
]);

export function vectorDimsForModel(model: string, explicit?: number): number {
  if (explicit && explicit > 0) {
    return explicit;
  }
  return EMBEDDING_DIMENSIONS[model] ?? 1024;
}

export function embeddingVectorDim(cfg: EmbeddingConfig): number {
  return cfg.mode === "remote" ? cfg.dimensions : (cfg.dimensions ?? 768);
}

export function modelSupportsFlexDimensions(model: string): boolean {
  return FLEX_DIMS_MODELS.has(model);
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
  }
}

function requireString(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${label}.${key} is required and must be a non-empty string`);
  }
  return v;
}

const DEFAULT_REMOTE_EMBED_DIMENSIONS = 1024;
const DEFAULT_REMOTE_EMBED_MAX_TOKEN = 2048;

/**
 * Normalize host JSON: missing mode → infer `remote` if any HTTP embedding fields present, else `local`.
 */
export function normalizeEmbeddingInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { mode: "local" };
  }
  const e = { ...(raw as Record<string, unknown>) };
  if (e.mode === "remote" || e.mode === "local") {
    return e;
  }
  const hasRemoteHints =
    (typeof e.apiKey === "string" && e.apiKey.trim().length > 0) ||
    (typeof e.model === "string" && e.model.trim().length > 0) ||
    (typeof e.baseUrl === "string" && e.baseUrl.trim().length > 0) ||
    (typeof e.dimensions === "number" && Number.isFinite(e.dimensions));
  if (hasRemoteHints) {
    e.mode = "remote";
    return e;
  }
  e.mode = "local";
  return e;
}

function parseEmbeddingConfig(raw: unknown): EmbeddingConfig {
  const e = normalizeEmbeddingInput(raw);
  const mode = e.mode === "remote" ? "remote" : "local";
  if (mode === "remote") {
    assertAllowedKeys(e, ["mode", "apiKey", "model", "baseUrl", "dimensions", "maxToken"], "embedding");
    const dimensions =
      typeof e.dimensions === "number" && Number.isFinite(e.dimensions) && e.dimensions > 0
        ? e.dimensions
        : DEFAULT_REMOTE_EMBED_DIMENSIONS;
    const maxToken =
      typeof e.maxToken === "number" && Number.isFinite(e.maxToken) && e.maxToken > 0
        ? e.maxToken
        : DEFAULT_REMOTE_EMBED_MAX_TOKEN;
    return {
      mode: "remote",
      apiKey: typeof e.apiKey === "string" ? e.apiKey : "",
      model: typeof e.model === "string" ? e.model : "",
      baseUrl: typeof e.baseUrl === "string" ? e.baseUrl : "",
      dimensions,
      maxToken,
    };
  }
  assertAllowedKeys(e, ["mode", "commandPrefix", "dimensions", "maxToken"], "embedding");
  return {
    mode: "local",
    commandPrefix: typeof e.commandPrefix === "string" && e.commandPrefix.trim() ? e.commandPrefix.trim() : undefined,
    dimensions: typeof e.dimensions === "number" && Number.isFinite(e.dimensions) ? e.dimensions : undefined,
    maxToken: typeof e.maxToken === "number" && Number.isFinite(e.maxToken) ? e.maxToken : undefined,
  };
}

const DEFAULT_LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** Resolve ~/.openclaw/openclaw.json (or OPENCLAW_CONFIG_PATH / OPENCLAW_STATE_DIR). */
function resolveOpenclawJsonPath(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || join(homedir(), ".openclaw");
  return process.env.OPENCLAW_CONFIG_PATH?.trim() || join(stateDir, "openclaw.json");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * OpenClaw `agents.defaults.model` is `provider/model` string or `{ primary?: string, ... }`.
 * Chat Completions (DashScope compat) expects the model id without the `bailian/` prefix.
 */
export function normalizeAgentsPrimaryModelForLlmApi(primary: string): string {
  const t = primary.trim();
  const i = t.indexOf("/");
  if (i <= 0) {
    return t;
  }
  const provider = t.slice(0, i).toLowerCase();
  const rest = t.slice(i + 1).trim();
  if (!rest) {
    return t;
  }
  if (provider === "bailian" || provider === "dashscope") {
    return rest;
  }
  return rest;
}

function coerceProviderApiKey(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const source = typeof value.source === "string" ? value.source : "";
  const id = typeof value.id === "string" ? value.id : "";
  if (source === "env" && id && process.env[id]) {
    return process.env[id]!;
  }
  return undefined;
}

export type OpenclawJsonLlmDefaults = {
  apiKey?: string;
  baseUrl?: string;
  /** Already normalized for Chat Completions `model` field when sourced from agents.defaults.model.primary */
  model?: string;
};

/**
 * Read defaults for plugin `llm` from host OpenClaw config:
 * - models.providers.bailian.apiKey / baseUrl
 * - agents.defaults.model (string or { primary }) → normalized model id for API
 */
export function readOpenclawJsonLlmDefaults(): OpenclawJsonLlmDefaults | null {
  try {
    const p = resolveOpenclawJsonPath();
    if (!fs.existsSync(p)) {
      return null;
    }
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw) as unknown;
    if (!isRecord(json)) {
      return null;
    }
    const models = json.models;
    const providers = isRecord(models) && isRecord(models.providers) ? models.providers : undefined;
    const bailian = providers && isRecord(providers.bailian) ? providers.bailian : undefined;

    const apiKey = bailian ? coerceProviderApiKey(bailian.apiKey) : undefined;
    const baseUrl =
      bailian && typeof bailian.baseUrl === "string" && bailian.baseUrl.trim()
        ? bailian.baseUrl.trim()
        : undefined;

    const agents = isRecord(json.agents) ? json.agents : undefined;
    const defaults = agents && isRecord(agents.defaults) ? agents.defaults : undefined;
    const modelCfg = defaults?.model;
    let primaryRaw: string | undefined;
    if (typeof modelCfg === "string" && modelCfg.trim()) {
      primaryRaw = modelCfg.trim();
    } else if (isRecord(modelCfg) && typeof modelCfg.primary === "string" && modelCfg.primary.trim()) {
      primaryRaw = modelCfg.primary.trim();
    }
    const model = primaryRaw ? normalizeAgentsPrimaryModelForLlmApi(primaryRaw) : undefined;

    if (!apiKey && !baseUrl && !model) {
      return null;
    }
    return { apiKey, baseUrl, model };
  } catch {
    return null;
  }
}

function pickNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parseLLMConfig(
  raw: unknown,
  openclawDefaults: OpenclawJsonLlmDefaults | null,
): LLMConfig {
  const l =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  assertAllowedKeys(l, ["apiKey", "model", "baseUrl"], "llm");

  const apiKeyRaw = pickNonEmptyString(l.apiKey) ?? openclawDefaults?.apiKey;
  if (!apiKeyRaw) {
    throw new Error(
      "llm.apiKey is required (set in plugin config or models.providers.bailian.apiKey in openclaw.json)",
    );
  }
  const apiKey = resolveEnvVars(apiKeyRaw);

  const modelRaw = pickNonEmptyString(l.model) ?? openclawDefaults?.model;
  if (!modelRaw) {
    throw new Error(
      'llm.model is required (set in plugin config or agents.defaults.model.primary in openclaw.json as "bailian/your-model")',
    );
  }
  const model = normalizeAgentsPrimaryModelForLlmApi(modelRaw);

  const baseUrlRaw = pickNonEmptyString(l.baseUrl) ?? openclawDefaults?.baseUrl;
  const baseUrl = baseUrlRaw ? resolveEnvVars(baseUrlRaw) : DEFAULT_LLM_BASE_URL;

  return { apiKey, model, baseUrl };
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      value = {};
    }
    const cfg = value as Record<string, unknown>;

    assertAllowedKeys(
      cfg,
      [
        "embedding",
        "dbPath",
        "memory_duplication_conflict_process",
        "llm",
        "similarityThresholdUserMemory",
        "similarityThresholdSelfImproving",
        "enableFullContextMemory",
        "enableSelfImprovingMemory",
        "memoryExtractionMethod",
        "autoRecall",
        "autoCapture",
        "captureMaxChars",
        "enableMemoryDecay",
        "memoryDecayHalfLifeDays",
        "memoryDecayStrategy",
      ],
      "memory config",
    );

    const dbPath =
      typeof cfg.dbPath === "string" && cfg.dbPath.length > 0 ? cfg.dbPath : DEFAULT_DB_PATH;

    /** Default on: LLM resolves insert vs update when similar memories exist (opt out with false). */
    let memory_duplication_conflict_process = cfg.memory_duplication_conflict_process !== false;
    const rawMethod =
      typeof cfg.memoryExtractionMethod === "string" ? cfg.memoryExtractionMethod.trim().toLowerCase() : "";
    let memoryExtractionMethod: "regex" | "llm" = rawMethod === "regex" ? "regex" : "llm";
    const openclawLlmDefaults = readOpenclawJsonLlmDefaults();
    const hasPluginLlm = cfg.llm && typeof cfg.llm === "object" && !Array.isArray(cfg.llm);
    const canFillFromOpenclaw =
      !!openclawLlmDefaults && !!(openclawLlmDefaults.apiKey && openclawLlmDefaults.model);
    let needsLlm = memory_duplication_conflict_process || memoryExtractionMethod === "llm";
    if (needsLlm && !hasPluginLlm && !canFillFromOpenclaw) {
      memoryExtractionMethod = "regex";
      memory_duplication_conflict_process = false;
      needsLlm = false;
    }

    const similarityThresholdUserMemory =
      typeof cfg.similarityThresholdUserMemory === "number" ? cfg.similarityThresholdUserMemory : 0.65;
    const similarityThresholdSelfImproving =
      typeof cfg.similarityThresholdSelfImproving === "number" ? cfg.similarityThresholdSelfImproving : 0.62;
    if (
      similarityThresholdUserMemory < 0 ||
      similarityThresholdUserMemory > 1 ||
      similarityThresholdSelfImproving < 0 ||
      similarityThresholdSelfImproving > 1
    ) {
      throw new Error("similarityThresholdUserMemory and similarityThresholdSelfImproving must be between 0 and 1");
    }

    /** Default on: always persist per-role full_context_* per session when autoCapture runs (opt out with false). */
    const enableFullContextMemory = cfg.enableFullContextMemory !== false;
    /** Default on: self_improving_* write + recall (opt out with false). */
    const enableSelfImprovingMemory = cfg.enableSelfImprovingMemory !== false;

    const captureMaxChars =
      typeof cfg.captureMaxChars === "number" ? Math.floor(cfg.captureMaxChars) : undefined;
    if (typeof captureMaxChars === "number" && (captureMaxChars < 100 || captureMaxChars > 100_000)) {
      throw new Error("captureMaxChars must be between 100 and 100000");
    }

    /** Default on: time decay on recall scores (opt out with false). */
    const enableMemoryDecay = cfg.enableMemoryDecay !== false;
    const memoryDecayHalfLifeDaysRaw =
      typeof cfg.memoryDecayHalfLifeDays === "number" && Number.isFinite(cfg.memoryDecayHalfLifeDays)
        ? Math.floor(cfg.memoryDecayHalfLifeDays)
        : 30;
    const memoryDecayHalfLifeDays = Math.max(1, Math.min(3650, memoryDecayHalfLifeDaysRaw));
    const decayRaw =
      typeof cfg.memoryDecayStrategy === "string" ? cfg.memoryDecayStrategy.trim().toLowerCase() : "";
    const memoryDecayStrategy: "exponential" | "linear" | "none" =
      decayRaw === "linear" ? "linear" : decayRaw === "none" ? "none" : "exponential";

    return {
      embedding: parseEmbeddingConfig(cfg.embedding),
      dbPath,
      memory_duplication_conflict_process,
      llm: needsLlm ? parseLLMConfig(cfg.llm, openclawLlmDefaults) : undefined,
      similarityThresholdUserMemory,
      similarityThresholdSelfImproving,
      enableFullContextMemory,
      enableSelfImprovingMemory,
      memoryExtractionMethod,
      autoRecall: cfg.autoRecall !== false,
      autoCapture: cfg.autoCapture !== false,
      captureMaxChars: captureMaxChars ?? DEFAULT_CAPTURE_MAX_CHARS,
      enableMemoryDecay,
      memoryDecayHalfLifeDays,
      memoryDecayStrategy,
    };
  },
};
