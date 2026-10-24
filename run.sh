#!/bin/sh
# Keep the shell entry portable; the state machine uses Node's standard library.
set -eu
SCRIPT_DIR=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
exec node "$SCRIPT_DIR/scripts/loopkit-runner.js" "$@"
