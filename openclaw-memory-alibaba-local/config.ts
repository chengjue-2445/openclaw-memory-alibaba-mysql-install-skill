import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryCategory } from "./categories.js";
import { ALL_CATEGORIES, USER_MEMORY_FACT } from "./categories.js";

export type EmbeddingConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  dimensions?: number;
};

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

const DEFAULT_MODEL = "text-embedding-v3";
const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
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

function parseEmbeddingConfig(raw: unknown): EmbeddingConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("embedding config is required");
  }
  const e = raw as Record<string, unknown>;
  assertAllowedKeys(e, ["apiKey", "model", "baseUrl", "dimensions"], "embedding");

  const model = typeof e.model === "string" ? e.model : DEFAULT_MODEL;
  const explicitDims = typeof e.dimensions === "number" ? e.dimensions : undefined;

  return {
    apiKey: resolveEnvVars(requireString(e, "apiKey", "embedding")),
    model,
    baseUrl: typeof e.baseUrl === "string" ? resolveEnvVars(e.baseUrl) : DEFAULT_BASE_URL,
    dimensions: explicitDims,
  };
}

const DEFAULT_LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

function parseLLMConfig(raw: unknown): LLMConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("llm config is required when memory_duplication_conflict_process is true");
  }
  const l = raw as Record<string, unknown>;
  assertAllowedKeys(l, ["apiKey", "model", "baseUrl"], "llm");
  return {
    apiKey: resolveEnvVars(requireString(l, "apiKey", "llm")),
    model: requireString(l, "model", "llm"),
    baseUrl: typeof l.baseUrl === "string" ? resolveEnvVars(l.baseUrl) : DEFAULT_LLM_BASE_URL,
  };
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

    if (
      !cfg.embedding ||
      typeof cfg.embedding !== "object" ||
      Array.isArray(cfg.embedding) ||
      typeof (cfg.embedding as Record<string, unknown>).apiKey !== "string"
    ) {
      const capChars =
        typeof cfg.captureMaxChars === "number" && cfg.captureMaxChars >= 100 && cfg.captureMaxChars <= 100_000
          ? Math.floor(cfg.captureMaxChars)
          : DEFAULT_CAPTURE_MAX_CHARS;
      return {
        embedding: undefined,
        dbPath,
        memory_duplication_conflict_process: false,
        llm: undefined,
        similarityThresholdUserMemory: 0.65,
        similarityThresholdSelfImproving: 0.62,
        enableFullContextMemory: true,
        enableSelfImprovingMemory: true,
        memoryExtractionMethod: "llm",
        autoRecall: cfg.autoRecall !== false,
        autoCapture: cfg.autoCapture !== false,
        captureMaxChars: capChars,
        enableMemoryDecay: true,
        memoryDecayHalfLifeDays: 30,
        memoryDecayStrategy: "exponential",
      };
    }

    /** Default on: LLM resolves insert vs update when similar memories exist (opt out with false). */
    const memory_duplication_conflict_process = cfg.memory_duplication_conflict_process !== false;
    const rawMethod =
      typeof cfg.memoryExtractionMethod === "string" ? cfg.memoryExtractionMethod.trim().toLowerCase() : "";
    const memoryExtractionMethod: "regex" | "llm" = rawMethod === "regex" ? "regex" : "llm";
    const needsLlm = memory_duplication_conflict_process || memoryExtractionMethod === "llm";
    if (needsLlm && (!cfg.llm || typeof cfg.llm !== "object")) {
      throw new Error(
        'llm config is required when memory_duplication_conflict_process is true or memoryExtractionMethod is "llm"',
      );
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
    const memoryDecayHalfLifeDays = 30;
    const memoryDecayStrategy: "exponential" | "linear" | "none" = "exponential";

    return {
      embedding: parseEmbeddingConfig(cfg.embedding),
      dbPath,
      memory_duplication_conflict_process,
      llm: needsLlm ? parseLLMConfig(cfg.llm) : undefined,
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
