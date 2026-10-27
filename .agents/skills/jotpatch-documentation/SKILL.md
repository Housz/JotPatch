---
name: jotpatch-documentation
description: >-
  Write, edit, translate, or review JotPatch README files, user guides,
  browser instructions, architecture references, navigation experiments,
  verification reports, release notes, and documentation pull requests.
  Apply W01-W10 writing rules and D01-D12/P0-P2 acceptance.
---

# JotPatch documentation workflow

Use for documentation tasks; this Skill does not authorize code, signing, merging, or release actions.

1. Read [AGENTS.md](../../../AGENTS.md) and [CONTRIBUTING.md](../../../CONTRIBUTING.md) for Git, data, privacy and release boundaries.
2. Read [writing style](../../../docs/WRITING_STYLE.md); select D01–D12 in [documentation types](../../../docs/DOCUMENTATION_TYPES.md).
3. Identify the baseline: published `main`/Release, current `dev`, pending PR, historical experiment or proposal.
4. Verify version, UI, permissions, source behavior and test claims against matching code, config, GitHub evidence and release assets.
5. Write for the reader; preserve necessary failure and privacy boundaries, and keep historical evidence unchanged.
6. If editing README, update both `README.md` and `README.en.md`; compare versions, actions, limits and links, not wording.
7. Check changed paths, Markdown structure, links, document-type fields and sensitive content. Run available scoped checks.
8. Report what was checked, failed or not run; open a PR into `dev` only when asked.

## Guardrails

- **P0/P1:** Block false release or test claims, data-loss advice, broken critical links, missing provenance and authorization overreach.
- **P2:** Suggest concise, natural wording; negative terms are not automatically errors.
- Never overwrite old experiment results, released tags/assets or failed verification records; link a dated correction instead.
- Documentation-only requests do not authorize application changes, version bumps, GitHub Actions edits, merges or publishing.

Adapted from [XiaomiWatch2HRV watch2-documentation](https://github.com/fcwrwen/XiaomiWatch2HRV/blob/main/.agents/skills/watch2-documentation/SKILL.md).
