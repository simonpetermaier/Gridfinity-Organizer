#!/usr/bin/env bash
#
# setup-https.sh — wire LAN-trusted HTTPS in front of the Gridfinity backend.
#
# Idempotent: re-run any time the host's IP or hostname changes, or after a
# fresh clone on a new machine. Supports macOS and Debian/Ubuntu/Fedora hosts.
#
# Usage:
#   ./caddy/setup-https.sh                            # interactive, auto-detect
#   ./caddy/setup-https.sh --ip 192.168.1.42          # override detected IP
#   ./caddy/setup-https.sh --hostname host.local      # override mDNS hostname
#   ./caddy/setup-https.sh --san 10.0.0.5 --san vpn.tail.ts.net   # extra SANs
#   ./caddy/setup-https.sh -y                         # skip confirmations
#   ./caddy/setup-https.sh --no-docker                # don't touch the stack
#   ./caddy/setup-https.sh --cert-only                # just regenerate cert
#
# Phone setup is manual: the script copies the mkcert root CA to a path it
# prints at the end. AirDrop / email it to the phone and trust it once.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
CADDYFILE="$SCRIPT_DIR/Caddyfile"
CERTS_DIR="$SCRIPT_DIR/certs"

EXTRA_SANS=()
OVERRIDE_IP=""
OVERRIDE_HOST=""
SKIP_CONFIRM=0
SKIP_DOCKER=0
CERT_ONLY=0

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
hr()     { printf '%s\n' "────────────────────────────────────────────────────"; }

die() { red "✗ $*" >&2; exit 1; }

confirm() {
  [[ $SKIP_CONFIRM -eq 1 ]] && return 0
  local prompt="$1"
  read -r -p "$prompt [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

usage() { sed -n '2,20p' "$0"; }

# ── arg parsing ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)         OVERRIDE_IP="$2"; shift 2;;
    --hostname)   OVERRIDE_HOST="$2"; shift 2;;
    --san)        EXTRA_SANS+=("$2"); shift 2;;
    -y|--yes)     SKIP_CONFIRM=1; shift;;
    --no-docker)  SKIP_DOCKER=1; shift;;
    --cert-only)  CERT_ONLY=1; shift;;
    -h|--help)    usage; exit 0;;
    *) die "Unknown flag: $1 (try --help)";;
  esac
done

# ── OS detection ────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos";;
    Linux)
      if [[ -f /etc/debian_version ]]; then echo "debian"
      elif [[ -f /etc/fedora-release ]]; then echo "fedora"
      else echo "linux-unknown"
      fi
      ;;
    *) echo "unsupported";;
  esac
}
OS="$(detect_os)"
[[ "$OS" == "unsupported" || "$OS" == "linux-unknown" ]] && \
  die "Unsupported OS: $(uname -s). Install mkcert manually, then re-run with --cert-only."

# ── ensure mkcert ───────────────────────────────────────────────────────────
ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    green "✓ mkcert already installed ($(mkcert -version 2>&1 | head -1))"
    return
  fi
  yellow "→ Installing mkcert…"
  case "$OS" in
    macos)
      command -v brew >/dev/null || die "Homebrew not found. Install from https://brew.sh first."
      brew install mkcert nss
      ;;
    debian)
      sudo apt-get update
      sudo apt-get install -y libnss3-tools
      # mkcert isn't in apt; grab the static binary
      local arch
      arch="$(dpkg --print-architecture)"
      local url="https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-${arch}"
      sudo curl -fsSL -o /usr/local/bin/mkcert "$url"
      sudo chmod +x /usr/local/bin/mkcert
      ;;
    fedora)
      sudo dnf install -y mkcert nss-tools
      ;;
  esac
  command -v mkcert >/dev/null || die "mkcert install failed."
}

# ── ensure root CA in trust store ───────────────────────────────────────────
ensure_root_ca() {
  local caroot
  caroot="$(mkcert -CAROOT)"
  if [[ -f "$caroot/rootCA.pem" ]] && mkcert -check 2>/dev/null; then
    green "✓ mkcert root CA already installed in trust store"
    return
  fi
  yellow "→ Installing mkcert root CA into your trust store…"
  yellow "  (you may be prompted for your password)"
  mkcert -install
}

# ── detect IP / hostname ────────────────────────────────────────────────────
detect_ip() {
  if [[ -n "$OVERRIDE_IP" ]]; then echo "$OVERRIDE_IP"; return; fi
  if [[ "$OS" == "macos" ]]; then
    for iface in en0 en1 en2 en3; do
      local ip; ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [[ -n "$ip" ]] && { echo "$ip"; return; }
    done
  else
    hostname -I 2>/dev/null | awk '{print $1}' && return || true
    ip -4 -o addr show scope global 2>/dev/null \
      | awk '{print $4}' | cut -d/ -f1 | head -1
  fi
}

detect_hostname() {
  if [[ -n "$OVERRIDE_HOST" ]]; then echo "$OVERRIDE_HOST"; return; fi
  if [[ "$OS" == "macos" ]]; then
    local h; h="$(scutil --get LocalHostName 2>/dev/null || true)"
    [[ -n "$h" ]] && echo "${h}.local"
  else
    local h; h="$(hostname -f 2>/dev/null || hostname)"
    [[ "$h" == *.* ]] && echo "$h" || echo "${h}.local"
  fi
}

# ── generate cert ───────────────────────────────────────────────────────────
generate_cert() {
  local ip="$1" host="$2"
  mkdir -p "$CERTS_DIR"
  local -a sans=()
  [[ -n "$ip" ]]   && sans+=("$ip")
  [[ -n "$host" ]] && sans+=("$host")
  sans+=("localhost" "127.0.0.1")
  sans+=( ${EXTRA_SANS[@]+"${EXTRA_SANS[@]}"} )
  blue "→ Generating cert for: ${sans[*]}"
  mkcert -cert-file "$CERTS_DIR/cert.pem" -key-file "$CERTS_DIR/key.pem" "${sans[@]}"
}

# ── patch Caddyfile (tls internal → mkcert PEMs) ────────────────────────────
patch_caddyfile() {
  [[ -f "$CADDYFILE" ]] || die "Caddyfile not found at $CADDYFILE"
  if grep -qE '^\s*tls\s+/certs/cert\.pem' "$CADDYFILE"; then
    green "✓ Caddyfile already points at mkcert PEMs"
    return
  fi
  if grep -qE '^\s*tls\s+internal' "$CADDYFILE"; then
    yellow "→ Switching Caddyfile from 'tls internal' to mkcert PEMs"
    sed -i.bak 's|^\(\s*\)tls internal|\1tls /certs/cert.pem /certs/key.pem|' "$CADDYFILE"
    rm -f "$CADDYFILE.bak"
  else
    yellow "! Caddyfile has a custom tls directive — leaving it alone."
  fi
}

# ── patch docker-compose.yml (uncomment caddy block) ────────────────────────
patch_compose() {
  [[ -f "$COMPOSE_FILE" ]] || die "docker-compose.yml not found at $COMPOSE_FILE"
  if grep -qE '^  caddy:' "$COMPOSE_FILE"; then
    green "✓ Caddy service already enabled in docker-compose.yml"
    return
  fi
  if ! grep -qE '^  # caddy:' "$COMPOSE_FILE"; then
    die "Neither enabled nor commented 'caddy:' block found in docker-compose.yml — refusing to guess."
  fi
  yellow "→ Uncommenting Caddy service block in docker-compose.yml"
  # Substitutions for every line of the known commented block. Idempotent
  # because we already returned above if any uncommented form exists.
  sed -i.bak \
    -e 's|^  # caddy:|  caddy:|' \
    -e 's|^  #   image: caddy:2-alpine|    image: caddy:2-alpine|' \
    -e 's|^  #   restart: unless-stopped|    restart: unless-stopped|' \
    -e 's|^  #   ports:|    ports:|' \
    -e 's|^  #     - "80:80"|      - "80:80"|' \
    -e 's|^  #     - "443:443"|      - "443:443"|' \
    -e 's|^  #   volumes:|    volumes:|' \
    -e 's|^  #     - \./caddy/Caddyfile:/etc/caddy/Caddyfile:ro|      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro|' \
    -e 's|^  #     - \./caddy/certs:/certs:ro|      - ./caddy/certs:/certs:ro|' \
    -e 's|^  #     - caddy_data:/data|      - caddy_data:/data|' \
    -e 's|^  #     - caddy_config:/config|      - caddy_config:/config|' \
    -e 's|^  #   depends_on:|    depends_on:|' \
    -e 's|^  #     - backend|      - backend|' \
    -e 's|^  # caddy_data:|  caddy_data:|' \
    -e 's|^  # caddy_config:|  caddy_config:|' \
    "$COMPOSE_FILE"
  rm -f "$COMPOSE_FILE.bak"
}

# ── restart stack ───────────────────────────────────────────────────────────
restart_stack() {
  command -v docker >/dev/null || die "docker not found in PATH."
  yellow "→ Bringing up the stack (docker compose up -d)…"
  (cd "$REPO_ROOT" && docker compose up -d)
  # If only the certs changed and Caddy was already running, the up -d above
  # is a no-op. Force a restart so the new PEMs are picked up.
  (cd "$REPO_ROOT" && docker compose restart caddy >/dev/null 2>&1 || true)
}

# ── verify ──────────────────────────────────────────────────────────────────
verify() {
  local target="$1"
  local caroot; caroot="$(mkcert -CAROOT)/rootCA.pem"
  blue "→ Verifying https://$target/ …"
  # Caddy's startup is fast but not instant; small retry loop.
  local i status
  for i in 1 2 3 4 5; do
    status="$(curl -sS -o /dev/null -w '%{http_code}' \
      --cacert "$caroot" --max-time 4 \
      "https://$target/" 2>/dev/null || echo "000")"
    [[ "$status" == "200" ]] && { green "✓ https://$target/ → 200 OK"; return; }
    sleep 1
  done
  red "✗ HTTPS check failed (last status: $status). Check 'docker compose logs caddy'."
  return 1
}

# ── export root CA for phone transfer ───────────────────────────────────────
export_root_ca() {
  local dest="$REPO_ROOT/mkcert-rootCA.crt"
  cp "$(mkcert -CAROOT)/rootCA.pem" "$dest"
  echo "$dest"
}

# ── main ────────────────────────────────────────────────────────────────────
hr
bold " Gridfinity HTTPS setup"
hr
echo "  Repo:         $REPO_ROOT"
echo "  OS:           $OS"
echo

ensure_mkcert
ensure_root_ca

IP="$(detect_ip || true)"
HOST="$(detect_hostname || true)"
echo
bold " Detected SANs"
echo "  IP:           ${IP:-<none>}"
echo "  Hostname:     ${HOST:-<none>}"
[[ ${#EXTRA_SANS[@]} -gt 0 ]] && echo "  Extra SANs:   ${EXTRA_SANS[*]}"
echo
[[ -z "$IP" && -z "$HOST" && ${#EXTRA_SANS[@]} -eq 0 ]] && \
  die "No SANs found — pass --ip and/or --hostname explicitly."

confirm "Generate cert for the SANs above?" || die "Aborted."
generate_cert "$IP" "$HOST"

if [[ $CERT_ONLY -eq 1 ]]; then
  green "✓ Cert regenerated. Skipping Caddyfile / compose / docker steps."
  (cd "$REPO_ROOT" && docker compose restart caddy >/dev/null 2>&1 || true)
  exit 0
fi

patch_caddyfile
patch_compose

if [[ $SKIP_DOCKER -eq 0 ]]; then
  restart_stack
  echo
  if [[ -n "$IP" ]]; then verify "$IP" || true; fi
  if [[ -n "$HOST" ]]; then verify "$HOST" || true; fi
else
  yellow "→ --no-docker set, not touching the stack. Restart manually:"
  echo "    cd $REPO_ROOT && docker compose up -d"
fi

# ── final summary ───────────────────────────────────────────────────────────
ROOT_CA_EXPORT="$(export_root_ca)"
echo
hr
bold " Phone setup (one-time per device)"
hr
echo "  1. Transfer the root CA to the phone (AirDrop / email):"
echo "       $ROOT_CA_EXPORT"
echo "  2. iOS: open the file → Allow profile download."
echo "     Settings → General → VPN & Device Management → install profile."
echo "     Settings → General → About → Certificate Trust Settings →"
echo "       toggle 'mkcert' ON. (Easy to miss; required for HTTPS trust.)"
echo "  3. Android: Settings → Security → Install from storage → CA cert."
echo
bold " Visit on the phone:"
[[ -n "$IP" ]]   && echo "    https://$IP/"
[[ -n "$HOST" ]] && echo "    https://$HOST/"
echo
green "Done."
