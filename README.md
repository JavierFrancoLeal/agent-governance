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

> **Companion Repository:** Looking for bounded-entropy 4-tier agent memory (`Transferability × Recurrence`, Open Symptoms Radar, and executable verification)? See **[`casebook`](https://github.com/JavierFrancoLeal/casebook)**.

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
