#!/bin/bash
# Harbor on Tower: the one copy-paste install.
#
# Run it in the Unraid terminal (the >_ icon, top right):
#
#   true; curl -fsSL https://raw.githubusercontent.com/TheBenPsych/HolyArrs/main/deploy/harbor/harbor-install.sh | bash ; true
#
# What it does:
#   1. Downloads Harbor and starts it as its own container, "harbor", on
#      port 6262, next to the old apps.
#   2. Looks at the old apps (Radarr, Sonarr, Lidarr, Prowlarr, Bazarr,
#      Seerr) and hands Harbor their addresses and keys, so its "Import from
#      other apps" page can read them without typing.
#
# What it never does:
#   - It never changes, stops or restarts an old app. It only looks at them
#     (docker inspect, reading a settings file, one "are you there" question).
#   - It never changes a media file. In watch-only mode (the default) the
#     media folder is given to Harbor read-only, so Harbor cannot.
#
# Running it again is safe: it updates Harbor and keeps Harbor's settings.
#
# Switches (put them before "bash", for example  ... | HARBOR_MODE=full bash):
#   HARBOR_MODE=watch   media folder read-only (the first install's default;
#                       running it again keeps whatever mode Harbor has)
#   HARBOR_MODE=full    media folder writable (for the switch-over, later)
#   HARBOR_PORT=6262    the port Harbor answers on
#   HARBOR_MEDIA=/mnt/user/Homelab/Media   the media folder on Tower
#   HARBOR_DRY=1        only say what would happen; change nothing at all

set -u

NAME=harbor
IMAGE="${HARBOR_IMAGE:-ghcr.io/thebenpsych/harbor:latest}"
PORT="${HARBOR_PORT:-6262}"
MODE="${HARBOR_MODE:-}"
DRY="${HARBOR_DRY:-}"
ICON="https://raw.githubusercontent.com/TheBenPsych/HolyArrs/main/app/frontend/static/brand/apple-touch-icon-180.png"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
note() { printf '  [note] %s\n' "$*"; }
stop() { printf '\n  [STOP] %s\n\n  Nothing else was changed. Copy everything above to Claude.\n\n' "$*"; exit 1; }

say ""
say "=============================================="
say " Harbor install"
say "=============================================="

command -v docker >/dev/null 2>&1 || stop "Docker is not running on this machine. In Unraid: Settings > Docker > Enable Docker: Yes."
docker info >/dev/null 2>&1 || stop "Docker is not answering. In Unraid: Settings > Docker > Enable Docker: Yes."
# Running it again keeps the mode Harbor already has, unless HARBOR_MODE says otherwise.
case "$MODE" in ''|watch|full) ;; *) stop "HARBOR_MODE must be watch or full, not '$MODE'." ;; esac
[ -n "$MODE" ] || MODE="$(docker inspect -f '{{index .Config.Labels "harbor.mode"}}' "$NAME" 2>/dev/null)"
case "$MODE" in watch|full) ;; *) MODE=watch ;; esac
ok "Mode: $MODE"
case "$PORT" in ''|*[!0-9]*) stop "HARBOR_PORT must be a number, not '$PORT'." ;; esac

# ---------------------------------------------------------------- Tower
HOST_IP="${HARBOR_HOST_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')}"
[ -n "$HOST_IP" ] || HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$HOST_IP" ] || stop "Could not work out Tower's address on the home network."
ok "Tower's address is $HOST_IP"

TZ_NAME="${TZ:-}"
[ -n "$TZ_NAME" ] || TZ_NAME="$(cat /etc/timezone 2>/dev/null)"
[ -n "$TZ_NAME" ] || TZ_NAME="$(readlink -f /etc/localtime 2>/dev/null | sed -n 's#.*/zoneinfo/##p')"
case "$TZ_NAME" in */*) ;; *) TZ_NAME="America/New_York" ;; esac

# ------------------------------------------------- find the old apps
# Prints the name of the first running container whose image matches $1.
find_app() {
  docker ps --format '{{.Names}} {{.Image}}' | awk -v pat="$1" 'tolower($2) ~ pat {print $1; exit}'
}
# The folder on Tower that the container sees as $2 (for example /config).
mount_of() {
  docker inspect -f '{{range .Mounts}}{{.Destination}}|{{.Source}}{{"\n"}}{{end}}' "$1" 2>/dev/null \
    | awk -F'|' -v d="$2" '$1==d {print $2; exit}'
}
# The address Harbor can reach the container on, for its inside port $2.
address_of() {
  local c="$1" inside="$2" mode host ip
  mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$c" 2>/dev/null)"
  if [ "$mode" = "host" ]; then printf 'http://%s:%s' "$HOST_IP" "$inside"; return; fi
  host="$(docker port "$c" "$inside/tcp" 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)"
  if [ -n "$host" ]; then printf 'http://%s:%s' "$HOST_IP" "$host"; return; fi
  ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$c" 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] && printf 'http://%s:%s' "$ip" "$inside"
}
xml_value() { sed -n "s:.*<$2>\([^<]*\)</$2>.*:\1:p" "$1" 2>/dev/null | head -n1; }
# The value of "key:" inside the top-level "section:" of a simple YAML file.
yaml_value() {
  awk -v sec="$2" -v key="$3" '
    /^[^ #][^:]*:/ { insec = ($0 ~ "^" sec ":") ; next }
    insec && $1 == key":" { v=$0; sub(/^[^:]*:[ ]*/, "", v); gsub(/^["\x27]|["\x27][ ]*$/, "", v); print v; exit }
  ' "$1" 2>/dev/null
}
# One read-only question: "are you there, and is this your key?"
answers() { curl -fsS -m 8 -o /dev/null -H "X-Api-Key: $2" "$1" 2>/dev/null; }

KEYS_YAML="version: 1"
FOUND=""
MISSING=""
add_app() { # kind, address, key
  KEYS_YAML="$KEYS_YAML
$1:
  address: \"$2\"
  api_key: \"$3\"
  allow_local_network: true"
  FOUND="$FOUND $1"
}

look_arr() { # kind, image pattern, default port, status path
  local kind="$1" c cfg file key port base addr
  c="$(find_app "$2")"
  [ -n "$c" ] || { MISSING="$MISSING $kind"; note "$kind: no running container found, skipped"; return; }
  cfg="$(mount_of "$c" /config)"
  file="$(find "$cfg" -maxdepth 2 -name config.xml 2>/dev/null | head -n1)"
  [ -n "$file" ] || { MISSING="$MISSING $kind"; note "$kind ($c): could not find its settings file, skipped"; return; }
  key="$(xml_value "$file" ApiKey)"
  port="$(xml_value "$file" Port)"; [ -n "$port" ] || port="$3"
  base="$(xml_value "$file" UrlBase)"; base="${base#/}"; base="${base%/}"
  addr="$(address_of "$c" "$port")"
  [ -n "$base" ] && addr="$addr/$base"
  if [ -n "$key" ] && [ -n "$addr" ] && answers "$addr$4" "$key"; then
    add_app "$kind" "$addr" "$key"; ok "$kind found at $addr (container $c)"
  else
    MISSING="$MISSING $kind"; note "$kind ($c): did not answer at ${addr:-?}, skipped"
  fi
}

say ""
say "Looking at the old apps (looking only, nothing in them changes):"
look_arr radarr   'radarr'   7878 /api/v3/system/status
look_arr sonarr   'sonarr'   8989 /api/v3/system/status
look_arr lidarr   'lidarr'   8686 /api/v1/system/status
look_arr prowlarr 'prowlarr' 9696 /api/v1/system/status

# Bazarr keeps its key in config/config.yaml, under "auth:".
c="$(find_app 'bazarr')"
if [ -n "$c" ]; then
  cfg="$(mount_of "$c" /config)"
  file="$(find "$cfg" -maxdepth 3 -name config.yaml -path '*config/config.yaml' 2>/dev/null | head -n1)"
  key="$(yaml_value "$file" auth apikey)"
  port="$(yaml_value "$file" general port)"; [ -n "$port" ] || port=6767
  base="$(yaml_value "$file" general base_url)"; base="${base#/}"; base="${base%/}"
  addr="$(address_of "$c" "$port")"; [ -n "$base" ] && addr="$addr/$base"
  if [ -n "$key" ] && [ -n "$addr" ] && curl -fsS -m 8 -o /dev/null -H "X-API-KEY: $key" "$addr/api/system/status" 2>/dev/null; then
    add_app bazarr "$addr" "$key"; ok "bazarr found at $addr (container $c)"
  else
    MISSING="$MISSING bazarr"; note "bazarr ($c): did not answer at ${addr:-?}, skipped"
  fi
else
  MISSING="$MISSING bazarr"; note "bazarr: no running container found, skipped"
fi

# Seerr (also Jellyseerr and Overseerr) keeps its key in settings.json.
c="$(find_app 'seerr')"
if [ -n "$c" ]; then
  cfg="$(mount_of "$c" /app/config)"; [ -n "$cfg" ] || cfg="$(mount_of "$c" /config)"
  file="$(find "$cfg" -maxdepth 2 -name settings.json 2>/dev/null | head -n1)"
  key="$(tr -d '\n' < "${file:-/dev/null}" 2>/dev/null | sed -n 's/.*"main"[ ]*:[ ]*{[^}]*"apiKey"[ ]*:[ ]*"\([^"]*\)".*/\1/p')"
  addr="$(address_of "$c" 5055)"
  if [ -n "$key" ] && [ -n "$addr" ] && answers "$addr/api/v1/settings/about" "$key"; then
    add_app seerr "$addr" "$key"; ok "seerr found at $addr (container $c)"
  else
    MISSING="$MISSING seerr"; note "seerr ($c): did not answer at ${addr:-?}, skipped"
  fi
else
  MISSING="$MISSING seerr"; note "seerr: no running container found, skipped"
fi

# ------------------------------------------------------------ folders
# Harbor's own settings folder must sit on a real disk or pool, not on
# /mnt/user (Harbor refuses that for its database). Use the pool that
# already holds the other apps' settings.
CONFIG="${HARBOR_CONFIG:-}"
if [ -z "$CONFIG" ]; then
  for d in /mnt/*/appdata; do
    [ -d "$d" ] || continue
    case "$d" in /mnt/user/*|/mnt/user0/*|/mnt/disk[0-9]*/*) continue ;; esac
    CONFIG="$d/harbor"; break
  done
fi
if [ -z "$CONFIG" ]; then
  for d in /mnt/disk[0-9]*/appdata; do [ -d "$d" ] && { CONFIG="$d/harbor"; break; }; done
fi
[ -n "$CONFIG" ] || stop "Could not find the appdata folder on a pool or disk (looked in /mnt/*/appdata)."
ok "Harbor's own settings folder: $CONFIG"

# The media folder: the same one Radarr sees as /data, so every path matches.
MEDIA="${HARBOR_MEDIA:-}"
if [ -z "$MEDIA" ]; then
  for pat in radarr sonarr; do
    c="$(find_app "$pat")"; [ -n "$c" ] || continue
    MEDIA="$(mount_of "$c" /data)"; [ -n "$MEDIA" ] && break
  done
fi
[ -n "$MEDIA" ] || MEDIA=/mnt/user/Homelab/Media
[ -d "$MEDIA" ] || stop "The media folder $MEDIA does not exist."
if [ "$MODE" = "watch" ]; then
  MEDIA_MOUNT="$MEDIA:/data:ro"
  WATCH_ONLY=1
  ok "Media folder: $MEDIA (read-only: Harbor can look, it cannot change a file)"
else
  MEDIA_MOUNT="$MEDIA:/data"
  WATCH_ONLY=0
  ok "Media folder: $MEDIA (writable)"
fi

# ------------------------------------------------------------- FlareSolverr
# Tower's FlareSolverr (the one Prowlarr uses) opens sites behind a bot
# check. Harbor gets its address and uses it for any Source that has no
# FlareSolverr address of its own, only when a site shows its check.
FLARE_ARGS=""
FLARE_C="$(find_app 'flaresolverr')"
if [ -n "$FLARE_C" ]; then
  FLARE_URL="$(address_of "$FLARE_C" 8191)"
  if [ -n "$FLARE_URL" ]; then
    FLARE_ARGS="-e HARBOR_FLARESOLVERR=$FLARE_URL"
    ok "FlareSolverr: Harbor uses $FLARE_URL for sites with a bot check"
  else
    note "FlareSolverr: found $FLARE_C but not its address"
  fi
else
  note "FlareSolverr: not installed, so sites with a bot check stay blocked"
fi

# ------------------------------------------------------------- drop folder
# The drop folder: put a movie or episode file in Media/Drop and Harbor
# names it and moves it to its place on the shelves, when that title is on
# the shelves and still needs the file. Unsure files stay there. It lives in
# the media folder so a move is instant (same disk). In watch-only mode it
# waits: Harbor starts using it when it takes over from the old apps.
DROP_ARGS=""
if [ -n "$DRY" ] || mkdir -p "$MEDIA/Drop" 2>/dev/null; then
  [ -n "$DRY" ] || chown 99:100 "$MEDIA/Drop" 2>/dev/null
  DROP_ARGS="-e HARBOR_DROP_DIR=/data/Drop"
  if [ "$MODE" = watch ]; then
    ok "Drop folder: $MEDIA/Drop (starts working when Harbor takes over)"
  else
    ok "Drop folder: $MEDIA/Drop (Harbor files what you put there every 5 minutes)"
  fi
else
  note "Drop folder: could not make $MEDIA/Drop, so there is no drop folder"
fi

# ------------------------------------------------------------- manga
# The manga shelf: Harbor's librarian tidies what the manga engine
# downloads. It gets the Manga folder on its own, writable, even in
# watch-only mode, because nothing else on Tower uses that folder. If the
# manga engine (harbor-manga-engine) is not installed, the shelf stays empty.
MANGA_DIR="$MEDIA/Manga"
MANGA_ARGS=""
if mkdir -p "$MANGA_DIR" 2>/dev/null; then
  chown 99:100 "$MANGA_DIR" 2>/dev/null
  MANGA_ARGS="-v $MANGA_DIR:/manga -e HARBOR_MANGA_DIR=/manga"
  ENGINE_PORT="$(docker port harbor-manga-engine 4567/tcp 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)"
  if [ -n "$ENGINE_PORT" ]; then
    MANGA_ARGS="$MANGA_ARGS -e HARBOR_MANGA_ENGINE=http://$HOST_IP:$ENGINE_PORT"
    ok "Manga: Harbor tidies $MANGA_DIR and found the manga engine on port $ENGINE_PORT"
  else
    ok "Manga: Harbor tidies $MANGA_DIR (the manga engine is not installed yet)"
  fi
else
  note "Manga: could not make $MANGA_DIR, so the manga shelf stays off"
fi

# ---------------------------------------------------------- shrinker
# The video shrinker (Tdarr, set up by Glowfin's setup-tdarr.sh). Harbor's
# Tower > Shrinker tab reads the notes Tower's helper leaves in Tdarr's
# folder (read-only) and writes its asks into one small folder of its own,
# harbor/. It also reads the originals folder (read-only) for last night's
# list. Harbor never talks to Tdarr and never changes a video.
SHRINK_ARGS=""
TDARR_C="$(docker inspect -f '{{.Name}}' tdarr >/dev/null 2>&1 && echo tdarr)"
[ -n "$TDARR_C" ] || TDARR_C="$(find_app 'haveagitgat/tdarr:')"
[ -n "$TDARR_C" ] || TDARR_C="$(find_app 'haveagitgat/tdarr$')"
if [ -n "$TDARR_C" ]; then
  TDARR_SERVER="$(mount_of "$TDARR_C" /app/server)"
  TDARR_APP="${TDARR_SERVER%/server}"
  TDARR_BACKUP="$(mount_of "$TDARR_C" /backup)"
  if [ -n "$TDARR_SERVER" ] && [ "$TDARR_APP" != "$TDARR_SERVER" ] && [ -d "$TDARR_APP" ]; then
    mkdir -p "$TDARR_APP/harbor" && chown 99:100 "$TDARR_APP/harbor" && chmod 775 "$TDARR_APP/harbor"
    SHRINK_ARGS="-v $TDARR_APP:/tdarr:ro -v $TDARR_APP/harbor:/tdarr/harbor -e HARBOR_TDARR_DIR=/tdarr"
    if [ -n "$TDARR_BACKUP" ] && [ -d "$TDARR_BACKUP" ]; then
      SHRINK_ARGS="$SHRINK_ARGS -v $TDARR_BACKUP:/tdarr-backup:ro -e HARBOR_TDARR_BACKUP=/tdarr-backup"
    fi
    ok "Shrinker: Harbor can see Tdarr's notes in $TDARR_APP"
  else
    note "Shrinker: found Tdarr ($TDARR_C) but not its folder, so the Shrinker tab stays empty"
  fi
else
  note "Shrinker: Tdarr is not installed, so the Shrinker tab stays empty"
fi

# --------------------------------------------- is the spot free?
OLD_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null)"
if [ -n "$OLD_IMAGE" ]; then
  case "$OLD_IMAGE" in
    ghcr.io/thebenpsych/harbor*) ok "Harbor is already installed; it will be updated and keep its settings" ;;
    *) stop "A different container is already called '$NAME' (image $OLD_IMAGE). Harbor will not touch it." ;;
  esac
fi
TAKEN="$(docker ps --format '{{.Names}} {{.Ports}}' | awk -v p=":$PORT->" -v me="$NAME" 'index($0,p) && $1!=me {print $1; exit}')"
[ -z "$TAKEN" ] || stop "Port $PORT is already used by the container '$TAKEN'. Harbor needs a free port."

if [ -n "$DRY" ]; then
  say ""
  say "Dry run: stopping here. Nothing was downloaded, started or changed."
  say "Old apps Harbor would get keys for:${FOUND:- none}"
  say ""
  exit 0
fi

# ------------------------------------------------------------ install
say ""
say "Downloading Harbor (about 20 MB):"
if ! docker pull "$IMAGE"; then
  docker image inspect "$IMAGE" >/dev/null 2>&1 || stop "Could not download $IMAGE. Check Tower's internet, then run this again."
  note "download failed; using the copy of Harbor already on Tower"
fi

mkdir -p "$CONFIG" || stop "Could not make the folder $CONFIG."
chown 99:100 "$CONFIG" 2>/dev/null

[ -z "$OLD_IMAGE" ] || docker rm -f "$NAME" >/dev/null 2>&1

# shellcheck disable=SC2086
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  -p "$PORT:6262" \
  -e PUID=99 -e PGID=100 -e UMASK=022 \
  -e TZ="$TZ_NAME" \
  -e HARBOR_WATCH_ONLY="$WATCH_ONLY" \
  -e HOLYARRS_UPDATE_CHECK=off \
  -v "$CONFIG:/config" \
  -v "$MEDIA_MOUNT" \
  $FLARE_ARGS \
  $DROP_ARGS \
  $MANGA_ARGS \
  $SHRINK_ARGS \
  -l "net.unraid.docker.webui=http://[IP]:[PORT:6262]/" \
  -l "net.unraid.docker.icon=$ICON" \
  -l "harbor.mode=$MODE" \
  "$IMAGE" >/dev/null || stop "Harbor did not start. Run:  docker logs $NAME"

wait_up() {
  local i
  for i in $(seq 1 30); do
    curl -fsS -m 3 -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null && return 0
    sleep 2
  done
  docker logs --tail 25 "$NAME" 2>&1 | sed 's/^/    /'
  stop "Harbor started but is not answering on port $PORT yet. The lines above say why."
}

say ""
say "Waiting for Harbor to wake up:"
wait_up

# Hand the old apps' keys to Harbor. Harbor has to be stopped for a moment
# for this (it has made its database by now). The keys go into Harbor's
# locked store; the plain file is wiped straight after.
if [ -n "$FOUND" ]; then
  docker stop "$NAME" >/dev/null 2>&1
  KEYFILE="$CONFIG/.harbor-old-app-keys.yaml"
  ( umask 077; printf '%s\n' "$KEYS_YAML" > "$KEYFILE" )
  chown 99:100 "$KEYFILE" 2>/dev/null
  if docker run --rm -e PUID=99 -e PGID=100 -v "$CONFIG:/config" \
       "$IMAGE" import-secrets -file "/config/.harbor-old-app-keys.yaml" >/tmp/harbor-keys.log 2>&1; then
    ok "Harbor now holds the keys for:$FOUND"
  else
    FOUND=""
    note "Harbor could not save the old apps' keys; you can still type them on the Import page. Details:"
    sed 's/^/         /' /tmp/harbor-keys.log
  fi
  if command -v shred >/dev/null 2>&1; then shred -u "$KEYFILE" 2>/dev/null; fi
  rm -f "$KEYFILE" /tmp/harbor-keys.log
  docker start "$NAME" >/dev/null || stop "Harbor did not start again. Run:  docker logs $NAME"
  wait_up
fi
ok "Harbor is running"

say ""
say "=============================================="
say " DONE. Open Harbor in your browser:"
say ""
say "     http://$HOST_IP:$PORT"
say ""
say " Old apps ready to be read:${FOUND:- none}"
[ -z "$MISSING" ] || say " Not found (fine, can be typed in later):$MISSING"
if [ "$MODE" = "watch" ]; then
  say " Mode: WATCH ONLY. Harbor cannot change a media file."
fi
say " The old apps were not changed."
say "=============================================="
say ""
