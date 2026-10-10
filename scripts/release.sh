#!/usr/bin/env bash
# Trainer's Codex — release in one command.
#
# Runs on the owner's Mac (zsh or bash) from ~/Projects/tc-monetization. Every
# step is printed before it runs; nothing here echoes a secret.
#
#   scripts/release.sh --all --bundle ~/Downloads/trainers-codex-v1.0-launch.bundle
#
# Steps (each opt-in, --all turns on push + deploy + verify):
#   --bundle <file>   fetch a git bundle, fast-forward claude/monetization-v1
#                     onto it and move the dev line to the same commit
#   --push            push both branches + tags to origin
#   --deploy          install → lint → build → inline → size gate → inject
#                     config → deploy the API worker → deploy the site
#   --verify          run scripts/smoke-live.mjs against production
#   --all             --push --deploy --verify
#   --dry-run         print every command instead of running it
#   --skip-install    reuse node_modules as they are
#
# --deploy needs SUPABASE_URL, SUPABASE_ANON_KEY and WORKER_URL in the
# environment. Keep them in .env.deploy at the repo root (gitignored) and the
# script sources it; or export them in the shell first.
#
# Pre-deploy gates, all fatal:
#   * working tree clean (bundle.html excepted — this script rebuilds it)
#   * on claude/monetization-v1
#   * pnpm lint → 0 errors
#   * bundle.html ≤ 2,150,400 bytes (same cap as CI)
#   * wrangler authenticated (npx wrangler whoami)
#
# Deploy order is fixed: API worker first (it carries the server-side merch
# kill switch and the CORS allow-list), then the site that talks to it.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RELEASE_BRANCH="claude/monetization-v1"
DEV_BRANCH="claude/journey-mode-trainer-sim-1r2yvp"
BUNDLE_CAP=2150400
STAGE_DIR="/tmp/tc-deploy"

BUNDLE_FILE=""
DO_PUSH=0
DO_DEPLOY=0
DO_VERIFY=0
DRY_RUN=0
SKIP_INSTALL=0

usage() {
  sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle)
      [[ $# -ge 2 ]] || { echo "--bundle needs a path" >&2; exit 2; }
      BUNDLE_FILE="$2"; shift 2 ;;
    --bundle=*) BUNDLE_FILE="${1#--bundle=}"; shift ;;
    --push) DO_PUSH=1; shift ;;
    --deploy) DO_DEPLOY=1; shift ;;
    --verify) DO_VERIFY=1; shift ;;
    --all) DO_PUSH=1; DO_DEPLOY=1; DO_VERIFY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$BUNDLE_FILE" && $DO_PUSH -eq 0 && $DO_DEPLOY -eq 0 && $DO_VERIFY -eq 0 ]]; then
  usage >&2
  exit 2
fi

# ── helpers ───────────────────────────────────────────────────────────────────

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# gate — a pre-deploy check. Fatal for real; under --dry-run it reports what
# would have stopped the release and keeps going so the whole plan prints.
gate() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  \033[33m! dry-run: would stop here — %s\033[0m\n' "$*"
  else
    die "$*"
  fi
}

# run — print the command, then execute it (or only print it under --dry-run).
# Arguments are printed with %q so a reader sees exactly what the shell ran.
run() {
  printf '  $'; printf ' %q' "$@"; printf '\n'
  if [[ $DRY_RUN -eq 1 ]]; then return 0; fi
  "$@"
}

# run_in DIR CMD... — same as run, inside a subshell at DIR.
run_in() {
  local dir="$1"; shift
  printf '  $ (cd %q &&' "$dir"; printf ' %q' "$@"; printf ')\n'
  if [[ $DRY_RUN -eq 1 ]]; then return 0; fi
  (cd "$dir" && "$@")
}

file_size() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    stat -f %z "$1"
  else
    stat -c %s "$1"
  fi
}

# ── 0. bring the commits in ──────────────────────────────────────────────────

if [[ -n "$BUNDLE_FILE" ]]; then
  step "fetch git bundle"
  [[ -f "$BUNDLE_FILE" ]] || die "bundle not found: $BUNDLE_FILE"
  run git bundle verify "$BUNDLE_FILE"
  run git fetch "$BUNDLE_FILE" 'refs/heads/*:refs/remotes/bundle/*' 'refs/tags/*:refs/tags/*'
  run git checkout "$RELEASE_BRANCH"
  run git merge --ff-only "bundle/$RELEASE_BRANCH"
  run git branch -f "$DEV_BRANCH" "bundle/$DEV_BRANCH"
  if [[ $DRY_RUN -eq 0 ]]; then
    note "now at $(git rev-parse --short HEAD) — $(git log -1 --format=%s)"
  fi
fi

# ── 1. push ──────────────────────────────────────────────────────────────────

if [[ $DO_PUSH -eq 1 ]]; then
  step "push branches + tags to origin"
  run git push origin "$RELEASE_BRANCH" "$DEV_BRANCH"
  run git push origin --tags
fi

# ── 2. deploy ────────────────────────────────────────────────────────────────

if [[ $DO_DEPLOY -eq 1 ]]; then
  step "deploy configuration"
  if [[ -f "$ROOT/.env.deploy" ]]; then
    note "sourcing .env.deploy"
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env.deploy"
    set +a
  fi
  missing=()
  for v in SUPABASE_URL SUPABASE_ANON_KEY WORKER_URL; do
    [[ -n "${!v:-}" ]] || missing+=("$v")
  done
  if [[ ${#missing[@]} -gt 0 && $DRY_RUN -eq 1 ]]; then
    gate "missing env: ${missing[*]} (put them in .env.deploy)"
    for v in "${missing[@]}"; do export "$v=<unset>"; done
  elif [[ ${#missing[@]} -gt 0 ]]; then
    printf '\n\033[31m✗ missing env: %s\033[0m\n' "${missing[*]}" >&2
    cat >&2 <<'EOF'

  --deploy needs the runtime config baked into index.html. Put it in a
  gitignored file at the repo root and re-run:

    cat > .env.deploy <<'ENV'
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_ANON_KEY=<anon public key>
    WORKER_URL=https://trainers-codex-api.jrriestra.workers.dev
    ENV

  (.env.deploy is in .gitignore — it never reaches git.)
EOF
    exit 1
  fi
  note "SUPABASE_URL      = $SUPABASE_URL"
  if [[ "$SUPABASE_ANON_KEY" == "<unset>" ]]; then
    note "SUPABASE_ANON_KEY = <unset>"
  else
    note "SUPABASE_ANON_KEY = (set, ${#SUPABASE_ANON_KEY} chars)"
  fi
  note "WORKER_URL        = $WORKER_URL"
  if [[ -n "${SUPABASE_SHA384:-}" ]]; then
    note "SUPABASE_SHA384   = (set)"
  fi

  step "gate: working tree clean, on $RELEASE_BRANCH"
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [[ "$branch" == "$RELEASE_BRANCH" ]] || gate "on '$branch', expected '$RELEASE_BRANCH' (git checkout $RELEASE_BRANCH)"
  # pnpm 11 rewrites package.json (`packageManager` pin) and writes
  # pnpm-workspace.yaml on every install; neither is a source change. Undo the
  # pin, ignore the yaml (it is gitignored and regenerated by the install step).
  git checkout -q -- package.json 2>/dev/null || true
  dirty="$(git status --porcelain -- . ':!bundle.html' ':!pnpm-workspace.yaml')"
  if [[ -n "$dirty" ]]; then
    printf '%s\n' "$dirty" >&2
    gate "working tree is not clean — commit or discard the changes above first"
  else
    note "HEAD $(git rev-parse --short HEAD) on $branch, tree clean"
  fi

  step "gate: wrangler authenticated"
  run_in "$ROOT/worker" npx wrangler whoami

  if [[ $SKIP_INSTALL -eq 0 ]]; then
    step "install (root + worker)"
    # pnpm 10+ refuses to run scripts when node_modules disagrees with the
    # lockfile it just installed from; turning the check off per project is the
    # documented escape hatch. Older pnpm has no such setting — ignore failure.
    # pnpm 11 also hard-fails (ERR_PNPM_IGNORED_BUILDS) on packages with build
    # scripts it has not been told about. puppeteer's script only downloads a
    # browser we never use (the harness resolves a system Chromium), so deny it
    # explicitly; the worker's esbuild/workerd scripts install the native
    # binaries wrangler needs, so allow those. Written as pnpm-workspace.yaml
    # (gitignored — a committed one broke pnpm 9, CLAUDE.md gotcha 19).
    printf 'verifyDepsBeforeRun: false\nallowBuilds:\n  puppeteer: false\n' > "$ROOT/pnpm-workspace.yaml"
    run env PUPPETEER_SKIP_DOWNLOAD=1 pnpm install
    # worker/ has no committed lockfile (gitignored), so no --frozen-lockfile.
    # The ignored-builds notice is non-fatal here when node_modules already
    # carries the binaries; a genuinely fresh clone should run
    # `pnpm approve-builds` in worker/ once and allow esbuild + workerd.
    run_in "$ROOT/worker" pnpm install --ignore-workspace || note "(worker install reported ignored build scripts — fine if node_modules already has esbuild/workerd)"
    git checkout -q -- "$ROOT/package.json" 2>/dev/null || true
  fi

  step "gate: pnpm lint (0 errors)"
  run pnpm lint

  step "build → inline"
  run pnpm build
  run node inline.mjs

  step "gate: bundle size ≤ $BUNDLE_CAP B"
  if [[ $DRY_RUN -eq 1 ]]; then
    note "(would measure bundle.html with stat and stop if over the cap)"
  else
    size="$(file_size bundle.html)"
    note "bundle.html = $size B"
    [[ "$size" -le "$BUNDLE_CAP" ]] || die "bundle.html is $size B, over the $BUNDLE_CAP B cap (see CI gate + LAUNCH_READINESS §1)"
    if git diff --quiet -- bundle.html; then
      note "bundle.html is byte-identical to the committed artifact"
    else
      note "bundle.html differs from the committed artifact — the build on this machine is what ships;"
      note "commit the new bundle.html afterwards if you want the repo to match production"
    fi
  fi

  step "stage with config → $STAGE_DIR"
  # The config values travel through the environment, never the command line,
  # so the echoed command carries no key.
  export SUPABASE_URL SUPABASE_ANON_KEY WORKER_URL
  [[ -n "${SUPABASE_SHA384:-}" ]] && export SUPABASE_SHA384
  run node scripts/inject-config.mjs
  if [[ $DRY_RUN -eq 0 ]]; then
    [[ -f "$STAGE_DIR/index.html" ]] || die "inject-config did not produce $STAGE_DIR/index.html"
    [[ -f "$STAGE_DIR/_headers" ]]   || die "$STAGE_DIR/_headers missing — CSP would not ship"
    [[ -f "$STAGE_DIR/sitemap.xml" ]] || die "$STAGE_DIR/sitemap.xml missing"
    locs="$(grep -c '<loc>' "$STAGE_DIR/sitemap.xml" || true)"
    note "sitemap.xml lists $locs URLs"
  fi

  step "deploy 1/2: API worker (trainers-codex-api)"
  run_in "$ROOT/worker" npx wrangler deploy

  step "deploy 2/2: site (deploy/frontend-wrangler.toml → $STAGE_DIR)"
  run_in "$ROOT/worker" npx wrangler deploy --config ../deploy/frontend-wrangler.toml

  note "deployed. If a probe below still shows the old build: Cloudflare → Caching → Purge Everything, then re-run --verify."
fi

# ── 3. verify ────────────────────────────────────────────────────────────────

if [[ $DO_VERIFY -eq 1 ]]; then
  step "post-deploy smoke (scripts/smoke-live.mjs)"
  # SITE / API can be overridden in the environment (a preview deploy, say);
  # the defaults are production.
  run env SITE="${SITE:-https://trainerscodex.com}" API="${API:-https://trainers-codex-api.jrriestra.workers.dev}" \
      node scripts/smoke-live.mjs --browser
fi

printf '\n\033[32m✓ release script finished\033[0m\n'
