#!/usr/bin/env node
/**
 * Leak gate — publication scanner (zero deps by design).
 *
 * Exit 0 = clean, 1 = findings, 2 = usage error.
 * Every rule maps to the publication policy in README ("Publication & leak
 * policy"): no card numbers, no license plates, no phones, no tokens, no
 * captured payloads. Suppressions live in scripts/leak-scan-allowlist.txt
 * and REQUIRE an inline justification (# because: ...).
 *
 * Usage:
 *   node scripts/leak-scan.mjs [path] [--history]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".wrangler",
  ".omo",
  "coverage",
  ".playwright-mcp",
]);
const TEXT_EXT =
  /\.(ts|tsx|js|mjs|cjs|json|jsonc|md|txt|html|css|ya?ml|toml|sh|py|rs|go|env|example)$/;

function luhnValid(raw) {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const PLACEHOLDER =
  /^(x{3,}|\*{3,}|<[^>]+>|\$\{[^}]+\}|changeme|change-me|example.*|placeholder.*|your[-_].*|0+|\d)$/i;
const ENV_REFERENCE = /^[A-Z][A-Z0-9_]*$/;

function isSecretishValue(value) {
  if (PLACEHOLDER.test(value)) return false;
  if (ENV_REFERENCE.test(value)) return false;
  if (/^(true|false|off|on|none|null)$/i.test(value)) return false;
  return true;
}

const RULES = [
  {
    id: "pan",
    why: "credit card number (Luhn-valid)",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    accept: (match) => luhnValid(match),
  },
  {
    id: "no-plate",
    why: "Norwegian license plate",
    regex: /\b[A-HJ-PR-Y]{2}\s?\d{5}\b/g,
  },
  {
    id: "de-plate",
    why: "German license plate",
    regex: /\b[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}-\d{1,4}\b/g,
  },
  {
    id: "phone",
    why: "phone number with country code",
    regex: /\+\d{2}\s?\d{6,12}\b/g,
  },
  { id: "jwt", why: "JWT", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g },
  {
    id: "cashu-token",
    why: "Cashu token",
    regex: /\bcashu[AB][A-Za-z0-9_-]{30,}/g,
  },
  {
    id: "gh-token",
    why: "GitHub token",
    regex: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}/g,
  },
  {
    id: "secret-key",
    why: "secret-looking key/value pair",
    regex:
      /\b(pan|cvc|cvv|card_?number|license_?plate|plate|licen[cs]e_?number|phone_?number|password|api[_-]?key|secret|rune)\b["']?\s*[:=]\s*["'][^"']{4,}["']/gi,
  },
];

function loadAllowlist(root) {
  const path = join(root, "scripts", "leak-scan-allowlist.txt");
  const entries = [];
  let pendingReason = "";
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    for (const line of lines) {
      if (line.startsWith("# because:")) {
        pendingReason = line.slice("# because:".length).trim();
        continue;
      }
      if (line.startsWith("#") || line.trim() === "") {
        pendingReason = "";
        continue;
      }
      const [scope] = line.split("#");
      const trimmed = scope.trim();
      if (pendingReason === "") {
        entries.push({ bad: `allowlist entry without justification: ${trimmed}` });
        continue;
      }
      const [rule, pathPrefix] = trimmed.split(":");
      entries.push({ rule, pathPrefix, reason: pendingReason });
      pendingReason = "";
    }
  } catch {
    // no allowlist file — nothing suppressed
  }
  return entries;
}

function allowed(allowlist, ruleId, filePath) {
  return allowlist.some(
    (entry) =>
      entry.rule === ruleId && filePath.startsWith(entry.pathPrefix ?? "\0"),
  );
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (TEXT_EXT.test(entry)) {
      yield full;
    }
  }
}

const SECRET_KEY_REGEX =
  /\b(pan|cvc|cvv|card_?number|license_?plate|plate|licen[cs]e_?number|phone_?number|password|api[_-]?key|secret|rune)\b["']?\s*[:=]\s*["']([^"']{4,})["']/i;

function secretValueOf(line) {
  return SECRET_KEY_REGEX.exec(line)?.[2] ?? null;
}

function* scanLine(line) {
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    const matches = line.match(rule.regex);
    if (matches === null) continue;
    for (const match of matches) {
      if (rule.id === "secret-key") {
        const value = secretValueOf(line);
        if (value === null || !isSecretishValue(value)) continue;
      } else if (rule.accept !== undefined && !rule.accept(match)) {
        continue;
      }
      yield { rule: rule.id, why: rule.why, sample: match.slice(0, 24) };
    }
  }
}

function scanText(allowlist, findings, text, filePath, lineOffset = 0) {
  const lines = text.split("\n");
  for (const [i, line] of lines.entries()) {
    for (const hit of scanLine(line)) {
      if (allowed(allowlist, hit.rule, filePath)) continue;
      findings.push({
        ...hit,
        file: filePath,
        line: lineOffset + i + 1,
      });
    }
  }
}

function scanTree(root, allowlist, findings) {
  for (const file of walk(root)) {
    const rel = relative(root, file);
    scanText(allowlist, findings, readFileSync(file, "utf8"), rel);
  }
}

function scanHistory(root, allowlist, findings) {
  const diff = execSync("git log -p --no-color --unified=0", {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      scanText(allowlist, findings, line.slice(1), file);
    }
  }
}

const args = process.argv.slice(2);
const history = args.includes("--history");
const root = args.find((a) => !a.startsWith("--")) ?? ".";
const findings = [];
const allowlist = loadAllowlist(root);
const allowlistErrors = allowlist.filter((entry) => entry.bad !== undefined);
for (const error of allowlistErrors) findings.push({ rule: "allowlist", why: error.bad, file: "scripts/leak-scan-allowlist.txt", line: 0, sample: "" });

scanTree(root, allowlist, findings);
if (history) scanHistory(root, allowlist, findings);

const seen = new Set();
const unique = findings.filter((f) => {
  const key = `${f.rule}:${f.file}:${f.line}:${f.sample}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

for (const f of unique) {
  console.error(`LEAK ${f.rule} (${f.why}) ${f.file}:${f.line} "${f.sample}"`);
}
console.error(
  `leak-scan: ${unique.length} finding(s) [root=${root}${history ? " +history" : ""}]`,
);
process.exit(unique.length > 0 ? 1 : 0);
