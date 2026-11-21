#!/bin/bash
# Manga engine trial on Tower: one copy-paste install.
#
# This starts Suwayomi (the free community manga engine Harbor's Manga lane
# will drive later) by itself, so you can open its own page and watch it
# work before anything is built on top of it.
#
# Run it in the Unraid terminal (the >_ icon, top right):
#
#   true; curl -fsSL https://raw.githubusercontent.com/TheBenPsych/HolyArrs/main/deploy/harbor/harbor-manga-trial.sh | bash ; true
#
# What it does:
#   1. Downloads the engine and starts it as its own container,
#      "harbor-manga-engine", on port 4567.
#   2. Gives it one folder for its settings and one folder for the manga it
#      downloads (Media/Manga/engine-trial).
#   3. If a FlareSolverr container is running, tells the engine about it.
#
# What it never does:
#   - It never touches Harbor, Glowfin, or any other app or media file.
#   - It adds no manga sites. The engine starts empty; you choose.
#
# Running it again is safe: it updates the engine and keeps its settings.
#
# Take it off again (downloaded manga and settings stay on disk):
#
#   true; docker rm -f harbor-manga-engine ; true
#
# Switches (put them before "bash", for example  ... | MANGA_PORT=4570 bash):
#   MANGA_PORT=4567     the port the engine answers on
#   MANGA_MEDIA=/mnt/user/Homelab/Media   the media folder on Tower
#   MANGA_DRY=1         only say what would happen; change nothing at all

set -u

NAME=harbor-manga-engine
IMAGE="${MANGA_IMAGE:-ghcr.io/suwayomi/suwayomi-server:stable}"
PORT="${MANGA_PORT:-4567}"
DRY="${MANGA_DRY:-}"
INSIDE=/home/suwayomi/.local/share/Tachidesk

say()  { printf '%s\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
note() { printf '  [note] %s\n' "$*"; }
stop() { printf '\n  [STOP] %s\n\n  Nothing else was changed. Copy everything above to Claude.\n\n' "$*"; exit 1; }

say ""
say "=============================================="
say " Manga engine trial install"
say "=============================================="

command -v docker >/dev/null 2>&1 || stop "Docker is not running on this machine. In Unraid: Settings > Docker > Enable Docker: Yes."
docker info >/dev/null 2>&1 || stop "Docker is not answering. In Unraid: Settings > Docker > Enable Docker: Yes."
case "$PORT" in ''|*[!0-9]*) stop "MANGA_PORT must be a number, not '$PORT'." ;; esac

HOST_IP="${MANGA_HOST_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')}"
[ -n "$HOST_IP" ] || HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$HOST_IP" ] || stop "Could not work out Tower's address on the home network."
ok "Tower's address is $HOST_IP"

TZ_NAME="${TZ:-}"
[ -n "$TZ_NAME" ] || TZ_NAME="$(cat /etc/timezone 2>/dev/null)"
[ -n "$TZ_NAME" ] || TZ_NAME="$(readlink -f /etc/localtime 2>/dev/null | sed -n 's#.*/zoneinfo/##p')"
case "$TZ_NAME" in */*) ;; *) TZ_NAME="America/New_York" ;; esac

# ------------------------------------------------------------ folders
# Settings go beside the other apps' settings, on a real pool or disk.
CONFIG="${MANGA_CONFIG:-}"
if [ -z "$CONFIG" ]; then
  for d in /mnt/*/appdata; do
    [ -d "$d" ] || continue
    case "$d" in /mnt/user/*|/mnt/user0/*|/mnt/disk[0-9]*/*) continue ;; esac
    CONFIG="$d/$NAME"; break
  done
fi
if [ -z "$CONFIG" ]; then
  for d in /mnt/disk[0-9]*/appdata; do [ -d "$d" ] && { CONFIG="$d/$NAME"; break; }; done
fi
[ -n "$CONFIG" ] || stop "Could not find the appdata folder on a pool or disk (looked in /mnt/*/appdata)."
ok "The engine's settings folder: $CONFIG"

MEDIA="${MANGA_MEDIA:-/mnt/user/Homelab/Media}"
[ -d "$MEDIA" ] || stop "The media folder $MEDIA does not exist."
DOWNLOADS="$MEDIA/Manga/engine-trial"
ok "Downloaded manga will go to: $DOWNLOADS"

# --------------------------------------------- is the spot free?
OLD_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null)"
if [ -n "$OLD_IMAGE" ]; then
  case "$OLD_IMAGE" in
    ghcr.io/suwayomi/suwayomi-server*) ok "The engine is already installed; it will be updated and keep its settings" ;;
    *) stop "A different container is already called '$NAME' (image $OLD_IMAGE). It will not be touched." ;;
  esac
fi
TAKEN="$(docker ps --format '{{.Names}} {{.Ports}}' | awk -v p=":$PORT->" -v me="$NAME" 'index($0,p) && $1!=me {print $1; exit}')"
[ -z "$TAKEN" ] || stop "Port $PORT is already used by the container '$TAKEN'. Run it again with another port, for example:  ... | MANGA_PORT=4570 bash"

# The helper that gets past "are you a robot" pages, if Tower has one.
FLARE_ARGS=""
FLARE="$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /flaresolverr|byparr/ {print $1; exit}')"
if [ -n "$FLARE" ]; then
  FPORT="$(docker port "$FLARE" 8191/tcp 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)"
  if [ -n "$FPORT" ]; then
    FLARE_ARGS="-e FLARESOLVERR_ENABLED=true -e FLARESOLVERR_URL=http://$HOST_IP:$FPORT"
    ok "Found the robot-check helper ($FLARE); the engine will use it"
  fi
fi
[ -n "$FLARE_ARGS" ] || note "No robot-check helper (FlareSolverr) found. Fine for the trial; a few sites may refuse."

if [ -n "$DRY" ]; then
  say ""
  say "Dry run: stopping here. Nothing was downloaded, started or changed."
  say ""
  exit 0
fi

# ------------------------------------------------------------ install
say ""
say "Downloading the engine (this one is big, a few minutes):"
if ! docker pull "$IMAGE"; then
  docker image inspect "$IMAGE" >/dev/null 2>&1 || stop "Could not download $IMAGE. Check Tower's internet, then run this again."
  note "download failed; using the copy already on Tower"
fi

mkdir -p "$CONFIG" "$DOWNLOADS" || stop "Could not make the folders $CONFIG and $DOWNLOADS."
# The engine runs as its own non-root user inside the container, so both
# folders must be writable by anyone on Tower.
chmod -R a+rwX "$CONFIG" "$DOWNLOADS" 2>/dev/null

[ -z "$OLD_IMAGE" ] || docker rm -f "$NAME" >/dev/null 2>&1

# The downloads folder must be listed before the settings folder.
# shellcheck disable=SC2086
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  --memory 2g \
  -p "$PORT:4567" \
  -e TZ="$TZ_NAME" \
  -e DOWNLOAD_AS_CBZ=true \
  $FLARE_ARGS \
  -v "$DOWNLOADS:$INSIDE/downloads" \
  -v "$CONFIG:$INSIDE" \
  -l "net.unraid.docker.webui=http://[IP]:[PORT:4567]/" \
  -l "harbor.part=manga-engine-trial" \
  "$IMAGE" >/dev/null || stop "The engine did not start. Run:  docker logs $NAME"

say ""
say "Waiting for the engine to wake up (up to 3 minutes the first time):"
UP=""
for i in $(seq 1 90); do
  if curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then UP=1; break; fi
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = "true" ] || break
  sleep 2
done
if [ -z "$UP" ]; then
  docker logs --tail 30 "$NAME" 2>&1 | sed 's/^/    /'
  stop "The engine started but is not answering on port $PORT. The lines above say why. To take it off:  docker rm -f $NAME"
fi
ok "The engine is running"

say ""
say "=============================================="
say " DONE. Open the manga engine in your browser:"
say ""
say "     http://$HOST_IP:$PORT"
say ""
say " It starts with no manga sites. Claude's page shows the next clicks."
say " Take it off again any time with:"
say ""
say "     true; docker rm -f $NAME ; true"
say "=============================================="
say ""
