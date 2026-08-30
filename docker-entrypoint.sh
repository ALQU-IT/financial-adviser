#!/bin/sh
# Ensures the data directory is usable before the app starts.
#
# A bind mount whose host directory does not exist yet is created as
# root:root by Docker, and TrueNAS app re-installs can reset ownership the
# same way — the app then fails with SQLITE_CANTOPEN. When this container
# starts as root we fix that here and drop back to an unprivileged user, so
# no manual chown on the host is needed.
set -e

DATA_DIR="${DATA_DIR:-/data}"
APP_UID="${PUID:-568}"
APP_GID="${PGID:-568}"

fail() {
  echo "financial-adviser: $1" >&2
  echo "financial-adviser: the database lives in $DATA_DIR (inside the container)." >&2
  echo "financial-adviser: fix the host directory that is mounted there, e.g." >&2
  echo "financial-adviser:   chown -R ${APP_UID}:${APP_GID} /path/to/host/dir" >&2
  echo "financial-adviser: or set PUID/PGID to a user that owns it." >&2
  exit 1
}

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" 2>/dev/null || fail "cannot create $DATA_DIR"

  # Only touch the mount when the target user actually cannot write: a
  # correctly-owned dataset, or a filesystem that ignores chown, stays as is.
  # Ownership alone is not enough — a directory can be owned by the app user
  # and still deny it write access (mode 555), so grant owner-write too.
  if ! su-exec "${APP_UID}:${APP_GID}" test -w "$DATA_DIR" 2>/dev/null; then
    echo "financial-adviser: $DATA_DIR not writable by ${APP_UID}:${APP_GID}, repairing ownership and permissions" >&2
    chown -R "${APP_UID}:${APP_GID}" "$DATA_DIR" 2>/dev/null || true
    chmod -R u+rwX "$DATA_DIR" 2>/dev/null || true
  fi

  su-exec "${APP_UID}:${APP_GID}" test -w "$DATA_DIR" 2>/dev/null ||
    fail "$DATA_DIR is still not writable by ${APP_UID}:${APP_GID} after chown (read-only mount, or NFS with root_squash?)"

  exec su-exec "${APP_UID}:${APP_GID}" "$@"
fi

# Started with an explicit non-root user (docker run --user ...): nothing to
# fix, just report clearly if the mount is unusable.
mkdir -p "$DATA_DIR" 2>/dev/null || true
[ -w "$DATA_DIR" ] ||
  fail "$DATA_DIR is not writable by uid $(id -u):$(id -g)"

exec "$@"
