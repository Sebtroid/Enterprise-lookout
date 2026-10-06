set -eu
task_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
task_bun="$(command -v bun || true)"
if [ -z "$task_bun" ]; then
  for task_candidate in "$HOME"/.npm/_npx/*/node_modules/.bin/bun; do
    if [ -x "$task_candidate" ]; then
      task_bun="$task_candidate"
      break
    fi
  done
fi
if [ -z "$task_bun" ]; then
  echo "Falta Bun 1.3.12. Instálalo desde bun.sh antes de iniciar Lookout." >&2
  exit 1
fi
cd "$task_root"
exec "$task_bun" scripts/start-lookout.ts
