# Agent Governance (`JavierFrancoLeal/agent-governance`)

**Traffic-Light Autonomy Governance & Guardrail Plugins for AI Agents (`@javierfrancoleal/*`).**  
*By [Javier Franco](https://github.com/JavierFrancoLeal) · Open Source (MIT)*

> **Core Principle:** Autonomous agents prepare, audit, and verify — **the human decides and signs**.

---

## Traffic-Light Autonomy Model

| Signal | Autonomy Level | Behavior |
| :--- | :--- | :--- |
| 🟢 **Green** | Routine & Reversible | Agent executes automatically within explicit scope |
| ⚑ **Flag** | Review-Recommended | Agent prepares output and flags assumptions for quick review |
| 🟡 **Yellow** | Human Approval Gate | Agent pauses and requires explicit human sign-off before execution |
| 🔴 **Red** | Blocked / High-Risk | Hard mechanical block (security, irreversible mutations, out-of-scope actions) |

---

## Included Modular Plugins (26)

This repository ships 26 focused, composable governance, auditing, routing, and forensic plugins for DeepSeek Harness & agentic workflows:

- **Governance & Constitution:** `jfranco-constitution`, `jfranco-doctrine`, `jfranco-autonomy-grader`, `jfranco-decision-router`, `jfranco-accountability-auditor`, `jfranco-audit`
- **Orchestration & Routing:** `jfranco-conductor`, `jfranco-workflow-master`, `jfranco-branches`, `jfranco-triage`, `jfranco-input-detector`, `jfranco-cortex`
- **Forensics, Cost & Contracts:** `jfranco-forensics`, `jfranco-forensic-contracts`, `jfranco-usage-auditor`, `jfranco-deepseek-prices`, `jfranco-balance`, `jfranco-cifra`
- **Tooling & Authoring:** `jfranco-antigravity`, `jfranco-cockpit-browser`, `jfranco-compas`, `jfranco-docfactory`, `jfranco-interpreter`, `jfranco-lessons`, `jfranco-apices`, `jfranco-plugin-authoring`

## Standalone Flagships & Companion Suites (Zero-Dependency CLI + MCP + Plugins)

Every flagship below distills a battle-tested governance mechanism from this suite into a standalone, harness-agnostic package for **Claude Code, Gemini CLI, Cursor, Google Antigravity, Playwright/CDP, and DeepSeek Harness**:

| Repository | Role | Status |
| :--- | :--- | :--- |
| **[`casebook`](https://github.com/JavierFrancoLeal/casebook)** | Bounded-entropy 4-tier constitutional memory, Open Symptoms Radar & 5-to-1 compaction oracle | **`v1.0.1` Live** |
| **[`dual-brain-guard`](https://github.com/JavierFrancoLeal/dual-brain-guard)** | Harness-agnostic mechanical Proposer != Verifier cross-model guard (`CLI + MCP + hooks`) | **`v1.1.1` Live** |
| **[`autonomy-ladder`](https://github.com/JavierFrancoLeal/autonomy-ladder)** | Evidence-based Traffic-Light autonomy grader (`🟢 / ⚑ / 🟡 / 🔴` & `A/B/C/D` trust scores) | **`v1.0.2` Live** |
| **[`governed-browser`](https://github.com/JavierFrancoLeal/governed-browser)** | Constitutional commit-click brake (`🛑 RED` on Send/Pay/Delete) & SHA-256 hash-chained audit trail | **`v1.0.1` Live** |
| **[`forensic-contracts`](https://github.com/JavierFrancoLeal/forensic-contracts)** | 5-line `@forensic-contract` linter, `@blast-radius` cage enforcer & literal `sourcePin` verifier | **`v1.0.1` Live** |
| **[`best-security-governance-architects`](https://github.com/JavierFrancoLeal/best-security-governance-architects)** | CPU-first pre-merge security & governance suite (`ECOSYSTEM_CONTRACT v1.2.0`) | **`v1.2.0` Live** |
| **[`best-ui-ux-designers`](https://github.com/JavierFrancoLeal/best-ui-ux-designers)** | Adversarial UI/UX design judgment suite — 12 Barbell design minds & 4 Via Negativa auditors | **`v1.2.0` Live** |

---

## Quick Start

### macOS / Linux
```bash
git clone https://github.com/JavierFrancoLeal/agent-governance.git
cd agent-governance
./install.sh
```

### Windows (PowerShell)
```powershell
git clone https://github.com/JavierFrancoLeal/agent-governance.git
cd agent-governance
.\install.ps1
```

---

## Contributing & License

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).  
Licensed under the terms in [LICENSE](./LICENSE) and [LICENSES.md](./LICENSES.md).
