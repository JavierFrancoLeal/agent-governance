// Dual-Brain Reverse-Direction Guard (DSH Desktop → Antigravity).
// Mirrors Antigravity's forward guard inside the DeepSeek Harness Node host:
// - State lives in a private WeakMap<Agent, State> in host memory (cannot be tampered with by shell/file tools).
// - Enforces cross-audit via `antigravity(action="audit")` before mutating git commands (`tools/pre-execute`)
//   and before closing turns with unaudited mutations (`agent/turn-stopping` steer, bounded to 2 steers/turn).
// - Anti-recursion: yields on subagents and when `DUAL_BRAIN_ORIGIN === "antigravity"`.

const BYPASS_RE =
  /\b(sin\s+antigravity|sin\s+gemini|no\s+uses?\s+(?:antigravity|gemini|agy)|skip\s+(?:antigravity|gemini|agy)|solo\s+dsh|solo\s+deepseek|modo\s+solo)\b/i;

// Real DSH tool catalog (verified against dsh-tool-fs, dsh-tool-str-replace-editor, dsh-tool-subagent, dsh-tool-workflow)
const FILE_WRITE_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "write_file",
  "edit_file",
  "notebook_edit",
]);

const STR_REPLACE_TOOLS = new Set([
  "str_replace_editor",
  "str_replace_based_edit_tool",
]);

const DELEGATION_TOOLS = new Set([
  "subagent",
  "subagent_fork",
  "workflow",
  "send_message",
]);

const SHELL_TOOLS = new Set(["bash", "terminal_send", "pwsh"]);

// Mirrors Antigravity's hardened GIT_WRITE_RE / GIT_READONLY_ONLY_RE
const GIT_GLOBAL_OPTS =
  "(?:\\s+(?:(?:-C|--git-dir|--work-tree|-c)\\s+\\S+|--(?:git-dir|work-tree|namespace)=\\S+|--no-pager|-P|--paginate|--bare|--literal-pathspecs|--no-replace-objects))*";

const GIT_WRITE_RE = new RegExp(
  `(?:^|[\\s;&|(])(?:git${GIT_GLOBAL_OPTS}\\s+(?:commit|push|merge|rebase|cherry-pick|am|revert|reset|rm|mv|clean|apply|stash\\s+(?:push|pop|apply|drop|clear)|branch(?:\\s+-[A-Za-z-]+)*\\s+(?:-[dDmMcC]|--delete|--move|--copy)|remote(?:\\s+-v)*\\s+(?:add|remove|rm|rename|set-url|prune)|worktree\\s+(?:add|remove|prune)|fetch\\s+[^;&|\\n]*--prune|tag(?!\\s+(?:-l|--list)\\b)(?:\\s+\\S+))\\b|gh\\s+pr\\s+merge\\b)`,
  "i",
);

const GIT_READONLY_ONLY_RE = new RegExp(
  `^\\s*git${GIT_GLOBAL_OPTS}\\s+(?:status|diff|log|show|rev-parse|ls-files|tag(?:\\s+(?:-l|--list)\\b[^;&|]*)?|branch(?:\\s+(?:-a|-r|-v|-vv|--list|--show-current)\\b)*|remote(?:\\s+-v)?)\\s*$`,
  "i",
);

// Best-effort shell mutation detector (FS tools above are the primary authoritative signal)
const SHELL_MUTATION_RE =
  /(?:^|[\s;&|])(mv\s+|cp\s+|rm\s+|mkdir\s+|touch\s+|ln\s+|sed\s+-i|perl\s+-i|tee\s+|npm\s+install|pip3?\s+install|curl\s+[^;&|\n]*(?:-o|--output)\s+|wget\s+[^;&|\n]*-O\s+|git(?:\s+(?:--?[A-Za-z0-9-]+(?:=\S+)?|-C\s+\S+|-c\s+\S+))*\s+(?:add|commit|push|merge|rebase|cherry-pick|am|revert|reset|rm|mv|clean|apply|clone|checkout\s+-b|branch(?:\s+-[A-Za-z-]+)*\s+(?:-[dDmMcC]|--delete|--move|--copy)|remote(?:\s+-v)*\s+(?:add|remove|rm|rename|set-url|prune)|tag(?!\s+(?:-l|--list)\b)(?:\s+\S+)))|(?<![0-9&])>{1,2}(?!\s*&)(?!\s*\/dev\/null\b)/i;

// Matches failure/refusal returns from `jfranco-antigravity`'s `execute` (which returns `{ text }` with `isError: false`)
const ANTIGRAVITY_FAILURE_RE =
  /^\s*antigravity(?::|\s+(?:edit|audit|plan|models))?\s+(?:failed\b|refused\b|requires\b|unknown\s+action\b)/i;
const ANTIGRAVITY_STATUS_ERR_RE = /(?:^|\n)status:\s*(?:error|failed|exit_[1-9]\d*)\b/i;
const ANTIGRAVITY_NO_GIT_RE = /\brequires a Git repository\b/i;

// Matches direct shell `agy` audit invocation (`agy ... --mode plan ... -p ...`) without `--help`/`--version`/bg `&`
const AGY_CLI_INVOCATION_RE =
  /(?:^|(?:&&|\|\||[;|\n(])\s*)(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*)(?:(?:nohup|time|command|\/usr\/bin\/env|env)\s+)*(?:(?:(?:\/|~\/)[^\s;&|]*\/)?agy)\s+([^;&|\n]+)/;
const AGY_NOOP_FLAG_RE = /(?:^|\s)(?:--help|-h|--version|-V)\b/;
const SHELL_BG_END_RE = /(?:^|[^>&])&\s*$/;

const DUAL_BRAIN_SYSTEM_TEXT = [
  "[Dual-Brain MANDATORY — DSH ↔ Antigravity]",
  "Always-on tandem mode is active for this DeepSeek Harness session.",
  "After any substantive file write/edit, shell mutation, subagent/workflow delegation, or `antigravity(action=\"edit\")` — and ALWAYS before `git commit`/`push`/`merge` — you MUST run a cross-audit via `antigravity(action=\"audit\", ...)` (or `antigravity(action=\"plan\", ...)` if the workspace is not a Git repo) and reconcile blockers before closing the turn.",
  "Only skip when the user explicitly says \"sin antigravity\", \"sin gemini\", \"solo dsh\", or \"modo solo\".",
  "End every substantive reply with a visible line: `> **Tándem Dual-Brain:** Antigravity (<audit|plan>, <what was audited>)`.",
].join(" ");

const MAX_STEERS_PER_TURN = 2;
const MAX_FAILED_AUDITS_FAILSAFE = 2;

const stateMap = new WeakMap();

function getOrCreateState(agent) {
  let st = stateMap.get(agent);
  if (!st) {
    st = {
      seq: 0,
      lastMutationSeq: 0,
      lastMutationSummary: "",
      lastAntigravitySeq: 0,
      lastAntigravityMode: "",
      antigravityFailedCount: 0,
      nonGitAuditRefused: false,
      bypassRequested: false,
      lastTurnSeen: -1,
      forcedCountInTurn: 0,
    };
    stateMap.set(agent, st);
  }
  return st;
}

function isSubagent(agent) {
  const header = agent?.session?.header;
  return header?.origin === "subagent" || header?.parentSession !== undefined;
}

function extractShellCommand(toolName, args) {
  if (!args || typeof args !== "object") return "";
  if (toolName === "terminal_send") {
    return String(args.text ?? args.input ?? args.command ?? "");
  }
  return String(args.command ?? args.cmd ?? args.CommandLine ?? args.script ?? "");
}

function extractResultText(result) {
  if (!result || typeof result !== "object") return "";
  if (result.value && typeof result.value === "object" && typeof result.value.text === "string") {
    return result.value.text;
  }
  if (typeof result.value === "string") return result.value;
  if (Array.isArray(result.content)) {
    return result.content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

function extractUserTextFromMessages(messages) {
  if (!Array.isArray(messages)) return "";
  const chunks = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.source && msg.source.kind !== "user") continue;
    if (typeof msg.content === "string") {
      chunks.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && block.type === "text" && typeof block.text === "string") {
          chunks.push(block.text);
        }
      }
    }
  }
  return chunks.join("\n");
}

function isRealAgyAuditCli(cmd) {
  if (SHELL_BG_END_RE.test(cmd.trim())) return false;
  const m = AGY_CLI_INVOCATION_RE.exec(cmd);
  if (!m) return false;
  const after = cmd.slice(m.index + m[0].length);
  if (after.startsWith("&") && !after.startsWith("&&") && !/>$/.test(m[0])) return false;
  const agyArgs = m[1] || "";
  if (AGY_NOOP_FLAG_RE.test(agyArgs)) return false;
  return /(?:^|\s)--mode(?:=|\s+)plan\b/.test(agyArgs) && /(?:^|\s)(?:-p|--print|--prompt)\b/.test(agyArgs);
}

function isMutatingGitCommand(cmd) {
  if (!cmd || GIT_READONLY_ONLY_RE.test(cmd)) return false;
  return GIT_WRITE_RE.test(cmd);
}

function isAntigravityFailureText(text) {
  if (!text || !text.trim()) return true;
  return ANTIGRAVITY_FAILURE_RE.test(text) || ANTIGRAVITY_STATUS_ERR_RE.test(text);
}

function classifyToolOutcome(exec, result, state) {
  const toolName = String(exec?.name || "").toLowerCase();
  const args = exec?.arguments && typeof exec.arguments === "object" ? exec.arguments : {};
  const isError = Boolean(result?.isError);

  // 1. Handle the `antigravity` tool first (keyed on canonical result.value.text, not just isError)
  if (toolName === "antigravity") {
    const action = String(args.action || "").toLowerCase();
    const text = extractResultText(result);
    const failed = isError || isAntigravityFailureText(text);

    if (action === "audit") {
      if (failed) {
        state.antigravityFailedCount += 1;
        if (ANTIGRAVITY_NO_GIT_RE.test(text)) {
          state.nonGitAuditRefused = true;
        }
      } else {
        state.seq += 1;
        state.lastAntigravitySeq = state.seq;
        state.lastAntigravityMode = "audit";
        state.antigravityFailedCount = 0;
        state.nonGitAuditRefused = false;
      }
      return;
    }

    if (action === "edit") {
      // B1: `antigravity(action="edit")` WRITES files — it is a MUTATION, NEVER an audit!
      if (!failed) {
        state.seq += 1;
        state.lastMutationSeq = state.seq;
        state.lastMutationSummary = "antigravity(edit)";
      }
      return;
    }

    if (action === "plan") {
      // M8: `plan` only satisfies the audit gate as a non-Git fallback after `audit` was refused for non-Git
      if (failed) {
        if (state.nonGitAuditRefused) state.antigravityFailedCount += 1;
      } else if (state.nonGitAuditRefused) {
        state.seq += 1;
        state.lastAntigravitySeq = state.seq;
        state.lastAntigravityMode = "plan(non-git)";
        state.antigravityFailedCount = 0;
      }
      return;
    }

    // `models` or unknown action: neither mutation nor audit
    return;
  }

  // Failed non-antigravity tool calls did not mutate state (m3)
  if (isError) return;

  // 2. Shell tools (`bash`, `terminal_send`, `pwsh`)
  if (SHELL_TOOLS.has(toolName)) {
    const cmd = extractShellCommand(toolName, args);
    if (isRealAgyAuditCli(cmd)) {
      state.seq += 1;
      state.lastAntigravitySeq = state.seq;
      state.lastAntigravityMode = "agy-cli";
      state.antigravityFailedCount = 0;
      return;
    }
    if (SHELL_MUTATION_RE.test(cmd)) {
      state.seq += 1;
      state.lastMutationSeq = state.seq;
      state.lastMutationSummary = `${toolName}: ${cmd.slice(0, 80)}`;
    }
    return;
  }

  // 3. First-class FS write tools
  if (FILE_WRITE_TOOLS.has(toolName)) {
    const target = String(args.file_path ?? args.path ?? args.TargetFile ?? "");
    state.seq += 1;
    state.lastMutationSeq = state.seq;
    state.lastMutationSummary = target ? `${toolName}: ${target}` : toolName;
    return;
  }

  // 4. `str_replace_editor` (ignore read-only `view`)
  if (STR_REPLACE_TOOLS.has(toolName)) {
    const subcmd = String(args.command || "").toLowerCase();
    if (subcmd !== "view") {
      state.seq += 1;
      state.lastMutationSeq = state.seq;
      state.lastMutationSummary = `${toolName}(${subcmd || "edit"}): ${String(args.path || "")}`;
    }
    return;
  }

  // 5. Delegation tools (`subagent`, `subagent_fork`, `workflow`, `send_message`)
  if (DELEGATION_TOOLS.has(toolName)) {
    state.seq += 1;
    state.lastMutationSeq = state.seq;
    state.lastMutationSummary = `${toolName}: ${String(args.role || args.description || args.task || "delegated").slice(0, 60)}`;
  }
}

/**
 * Install the reverse-direction Dual-Brain guard (DSH → Antigravity) on a live Agent's scoped context.
 * Safe to call inside `ctx.on("agent/created", ({ agent }) => ...)`.
 */
function installDualBrainGuard(agent, options = {}) {
  if (!agent?.ctx) return () => {};
  const env = options.env || process.env;

  // Anti-recursion & subagent exemption (M7, m4)
  if (env.DUAL_BRAIN_ORIGIN === "antigravity" || isSubagent(agent)) {
    return () => {};
  }

  const state = getOrCreateState(agent);
  const disposers = [];

  // 1. Register system prompt directive via official `agent.ctx.systemPrompt.section` (M2, m5)
  const sp = agent.ctx.systemPrompt;
  if (sp && typeof sp.section === "function") {
    const disposeSection = sp.section({
      name: "jfranco-antigravity:dual-brain",
      order: 950,
      text: DUAL_BRAIN_SYSTEM_TEXT,
      interpolate: false,
    });
    if (typeof disposeSection === "function") disposers.push(disposeSection);
  }

  // 2. Per-turn bypass detection & reset via `agent/pre-step` waterfall (M3, M6)
  disposers.push(
    agent.ctx.on("agent/pre-step", async (payload, next) => {
      const turn = Number(payload?.turn);
      if (Number.isFinite(turn) && turn !== state.lastTurnSeen) {
        state.lastTurnSeen = turn;
        state.forcedCountInTurn = 0;
        const userText = extractUserTextFromMessages(payload?.messages);
        state.bypassRequested = BYPASS_RE.test(userText);
      } else if (Array.isArray(payload?.messages)) {
        const userText = extractUserTextFromMessages(payload.messages);
        if (userText && BYPASS_RE.test(userText)) {
          state.bypassRequested = true;
        }
      }
      return next();
    }),
  );

  // 3. Pre-execution commit/push/destructive-git gate via `tools/pre-execute` waterfall (M3, M4, M10)
  disposers.push(
    agent.ctx.on("tools/pre-execute", async (exec, next) => {
      const toolName = String(exec?.name || "").toLowerCase();
      if (!SHELL_TOOLS.has(toolName) || state.bypassRequested) {
        return next();
      }
      const cmd = extractShellCommand(toolName, exec?.arguments);
      if (!isMutatingGitCommand(cmd)) {
        return next();
      }
      const unaudited = state.lastAntigravitySeq === 0 || state.lastMutationSeq > state.lastAntigravitySeq;
      if (!unaudited) {
        return next();
      }

      const reason =
        `[DUAL-BRAIN DSH→AGY COMMIT/PUSH GATE] Mutating git command detected without a subsequent Antigravity cross-audit ` +
        `(lastMutationSeq=${state.lastMutationSeq}, lastAntigravitySeq=${state.lastAntigravitySeq}). ` +
        `Run antigravity(action="audit") first, or explicitly approve to bypass.`;

      // M4: inside PTC `run_code` inner calls (`exec.parent !== undefined`), deny cleanly instead of blocking on an interactive approval prompt
      if (exec.parent !== undefined) {
        return {
          kind: "deny",
          reason,
          info: { name: "DualBrainCommitGateError", code: "DUAL_BRAIN_AUDIT_REQUIRED", reason },
        };
      }

      return {
        kind: "ask",
        reason,
        displayReason: {
          en: "Dual-Brain gate: mutating git command has no subsequent Antigravity cross-audit. Approve to bypass or deny to audit first.",
          es: "Candado Dual-Brain: comando git mutante sin auditoría previa de Antigravity. Aprueba para omitir o rechaza para auditar primero.",
        },
      };
    }),
  );

  // 4. Observe immutable tool outcomes via `tools/result` (B1, B2, M1, M8, M9, m3)
  disposers.push(
    agent.ctx.on("tools/result", (exec, result) => {
      classifyToolOutcome(exec, result, state);
    }),
  );

  // 5. Turn-end stop gate via `agent/turn-stopping` (M5)
  disposers.push(
    agent.ctx.on("agent/turn-stopping", ({ agent: stoppingAgent, turn }) => {
      const targetAgent = stoppingAgent || agent;
      if (state.bypassRequested) return;
      if (state.antigravityFailedCount >= MAX_FAILED_AUDITS_FAILSAFE) return;
      if (state.forcedCountInTurn >= MAX_STEERS_PER_TURN) return;

      if (state.lastMutationSeq > state.lastAntigravitySeq) {
        state.forcedCountInTurn += 1;
        const summary = state.lastMutationSummary || `seq ${state.lastMutationSeq}`;
        const fallbackHint = state.nonGitAuditRefused
          ? 'Since this workspace is not a Git repo, call `antigravity(action="plan", prompt="Cross-audit ...")` now.'
          : 'Call `antigravity(action="audit", prompt="...")` against the uncommitted git diff now.';
        targetAgent.steer({
          content: [
            {
              type: "text",
              text:
                `[DUAL-BRAIN DSH→AGY STOP GATE] Blocked turn #${turn} completion (${state.forcedCountInTurn}/${MAX_STEERS_PER_TURN}): ` +
                `substantive work detected (${summary}, mutationSeq=${state.lastMutationSeq}) without a subsequent Antigravity cross-audit ` +
                `(lastAntigravitySeq=${state.lastAntigravitySeq}). ${fallbackHint} ` +
                `Reconcile any blockers and include the \`> **Tándem Dual-Brain:** Antigravity (...)\` footer in your reply.`,
            },
          ],
          source: { kind: "antigravity" },
        });
      }
    }),
  );

  return () => {
    for (const dispose of disposers) {
      try { if (typeof dispose === "function") dispose(); } catch {}
    }
    stateMap.delete(agent);
  };
}

export {
  installDualBrainGuard,
  classifyToolOutcome,
  isMutatingGitCommand,
  isAntigravityFailureText,
  isRealAgyAuditCli,
  extractUserTextFromMessages,
  BYPASS_RE,
  SHELL_MUTATION_RE,
  DUAL_BRAIN_SYSTEM_TEXT,
  MAX_STEERS_PER_TURN,
  MAX_FAILED_AUDITS_FAILSAFE,
};
