#!/usr/bin/env bash
# Helpers for reading individual variables from a KEY=VALUE env file WITHOUT executing it.
# `source`-ing a whole .env file exports every secret in it and evaluates shell syntax; these
# helpers read only explicitly named variables. Values are never printed or placed on a command
# line (only shell builtins receive them).

# read_env_var FILE NAME -> prints the value (last definition wins), returns 1 when absent/empty.
read_env_var() {
  local file="$1" name="$2" line value
  [[ "$name" =~ ^[A-Z_][A-Z0-9_]*$ ]] || return 2
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^(export[[:space:]]+)?${name}=" "$file" | tail -n 1)" || return 1
  value="${line#*=}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

# export_env_allowlist FILE NAME... -> exports each found variable; warns (names only) for absent ones.
export_env_allowlist() {
  local file="$1" name value
  shift
  for name in "$@"; do
    if value="$(read_env_var "$file" "$name")"; then
      export "$name=$value"
    else
      echo "warn: ${name} is not set in the env file" >&2
    fi
  done
}

# write_env_file_var FILE SRC NAME -> appends NAME=<value from SRC> to FILE (created 0600 by caller's umask).
# Fails, printing only the variable name, when the variable is absent.
write_env_file_var() {
  local dest="$1" src="$2" name="$3" value
  if ! value="$(read_env_var "$src" "$name")"; then
    echo "error: required variable ${name} is missing from the env file" >&2
    return 1
  fi
  printf '%s=%s\n' "$name" "$value" >> "$dest"
}
