import argparse
import os
import signal
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description="Run one command with a bounded memory budget.")
parser.add_argument("--heap-mb", type=int, default=1024)
parser.add_argument("--rss-mb", type=int, default=1536)
parser.add_argument("--timeout", type=int, default=600)
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("A command is required.")
task_env = dict(os.environ)
task_env["NODE_OPTIONS"] = f"--max-old-space-size={args.heap_mb}"
process = subprocess.Popen(command, env=task_env, start_new_session=True)
started = time.monotonic()
peak = 0
reason = None
try:
    while process.poll() is None:
        rows = subprocess.check_output(["ps", "-axo", "pid,ppid,pgid,rss"], text=True)
        total = sum(int(parts[3]) for line in rows.splitlines()[1:] if len(parts := line.split()) == 4 and int(parts[2]) == process.pid)
        peak = max(peak, total)
        if total > args.rss_mb * 1024:
            reason = f"Memory limit: {args.rss_mb} MB"
            break
        if time.monotonic() - started > args.timeout:
            reason = f"Time limit: {args.timeout} seconds"
            break
        time.sleep(0.5)
except KeyboardInterrupt:
    reason = "Interrupted"
if reason:
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    print(reason, file=sys.stderr)
print(f"Peak resident memory: {peak // 1024} MB. Elapsed: {time.monotonic() - started:.1f} seconds.", flush=True)
sys.exit(125 if reason else process.returncode)
