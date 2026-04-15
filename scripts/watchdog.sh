#!/bin/bash
# Directoor Watchdog
# Monitors the heartbeat file. Kills the dev server if:
# - No heartbeat for >60 seconds (browser closed)
# - Or the server has been running for >15 minutes since the last activity

PID_FILE="/tmp/directoor-server.pid"
WATCHDOG_PID_FILE="/tmp/directoor-watchdog.pid"
HEARTBEAT_FILE="/tmp/directoor-heartbeat"
LOG_FILE="/tmp/directoor-server.log"
PORT=3000
HEARTBEAT_STALE_SEC=60       # Browser closed if no heartbeat for this long
INITIAL_GRACE_SEC=30         # Give browser 30s to send first heartbeat after server starts
CHECK_INTERVAL_SEC=10

log() {
    echo "[watchdog $(date '+%H:%M:%S')] $1" >> "$LOG_FILE"
}

stop_everything() {
    log "Shutting down Directoor server"

    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        kill "$pid" 2>/dev/null || true
        pkill -P "$pid" 2>/dev/null || true
        rm -f "$PID_FILE"
    fi

    # Belt and suspenders: kill anything on the dev port
    lsof -ti :"$PORT" | xargs kill -9 2>/dev/null || true

    # Cleanup
    rm -f "$HEARTBEAT_FILE"
    rm -f "$WATCHDOG_PID_FILE"

    exit 0
}

# Trap signals for clean shutdown
trap stop_everything SIGTERM SIGINT

# ─── Initial grace period ────────────────────────────────────────
# Give the browser time to load the page and send the first heartbeat
sleep "$INITIAL_GRACE_SEC"

# ─── Main monitor loop ───────────────────────────────────────────
log "Watchdog started (idle timeout: ${HEARTBEAT_STALE_SEC}s)"

while true; do
    # Check if heartbeat file exists
    if [ ! -f "$HEARTBEAT_FILE" ]; then
        log "Heartbeat file missing — shutting down"
        stop_everything
    fi

    # Check heartbeat age (mtime)
    if [ "$(uname)" = "Darwin" ]; then
        FILE_AGE=$(($(date +%s) - $(stat -f %m "$HEARTBEAT_FILE")))
    else
        FILE_AGE=$(($(date +%s) - $(stat -c %Y "$HEARTBEAT_FILE")))
    fi

    if [ "$FILE_AGE" -gt "$HEARTBEAT_STALE_SEC" ]; then
        log "Heartbeat stale (${FILE_AGE}s old) — browser closed or idle. Shutting down."
        stop_everything
    fi

    # Check if server process is still alive
    if [ -f "$PID_FILE" ]; then
        SERVER_PID=$(cat "$PID_FILE")
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            log "Server process died unexpectedly. Cleaning up."
            stop_everything
        fi
    else
        log "PID file gone — server stopped externally"
        stop_everything
    fi

    sleep "$CHECK_INTERVAL_SEC"
done
