// Live Antigravity model discovery, capability-tier classification, and PROTOCOLO sync.
// Queries `agy models` so new releases (e.g. Gemini 4 Neon or future generations)
// are discovered automatically without maintaining static model lists by hand.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_MODELS_CACHE_FILE = join(homedir(), ".dsh", "antigravity", "models-cache.json");
export const DEFAULT_PROTOCOL_FILE = join(homedir(), ".dsh", "PROTOCOLO.md");
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const PROTOCOL_AUTO_START = "<!-- AUTO-ANTIGRAVITY-MODELS:START -->";
export const PROTOCOL_AUTO_END = "<!-- AUTO-ANTIGRAVITY-MODELS:END -->";

const EFFORT_WEIGHTS = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
});

const FAMILY_WEIGHTS = Object.freeze({
  "flash-lite": 10,
  flash: 20,
  hydrogen: 40,
  argon: 55,
  pro: 55,
  carbon: 70,
  neon: 75,
});

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\r/g;

/**
 * Strips terminal spinner/ANSI control sequences and parses `agy models` output
 * into normalized `{ id, name, provider, family, generation, effort, score }` entries.
 */
export function parseAgyModelsOutput(rawOutput) {
  const clean = String(rawOutput || "").replace(ANSI_RE, "\n");
  const seen = new Set();
  const models = [];

  for (const rawLine of clean.split("\n")) {
    const line = rawLine.trim();
    if (!line || /Fetching available models/i.test(line)) continue;
    // Non-TTY stdout uses a single `\t` (`<id>\t<Display Name>`); TTY pads with spaces.
    const match = line.match(/^([a-z0-9][a-z0-9._-]+)(?:\t|\s{2,})(.+)$/i);
    if (!match) continue;

    const id = match[1].trim();
    const name = match[2].trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    models.push(classifyModelEntry(id, name));
  }

  return models;
}

/** Classifies a single discovered model ID into family, generation, effort, and rank score. */
export function classifyModelEntry(id, name = id) {
  const lower = String(id).toLowerCase();
  const isOrchestrator = lower.includes("orchestrator");
  const provider = lower.startsWith("gemini")
    ? "gemini"
    : lower.startsWith("claude")
      ? "anthropic"
      : lower.startsWith("gpt")
        ? "openai"
        : "other";

  const genMatch = lower.match(/^gemini-(\d+(?:\.\d+)?)/);
  const generation = genMatch ? Number.parseFloat(genMatch[1]) : 0;

  let effort = "medium";
  for (const key of ["xhigh", "max", "high", "medium", "low"]) {
    if (lower.endsWith(`-${key}`)) {
      effort = key;
      break;
    }
  }

  let family = "unknown";
  let familyWeight = 30;
  for (const [famKey, weight] of Object.entries(FAMILY_WEIGHTS)) {
    if (lower.includes(famKey)) {
      family = famKey;
      familyWeight = weight;
      break;
    }
  }

  // Forward compatibility: unknown future Gemini codenames (e.g. gemini-4.5-<new>)
  // rank cleanly above Hydrogen/Flash so frontier resolution auto-promotes new models.
  if (provider === "gemini" && family === "unknown") {
    const tokens = lower.split("-").filter((t) => t !== "gemini" && !/^\d/.test(t) && !EFFORT_WEIGHTS[t]);
    family = tokens[0] || "custom";
    familyWeight = generation >= 4 ? 65 : 35;
  }

  const effortWeight = EFFORT_WEIGHTS[effort] ?? 2;
  const score = Math.round(generation * 1000) + familyWeight * 10 + effortWeight;

  return { id, name, provider, family, generation, effort, isOrchestrator, score };
}

/** Picks exact model IDs for capability tiers (`reflex`, `habit`, `neocortex`, `frontier`). */
export function computeCapabilityTiers(models) {
  const geminiModels = models.filter((m) => m.provider === "gemini" && !m.isOrchestrator);
  const pool = geminiModels.length > 0 ? geminiModels : models.filter((m) => !m.isOrchestrator);
  if (pool.length === 0) {
    return { reflex: null, habit: null, neocortex: null, frontier: null };
  }

  const byAsc = [...pool].sort((a, b) => a.score - b.score);
  const byDesc = [...pool].sort((a, b) => b.score - a.score);

  const pickFirst = (list, pred) => list.find(pred) || null;

  const reflex =
    pickFirst(byAsc, (m) => m.family.includes("flash") && m.effort === "low") ||
    pickFirst(byAsc, (m) => m.family.includes("flash")) ||
    byAsc[0];

  const habit =
    pickFirst(byDesc, (m) => m.family === "hydrogen" && m.effort === "medium") ||
    pickFirst(byDesc, (m) => m.family === "argon" && m.effort === "medium") ||
    pickFirst(byDesc, (m) => !m.family.includes("flash") && m.effort === "medium") ||
    pickFirst(byDesc, (m) => m.family.includes("flash") && m.effort === "high") ||
    byDesc[Math.min(byDesc.length - 1, Math.floor(byDesc.length / 2))];

  const neocortex =
    pickFirst(byDesc, (m) => (m.score >= (byDesc[0]?.score ?? 0) - 5) && m.effort === "high") ||
    pickFirst(byDesc, (m) => m.family === "hydrogen" && (m.effort === "xhigh" || m.effort === "high")) ||
    byDesc[0];

  const frontier = byDesc[0];

  return {
    reflex: reflex ? { id: reflex.id, name: reflex.name } : null,
    habit: habit ? { id: habit.id, name: habit.name } : null,
    neocortex: neocortex ? { id: neocortex.id, name: neocortex.name } : null,
    frontier: frontier ? { id: frontier.id, name: frontier.name } : null,
  };
}

/** Resolves `auto:<tier>` or codename aliases (`neon`, `argon`, `hydrogen`, `flash`) against live catalog. */
export function resolveAntigravityModel(requestedModel, catalog) {
  const raw = String(requestedModel || "").trim();
  if (!raw) return null;
  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) return raw;

  const lower = raw.toLowerCase();
  if (lower === "auto") {
    return catalog.tiers?.habit?.id || raw;
  }
  const tierMatch = lower.match(/^auto:(reflex|habit|neocortex|frontier)$/);
  if (tierMatch && catalog.tiers?.[tierMatch[1]]?.id) {
    return catalog.tiers[tierMatch[1]].id;
  }

  // Exact match
  const exact = catalog.models.find((m) => m.id.toLowerCase() === lower);
  if (exact) return exact.id;

  // Friendly family alias e.g. "neon", "neon-high", "argon", "hydrogen"
  const familyMatches = catalog.models
    .filter((m) => m.provider === "gemini" && m.id.toLowerCase().includes(lower))
    .sort((a, b) => b.score - a.score);
  if (familyMatches.length > 0) return familyMatches[0].id;

  return raw;
}

/** Reads cached catalog from disk without throwing. */
export function readCachedModelCatalog(cacheFile = DEFAULT_MODELS_CACHE_FILE) {
  try {
    if (!existsSync(cacheFile)) return null;
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    return parsed && Array.isArray(parsed.models) ? parsed : null;
  } catch {
    return null;
  }
}

/** Formats the auto-managed markdown block inserted into `~/.dsh/PROTOCOLO.md`. */
export function renderProtocolAutoSection(catalog) {
  const t = catalog.tiers || {};
  const fmt = (entry) => (entry ? `\`${entry.id}\` (${entry.name})` : "*(auto)*");
  const allGemini = catalog.models.filter((m) => m.provider === "gemini").map((m) => `\`${m.id}\``);
  return [
    PROTOCOL_AUTO_START,
    `<!-- Updated automatically from \`agy models\` at ${catalog.updatedAt} (${catalog.models.length} models discovered) -->`,
    "",
    "| Task level (auto tier) | Resolved Antigravity model | DSH |",
    "|---|---|---|",
    `| \`auto:reflex\` — read / summarize / classify / quick audit | ${fmt(t.reflex)} | Flash |`,
    `| \`auto:habit\` — bounded code, closed spec, tests, one-line fix | ${fmt(t.habit)} | Pro (bounded) |`,
    `| \`auto:neocortex\` — new architecture, multi-file bugs, external docs/APIs | ${fmt(t.neocortex)} | Pro (auditor, repo-only) |`,
    `| \`auto:frontier\` — structural redesign, legal/financial, after 2 failures | ${fmt(t.frontier)} | Pro (\`max\`) |`,
    "",
    `Live Gemini models in Antigravity (${allGemini.length}): ${allGemini.join(", ")}.`,
    PROTOCOL_AUTO_END,
  ].join("\n");
}

/** Updates only the managed auto-table inside `~/.dsh/PROTOCOLO.md` when changed. */
export function syncProtocolAutoSection(catalog, protocolFile = DEFAULT_PROTOCOL_FILE) {
  if (!existsSync(protocolFile)) return { updated: false, reason: "protocol_missing" };
  const current = readFileSync(protocolFile, "utf8");
  const startIdx = current.indexOf(PROTOCOL_AUTO_START);
  const endIdx = current.indexOf(PROTOCOL_AUTO_END);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return { updated: false, reason: "markers_missing" };
  }

  const nextBlock = renderProtocolAutoSection(catalog);
  // Compare stripped of timestamp line so unchanged model catalogs do not churn git/mtime.
  const stripTs = (s) => s.replace(/<!-- Updated automatically from .*?-->\n?/g, "");
  const existingBlock = current.slice(startIdx, endIdx + PROTOCOL_AUTO_END.length);
  if (stripTs(existingBlock) === stripTs(nextBlock)) {
    return { updated: false, reason: "unchanged" };
  }

  const updated =
    current.slice(0, startIdx) +
    nextBlock +
    current.slice(endIdx + PROTOCOL_AUTO_END.length);
  writeFileSync(protocolFile, updated, { encoding: "utf8", mode: 0o600 });
  return { updated: true };
}

/** Runs `agy models` asynchronously with bounded timeout and writes cache + PROTOCOLO table. */
export function queryLiveAgyModels({ agyBin, timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = execFile(agyBin || "agy", ["models"], { timeout: timeoutMs }, (err, stdout, stderr) => {
      const combined = `${stdout || ""}\n${stderr || ""}`;
      const models = parseAgyModelsOutput(combined);
      if (err && models.length === 0) {
        resolvePromise({ ok: false, error: err.message || String(err), models: [] });
        return;
      }
      resolvePromise({ ok: models.length > 0, error: err ? err.message : null, models });
    });
    if (child && typeof child.unref === "function") child.unref();
  });
}

/**
 * Discovers live Antigravity models (`agy models`), caches them to `~/.dsh/antigravity/models-cache.json`,
 * and keeps `~/.dsh/PROTOCOLO.md` synchronized automatically whenever a new model appears or retires.
 */
export async function syncAntigravityModels({
  agyBin = "agy",
  cacheFile = DEFAULT_MODELS_CACHE_FILE,
  protocolFile = DEFAULT_PROTOCOL_FILE,
  force = false,
  ttlMs = CACHE_TTL_MS,
} = {}) {
  if (!force) {
    const cached = readCachedModelCatalog(cacheFile);
    if (cached && cached.updatedAtMs && (Date.now() - cached.updatedAtMs) < ttlMs) {
      const proto = syncProtocolAutoSection(cached, protocolFile);
      return { ok: true, source: "cache", catalog: cached, protocolSync: proto };
    }
  }

  const live = await queryLiveAgyModels({ agyBin });
  if (!live.ok || live.models.length === 0) {
    const fallback = readCachedModelCatalog(cacheFile);
    return {
      ok: Boolean(fallback),
      source: fallback ? "stale-cache" : "unavailable",
      error: live.error || "no_models_parsed",
      catalog: fallback,
      protocolSync: { updated: false, reason: "live_failed" },
    };
  }

  const catalog = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    agyBin,
    models: live.models,
    tiers: computeCapabilityTiers(live.models),
  };

  try {
    mkdirSync(dirname(cacheFile), { recursive: true, mode: 0o700 });
    writeFileSync(cacheFile, JSON.stringify(catalog, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch { /* non-fatal */ }

  const protocolSync = syncProtocolAutoSection(catalog, protocolFile);
  return { ok: true, source: "live", catalog, protocolSync };
}
