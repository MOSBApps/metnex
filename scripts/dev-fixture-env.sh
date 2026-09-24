#!/usr/bin/env bash
# dev-fixture-env.sh — local development CSV fixture environment (TASK-027.73-R3)
#
# Sourced by dev.sh (never executed on its own, never used by production / Docker config).
#
# It decides the two values dev.sh writes into the LOCAL apps/api/.env:
#   REPORTING_DEV_FIXTURES                 (default: true)
#   REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE  (default: Europe/Istanbul)
#   REPORTING_DEV_FIXTURE_SCOPE_BRIDGE     (default: true; TASK-027.73-R4 — registry-free development data scope for the SCADA fixture API only;
#                                          effective only together with NODE_ENV=development, REPORTING_DEV_FIXTURES=true and a valid zone)
#
# Precedence for each variable:  value already exported in the caller's environment
#                              > value already present in the existing apps/api/.env
#                              > the default above.
# An explicit REPORTING_DEV_FIXTURES=false is honoured (the fixture stays off). A time zone that is not a valid IANA
# zone is NEVER corrected here: it is written as given and the API stays fail-closed (no analysis). A value with characters that
# could break out of a .env line (space, quote, #, $, backslash, newline …) is refused, not sanitised.
# Nothing here reads a CSV, prints a path, a connection string or any credential.

DEV_FIXTURE_DEFAULT_FLAG="true"
DEV_FIXTURE_DEFAULT_TZ="Europe/Istanbul"
DEV_FIXTURE_DEFAULT_BRIDGE="true"

# _env_file_value <file> <VAR> → the value of VAR in <file> (first match), empty if absent / unreadable.
_env_file_value() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 0
  grep -m1 "^${name}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

# _dev_fixture_pick <VAR> <default> <env-file>
_dev_fixture_pick() {
  local name="$1" default="$2" file="$3" value
  value="${!name:-}"
  if [[ -z "$value" ]]; then value="$(_env_file_value "$file" "$name")"; fi
  if [[ -z "$value" ]]; then value="$default"; fi
  printf '%s' "$value"
}

# resolve_dev_fixture_env <existing-api-env-file>
# Sets DEV_FIXTURE_FLAG and DEV_FIXTURE_TZ; returns 1 (with a static message on stderr) for an unsafe value.
resolve_dev_fixture_env() {
  local file="${1:-}"
  DEV_FIXTURE_FLAG="$(_dev_fixture_pick REPORTING_DEV_FIXTURES "$DEV_FIXTURE_DEFAULT_FLAG" "$file")"
  DEV_FIXTURE_TZ="$(_dev_fixture_pick REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE "$DEV_FIXTURE_DEFAULT_TZ" "$file")"
  DEV_FIXTURE_BRIDGE="$(_dev_fixture_pick REPORTING_DEV_FIXTURE_SCOPE_BRIDGE "$DEV_FIXTURE_DEFAULT_BRIDGE" "$file")"
  local safe='^[A-Za-z0-9_./+:-]{1,64}$'
  if ! [[ "$DEV_FIXTURE_FLAG" =~ $safe ]] || ! [[ "$DEV_FIXTURE_TZ" =~ $safe ]] || ! [[ "$DEV_FIXTURE_BRIDGE" =~ $safe ]]; then
    echo "Geliştirme CSV fixture değişkeni güvenli olmayan karakter içeriyor; .env yazılmadı." >&2
    return 1
  fi
  return 0
}

# dev_fixture_env_lines → the two .env lines (uses DEV_FIXTURE_FLAG / DEV_FIXTURE_TZ set by resolve_dev_fixture_env).
dev_fixture_env_lines() {
  printf 'REPORTING_DEV_FIXTURES=%s\n' "$DEV_FIXTURE_FLAG"
  printf 'REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=%s\n' "$DEV_FIXTURE_TZ"
  printf 'REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=%s\n' "$DEV_FIXTURE_BRIDGE"
}

# dev_fixture_tz_valid <zone> → 0 when Node's Intl accepts it (skipped, treated as valid, if node is missing).
dev_fixture_tz_valid() {
  command -v node >/dev/null 2>&1 || return 0
  node -e 'try{new Intl.DateTimeFormat("en-US",{timeZone:process.argv[1]})}catch(e){process.exit(1)}' "$1" >/dev/null 2>&1
}

# dev_fixture_status_message → a safe, static status text (no path, no row, no connection string, no credential).
dev_fixture_status_message() {
  if [[ "$DEV_FIXTURE_FLAG" != "true" ]]; then
    echo "Development CSV fixture: disabled"
    return 0
  fi
  echo "Development CSV fixture: enabled"
  echo "Source timezone: ${DEV_FIXTURE_TZ}"
  if ! dev_fixture_tz_valid "$DEV_FIXTURE_TZ"; then
    echo "UYARI: saat dilimi geçerli bir IANA değeri değil; API bunu düzeltmez ve analiz çalıştırmaz (fail-closed)."
  fi
  if [[ "$DEV_FIXTURE_BRIDGE" == "true" ]]; then
    echo "Development CSV fixture scope bridge: enabled"
  else
    echo "Development CSV fixture scope bridge: disabled"
  fi
}
