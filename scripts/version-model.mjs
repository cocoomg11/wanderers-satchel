/**
 * Versions and the update check, pure (tested in Node). The fetch, the clock and the storage are passed in, so nothing here touches
 * the network or Foundry by itself.
 *
 * Where the latest version comes from: a manifest on GitHub's "latest release" download URL redirects to a release asset that a
 * browser may not read (no CORS headers), so for those the GitHub REST API's latest release (which allows browser reads) is asked
 * for its tag instead. Any other manifest URL is fetched as JSON and its "version" read.
 */

import { parseVersion, compareVersions } from "../vendor/wanderers-core/index.mjs";

/** Version parsing and comparing come from wanderers-core (semver ordering, "v" prefix, missing parts count as 0). */
export { parseVersion, compareVersions };

const GH = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/(?:latest\/download|download\/[^/]+)\/[^/?#]+\.json(?:[?#].*)?$/;

/** Where to read the latest version of a manifest URL: { kind: "github", url, repo } | { kind: "manifest", url } | null. */
export function updateSource(manifest) {
  if (typeof manifest !== "string" || !/^https?:\/\//i.test(manifest.trim())) return null;
  const url = manifest.trim();
  const m = GH.exec(url);
  if (m) return { kind: "github", repo: `${m[1]}/${m[2]}`, url: `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest` };
  return { kind: "manifest", url };
}

/** How long answers are kept: a good answer for 6 hours, a failure for 15 minutes (so a flaky connection is tried again soon). */
export const CACHE_OK_MS = 6 * 60 * 60 * 1000;
export const CACHE_FAIL_MS = 15 * 60 * 1000;
export const TIMEOUT_MS = 8000;

/**
 * A small cache over a storage with getItem/setItem/removeItem (sessionStorage in Foundry, a Map-backed fake in tests). Every access
 * is wrapped: a storage that throws (private window, blocked site data) just means nothing is cached.
 */
export function createCache(storage, { prefix = "wanderers-satchel.update.", now = () => Date.now() } = {}) {
  const mem = new Map();
  const read = k => { try { const t = storage?.getItem?.(prefix + k); return t ? JSON.parse(t) : mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } };
  return {
    get(k) {
      const e = read(k); if (!e || typeof e !== "object") return null;
      const ttl = e.result?.status === "error" ? CACHE_FAIL_MS : CACHE_OK_MS;
      if (!(now() - (e.at ?? 0) < ttl)) return null;
      return e.result ?? null;
    },
    set(k, result) {
      const e = { at: now(), result }; mem.set(k, e);
      try { storage?.setItem?.(prefix + k, JSON.stringify(e)); } catch { }
    },
    clear() {
      const keys = [...mem.keys()]; mem.clear();
      try { for (const k of this.keys()) storage.removeItem(prefix + k); } catch { }
      return keys.length;
    },
    /** Our keys in the storage (for Remove Satchel data). */
    keys() {
      const out = new Set(mem.keys());
      try { for (let i = 0; i < (storage?.length ?? 0); i++) { const k = storage.key(i); if (k?.startsWith(prefix)) out.add(k.slice(prefix.length)); } } catch { }
      return [...out];
    }
  };
}

/** Runs `p` (a promise) with a time limit; `abort` is called when time runs out. */
export function withTimeout(p, ms, abort) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => { try { abort?.(); } catch { } rej(new Error(`no answer within ${Math.round(ms / 1000)} s`)); }, ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/**
 * Asks for the latest version of one module. `mod`: { id, version, manifest }. Options: fetch (a fetch-like function), cache (from
 * createCache), timeoutMs, force (skip the cache). Never throws. Result:
 *   { status: "current" | "update" | "ahead" | "unknown" | "error", installed, latest, error, source, cached }
 * "unknown": no manifest URL, or a version that can't be compared. "error": the check itself failed ("couldn't check").
 * @param {any} mod
 * @param {{ fetch?: any, cache?: any, timeoutMs?: number, force?: boolean }} [opts]
 */
export async function checkUpdate(mod, { fetch, cache = null, timeoutMs = TIMEOUT_MS, force = false } = {}) {
  const installed = mod?.version ?? null;
  const src = updateSource(mod?.manifest);
  if (!src) return { status: "unknown", installed, latest: null, error: "no manifest URL to check", source: null, cached: false };
  const key = `${mod.id}|${src.url}`;
  if (!force && cache) { const hit = cache.get(key); if (hit) return { ...hit, installed, ...verdict(installed, hit.latest, hit), cached: true }; }
  let result;
  try {
    if (typeof fetch !== "function") throw new Error("no way to fetch here");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const res = await withTimeout(fetch(src.url, { headers: { Accept: "application/json" }, cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) }), timeoutMs, () => ctl?.abort());
    if (!res || !res.ok) throw new Error(`the server answered ${res?.status ?? "nothing"}`);
    const data = await withTimeout(Promise.resolve(res.json()), timeoutMs, () => ctl?.abort());
    const latest = src.kind === "github" ? data?.tag_name : data?.version;
    if (latest === undefined || latest === null || latest === "") throw new Error(src.kind === "github" ? "the latest release has no tag" : "the manifest has no version");
    result = { status: "ok", latest: String(latest).replace(/^v(?=\d)/i, ""), error: null, source: src.kind };
  } catch (e) {
    result = { status: "error", latest: null, error: String(e?.name === "AbortError" ? "no answer in time" : e?.message ?? e), source: src.kind };
  }
  cache?.set(key, result);
  return { ...result, installed, ...verdict(installed, result.latest, result), cached: false };
}

function verdict(installed, latest, r) {
  if (r.status === "error") return { status: "error" };
  const c = compareVersions(installed, latest);
  return { status: c === null ? "unknown" : c < 0 ? "update" : c > 0 ? "ahead" : "current" };
}

/** A short plain-English line for a result, for the card. */
export function updateText(r) {
  if (!r) return "Not checked.";
  switch (r.status) {
    case "update": return `Update available: ${r.latest}.`;
    case "current": return "Up to date.";
    case "ahead": return `Newer than the latest release (${r.latest}).`;
    case "error": return `Couldn't check for updates (${r.error}).`;
    default: return r.error ? `Can't check for updates: ${r.error}.` : "Can't compare versions.";
  }
}
