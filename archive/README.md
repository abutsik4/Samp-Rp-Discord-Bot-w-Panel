# archive/

Frozen artifacts kept for forensic reference. Nothing in this folder is imported,
required, or executed by the live bot or panel.

## Layout

- `migrations/` — one-shot Python deploy/patch scripts. All have already been
  applied to production data. Kept so we can audit what schema/data changes were
  made when. Do not re-run blindly — most will fail because they expect a
  pre-patch schema.
- `bak/src/...` — `.bak` siblings of files under `src/`. Mirrors the original
  path so it is obvious which live file each backup paired with.
- `phase_c_deploy/` — staging folder used during the Phase C rollout. The
  feature files now live under `src/features/`.
- `ui/panel-ui.bak.20260515152914/` — pre-rebuild snapshot of the panel UI.
- `.env.bak.20260513213556` — historical env snapshot. Already superseded.

## Restore policy

Prefer `git log` / `git show` over copying files back. If you must restore,
copy the file out, do not move it, so the audit trail in `archive/` stays
intact.
