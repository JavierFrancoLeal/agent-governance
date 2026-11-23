#!/usr/bin/env node
// Automated regression test suite for DSH Desktop → Antigravity reverse Dual-Brain guard.

import assert from "node:assert/strict";
import {
  installDualBrainGuard,
  isAntigravityFailureText,
  isMutatingGitCommand,
  isRealAgyAuditCli,
} from "./lib/dual-brain-guard.js";

function createMockAgent({ origin = "user", parentSession = undefined } = {}) {
  const listeners = new Map();
  const sections = [];
  const steers = [];

  const ctx = {
    systemPrompt: {
      section(def) {
        sections.push(def);
        return () => {
          const i = sections.indexOf(def);
          if (i >= 0) sections.splice(i, 1);
        };
      },
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {
        const arr = listeners.get(event) || [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    },
  };

  const agent = {
    session: { header: { origin, parentSession } },
    ctx,
    steer(msg) {
      steers.push(msg);
    },
  };

  async function emitPreStep(turn, userText) {
    const fns = listeners.get("agent/pre-step") || [];
    let idx = 0;
    const payload = {
      agent,
      turn,
      step: 1,
      messages: userText != null ? [{ source: { kind: "user" }, content: [{ type: "text", text: userText }] }] : [],
    };
    const next = async () => {
      if (idx < fns.length) return fns[idx++](payload, next);
      return { kind: "enter", messages: payload.messages };
    };
    return next();
  }

  async function emitPreExecute(exec) {
    const fns = listeners.get("tools/pre-execute") || [];
    let idx = 0;
    const next = async () => {
      if (idx < fns.length) return fns[idx++](exec, next);
      return { kind: "allow" };
    };
    return next();
  }

  function emitResult(exec, result) {
    for (const fn of listeners.get("tools/result") || []) fn(exec, result);
  }

  function emitTurnStopping(turn) {
    for (const fn of listeners.get("agent/turn-stopping") || []) fn({ agent, turn });
  }

  return { agent, sections, steers, emitPreStep, emitPreExecute, emitResult, emitTurnStopping };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS [${passed}]: ${name}`);
}

// 1. System prompt section installed with interpolate: false and cleaned up on dispose
await test("Installs systemPrompt section (interpolate:false) and cleans up on dispose", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  assert.equal(m.sections.length, 1);
  assert.equal(m.sections[0].interpolate, false);
  assert.match(m.sections[0].text, /Dual-Brain MANDATORY/);
  dispose();
  assert.equal(m.sections.length, 0);
});

// 2. B1: antigravity(action="edit") is a MUTATION (blocks commit & triggers turn-stopping) until antigravity(action="audit")
await test("B1: antigravity(edit) -> commit is gated; antigravity(edit) -> antigravity(audit) -> commit allowed", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Implement feature X");

  m.emitResult(
    { name: "antigravity", arguments: { action: "edit", prompt: "edit file" } },
    { isError: false, value: { text: "status: completed · duration: 4s\n\nEdited app.js." } },
  );

  const commitBlocked = await m.emitPreExecute({ name: "bash", arguments: { command: 'git commit -m "x"' } });
  assert.equal(commitBlocked.kind, "ask");

  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 1);
  assert.match(m.steers[0].content[0].text, /antigravity\(edit\)/);

  // Now run antigravity(audit)
  m.emitResult(
    { name: "antigravity", arguments: { action: "audit", prompt: "audit diff" } },
    { isError: false, value: { text: "status: completed\n\nPASS — no blockers." } },
  );

  const commitAllowed = await m.emitPreExecute({ name: "bash", arguments: { command: 'git commit -m "audited"' } });
  assert.equal(commitAllowed.kind, "allow");

  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 1, "Should NOT steer again once audited");
  dispose();
});

// 3. B2: Refusal/failure return strings from jfranco-antigravity (isError: false) MUST NOT clear gate
await test("B2: All jfranco-antigravity failure/refusal strings fail audit check and increment fail counter", async () => {
  const failures = [
    "antigravity: unknown action \"foo\" (expected plan | edit | audit | models).",
    "antigravity models failed: unable to query agy models",
    "antigravity requires a non-empty prompt.",
    "antigravity edit requires a Git repository at /tmp.",
    "antigravity audit requires a Git repository at /tmp.",
    "antigravity edit refused: /tmp has uncommitted changes.",
    "antigravity failed to launch: ENOENT",
    "status: error · duration: 1s\n\nboom",
  ];
  for (const txt of failures) {
    assert.equal(isAntigravityFailureText(txt), true, `Expected failure detection for: ${txt}`);
  }
  assert.equal(isAntigravityFailureText("status: completed\n\nPASS — clean diff."), false);

  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Edit foo.js");
  m.emitResult({ name: "write", arguments: { file_path: "/tmp/foo.js" } }, { isError: false, value: "ok" });
  m.emitResult(
    { name: "antigravity", arguments: { action: "audit", prompt: "audit" } },
    { isError: false, value: { text: "antigravity failed to launch: ENOENT" } },
  );
  const gated = await m.emitPreExecute({ name: "bash", arguments: { command: "git push origin main" } });
  assert.equal(gated.kind, "ask");
  dispose();
});

// 4. M1 + M8: subagent_fork counts as mutation; cheap plan in Git repo does NOT clear gate; non-git fallback DOES
await test("M1/M8: subagent_fork is tracked as mutation; plan does not clear git gate unless non-git audit refused", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Refactor via fork");
  m.emitResult({ name: "subagent_fork", arguments: { task: "edit module" } }, { isError: false, value: "done" });

  // Cheap plan in a normal repo must NOT clear gate
  m.emitResult(
    { name: "antigravity", arguments: { action: "plan", prompt: "plan" } },
    { isError: false, value: { text: "status: completed\n\nHere is a plan." } },
  );
  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 1, "Cheap plan must not clear unaudited subagent_fork");

  // If audit is refused specifically for non-Git workspace, then plan fallback clears cleanly
  m.emitResult(
    { name: "antigravity", arguments: { action: "audit", prompt: "audit" } },
    { isError: false, value: { text: "antigravity audit requires a Git repository at /tmp/nongit." } },
  );
  m.emitResult(
    { name: "antigravity", arguments: { action: "plan", prompt: "Cross-audit /tmp/nongit" } },
    { isError: false, value: { text: "status: completed\n\nPASS — reviewed files." } },
  );
  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 1, "Non-Git plan fallback should clear gate");
  dispose();
});

// 5. M4: PTC run_code inner bash git commit returns clean `deny` (no interactive approval deadlock)
await test("M4: PTC inner bash git commit returns deny (no deadlock) while direct call returns ask", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Run code");

  const ptcToken = Symbol("ptc-parent");
  m.emitResult({ name: "edit", arguments: { file_path: "/tmp/a.js" }, parent: ptcToken }, { isError: false, value: "ok" });

  const innerCommit = await m.emitPreExecute({
    name: "bash",
    arguments: { command: 'git commit -m "inside ptc"' },
    parent: ptcToken,
  });
  assert.equal(innerCommit.kind, "deny");
  assert.equal(innerCommit.info?.code, "DUAL_BRAIN_AUDIT_REQUIRED");

  const outerCommit = await m.emitPreExecute({
    name: "bash",
    arguments: { command: 'git commit -m "direct"' },
  });
  assert.equal(outerCommit.kind, "ask");
  dispose();
});

// 6. M5: turn-stopping re-steers up to MAX_STEERS_PER_TURN (2), and yields after 2 consecutive antigravity failures
await test("M5: turn-stopping enforces up to 2 steers/turn and yields after 2 consecutive antigravity failures", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Edit a.js");
  m.emitResult({ name: "edit", arguments: { file_path: "/tmp/a.js" } }, { isError: false, value: "ok" });

  m.emitTurnStopping(1);
  m.emitTurnStopping(1);
  m.emitTurnStopping(1); // 3rd attempt in same turn must yield (bounded at 2)
  assert.equal(m.steers.length, 2);

  // Turn 2: two consecutive audit failures trigger fail-safe yield
  await m.emitPreStep(2, "Continue");
  m.emitResult(
    { name: "antigravity", arguments: { action: "audit", prompt: "a1" } },
    { isError: false, value: { text: "antigravity failed to launch: timeout" } },
  );
  m.emitResult(
    { name: "antigravity", arguments: { action: "audit", prompt: "a2" } },
    { isError: false, value: { text: "antigravity failed to launch: timeout" } },
  );
  m.emitTurnStopping(2);
  assert.equal(m.steers.length, 2, "Fail-safe after 2 consecutive failures must yield");
  dispose();
});

// 7. M6: bypassRequested resets cleanly on the next user turn (never sticky!)
await test("M6: Explicit 'sin antigravity' opt-out applies ONLY to that turn and resets on next turn", async () => {
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);

  await m.emitPreStep(1, "Edita rapido sin antigravity");
  m.emitResult({ name: "write", arguments: { file_path: "/tmp/x.js" } }, { isError: false, value: "ok" });
  assert.equal((await m.emitPreExecute({ name: "bash", arguments: { command: 'git commit -m "quick"' } })).kind, "allow");
  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 0);

  // Next turn without opt-out -> enforcement MUST be active again!
  await m.emitPreStep(2, "Ahora refactoriza auth.js");
  m.emitResult({ name: "edit", arguments: { file_path: "/tmp/auth.js" } }, { isError: false, value: "ok" });
  assert.equal((await m.emitPreExecute({ name: "bash", arguments: { command: 'git commit -m "auth"' } })).kind, "ask");
  m.emitTurnStopping(2);
  assert.equal(m.steers.length, 1);
  dispose();
});

// 8. Anti-recursion & subagent exemption + terminal_send + full git coverage + failed write ignored
await test("Subagents and DUAL_BRAIN_ORIGIN=antigravity yield; terminal_send & full git coverage work", async () => {
  const sub = createMockAgent({ origin: "subagent", parentSession: "parent-1" });
  installDualBrainGuard(sub.agent);
  assert.equal(sub.sections.length, 0);

  const rec = createMockAgent();
  installDualBrainGuard(rec.agent, { env: { DUAL_BRAIN_ORIGIN: "antigravity" } });
  assert.equal(rec.sections.length, 0);

  // Failed write does NOT count as mutation (m3); str_replace_editor view does NOT count
  const m = createMockAgent();
  const dispose = installDualBrainGuard(m.agent);
  await m.emitPreStep(1, "Check files");
  m.emitResult({ name: "write", arguments: { file_path: "/tmp/fail.js" } }, { isError: true, error: { message: "denied" } });
  m.emitResult({ name: "str_replace_editor", arguments: { command: "view", path: "/tmp/a.js" } }, { isError: false, value: "code" });
  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 0);

  // terminal_send mutation + git gate coverage
  assert.equal(isMutatingGitCommand("git --no-pager commit -m x"), true);
  assert.equal(isMutatingGitCommand("git branch -f -D main"), true);
  assert.equal(isMutatingGitCommand("git remote -v add evil url"), true);
  assert.equal(isMutatingGitCommand("git reset HEAD~1"), true);
  assert.equal(isMutatingGitCommand("git status"), false);
  assert.equal(isMutatingGitCommand("git tag -l"), false);
  assert.equal(isRealAgyAuditCli('agy --mode plan -p "audit diff"'), true);
  assert.equal(isRealAgyAuditCli('agy --mode plan -p "audit" & sleep 1'), false);
  assert.equal(isRealAgyAuditCli("agy --mode plan --help"), false);

  m.emitResult({ name: "terminal_send", arguments: { text: "mkdir -p /tmp/newdir\n" } }, { isError: false, value: "ok" });
  m.emitTurnStopping(1);
  assert.equal(m.steers.length, 1);
  dispose();
});

console.log(`\nALL ${passed} DSH->ANTIGRAVITY REVERSE DUAL-BRAIN TESTS PASSED.`);
