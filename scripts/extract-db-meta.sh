#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") [--root /path/to/project] [--project-name "Name"] [--project-slug slug] [--out /path/to/output.md]

Description:
  Generates a semi-automatic DB metadata markdown from migrations and schema files.

Defaults:
  --root         current directory
  --out          <root>/docs/DB-METADATA-AUTO.md
  --project-name inferred from package.json name or fallback to slug
  --project-slug inferred from package.json name
USAGE
}

ROOT_DIR="$(pwd)"
PROJECT_NAME=""
PROJECT_SLUG=""
OUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT_DIR="${2:-}"
      shift 2
      ;;
    --project-name)
      PROJECT_NAME="${2:-}"
      shift 2
      ;;
    --project-slug)
      PROJECT_SLUG="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$ROOT_DIR" ]]; then
  echo "Root directory not found: $ROOT_DIR" >&2
  exit 1
fi

PKG_NAME=""
if [[ -f "$ROOT_DIR/package.json" ]]; then
  PKG_NAME="$(rg -No '"name"\s*:\s*"[^"]+"' "$ROOT_DIR/package.json" | head -1 | sed -E 's/.*"([^"]+)"$/\1/' || true)"
fi

if [[ -z "$PROJECT_SLUG" ]]; then
  if [[ -n "$PKG_NAME" ]]; then
    PROJECT_SLUG="$(printf '%s' "$PKG_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  else
    PROJECT_SLUG="project"
  fi
fi

if [[ -z "$PROJECT_NAME" ]]; then
  if [[ -n "$PKG_NAME" ]]; then
    PROJECT_NAME="$PKG_NAME"
  else
    PROJECT_NAME="$PROJECT_SLUG"
  fi
fi

if [[ -z "$OUT_FILE" ]]; then
  OUT_FILE="$ROOT_DIR/docs/DB-METADATA-AUTO.md"
fi

mkdir -p "$(dirname "$OUT_FILE")"

MIG_DIR=""
for c in \
  "$ROOT_DIR/packages/db/migrations" \
  "$ROOT_DIR/db/migrations" \
  "$ROOT_DIR/migrations"; do
  if [[ -d "$c" ]]; then
    MIG_DIR="$c"
    break
  fi
done

SCHEMA_DIR=""
for c in \
  "$ROOT_DIR/packages/db/src/schema" \
  "$ROOT_DIR/src/schema"; do
  if [[ -d "$c" ]]; then
    SCHEMA_DIR="$c"
    break
  fi
done

NOW="$(date +%F)"

tmp_migs="$(mktemp)"
tmp_sql_tables="$(mktemp)"
tmp_sql_enums="$(mktemp)"
tmp_orm_tables="$(mktemp)"
tmp_orm_enums="$(mktemp)"
trap 'rm -f "$tmp_migs" "$tmp_sql_tables" "$tmp_sql_enums" "$tmp_orm_tables" "$tmp_orm_enums"' EXIT

if [[ -n "$MIG_DIR" ]]; then
  find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' | sort > "$tmp_migs"

  while IFS= read -r f; do
    [[ -z "$f" ]] && continue

    rg --no-line-number --no-filename -o -i -P '^\s*create\s+table\s+(if\s+not\s+exists\s+)?("?[a-z0-9_]+"?\.)?"?[a-z0-9_]+"?' "$f" \
      | perl -pe 's/^\s*create\s+table\s+(if\s+not\s+exists\s+)?//i' >> "$tmp_sql_tables" || true

    rg --no-line-number --no-filename -o -i -P '^\s*create\s+type\s+("?[a-z0-9_]+"?\.)?"?[a-z0-9_]+"?\s+as\s+enum' "$f" \
      | perl -pe 's/^\s*create\s+type\s+//i; s/\s+as\s+enum$//i' >> "$tmp_sql_enums" || true
  done < "$tmp_migs"

  grep -Ev '^\s*$|^IF\s*$|^IF\s+NOT\s+EXISTS\s*$' "$tmp_sql_tables" | sort -u > "${tmp_sql_tables}.clean" || true
  mv "${tmp_sql_tables}.clean" "$tmp_sql_tables"

  grep -Ev '^\s*$' "$tmp_sql_enums" | sort -u > "${tmp_sql_enums}.clean" || true
  mv "${tmp_sql_enums}.clean" "$tmp_sql_enums"
fi

if [[ -n "$SCHEMA_DIR" ]]; then
  rg --glob '*.ts' --no-line-number --no-filename -o "schema\.table\(\s*'[^']+'" "$SCHEMA_DIR" \
    | sed -E "s/.*'([^']+)'.*/\1/" | sort -u > "$tmp_orm_tables" || true

  rg --glob '*.ts' --no-line-number --no-filename -o "schema\.enum\(\s*'[^']+'" "$SCHEMA_DIR" \
    | sed -E "s/.*'([^']+)'.*/\1/" | sort -u > "$tmp_orm_enums" || true
fi

{
  echo "# ${PROJECT_NAME} — DB Metadata (Auto Draft)"
  echo
  echo "> Bu belge yari-otomatik uretildi. Manual review zorunludur."
  echo "> Uretim tarihi: ${NOW}"
  echo
  echo "---"
  echo
  echo "## 1) Discovery Ozet"
  echo
  echo "- Proje Koku: \`${ROOT_DIR}\`"
  echo "- Proje Adi: \`${PROJECT_NAME}\`"
  echo "- Proje Slug: \`${PROJECT_SLUG}\`"
  if [[ -n "$MIG_DIR" ]]; then
    echo "- Migration Dizini: \`${MIG_DIR}\`"
    echo "- Migration Sayisi: \`$(wc -l < "$tmp_migs" | tr -d ' ')\`"
  else
    echo "- Migration Dizini: bulunamadi"
    echo "- Migration Sayisi: \`0\`"
  fi
  if [[ -n "$SCHEMA_DIR" ]]; then
    echo "- Schema Dizini: \`${SCHEMA_DIR}\`"
  else
    echo "- Schema Dizini: bulunamadi"
  fi

  echo
  echo "---"
  echo
  echo "## 2) SQL Uzerinden Kesfedilen Nesneler"
  echo
  echo "### 2.1 Tablolar (CREATE TABLE)"
  echo
  if [[ -s "$tmp_sql_tables" ]]; then
    while IFS= read -r t; do
      [[ -z "$t" ]] && continue
      echo "- \`${t}\`"
    done < "$tmp_sql_tables"
  else
    echo "- Kayit yok"
  fi

  echo
  echo "### 2.2 Enumlar (CREATE TYPE ... AS ENUM)"
  echo
  if [[ -s "$tmp_sql_enums" ]]; then
    while IFS= read -r e; do
      [[ -z "$e" ]] && continue
      echo "- \`${e}\`"
    done < "$tmp_sql_enums"
  else
    echo "- Kayit yok"
  fi

  echo
  echo "---"
  echo
  echo "## 3) ORM Uzerinden Kesfedilen Nesneler"
  echo
  echo "### 3.1 ORM Table Tanimlari"
  echo
  if [[ -s "$tmp_orm_tables" ]]; then
    while IFS= read -r t; do
      [[ -z "$t" ]] && continue
      echo "- \`${t}\`"
    done < "$tmp_orm_tables"
  else
    echo "- Kayit yok"
  fi

  echo
  echo "### 3.2 ORM Enum Tanimlari"
  echo
  if [[ -s "$tmp_orm_enums" ]]; then
    while IFS= read -r e; do
      [[ -z "$e" ]] && continue
      echo "- \`${e}\`"
    done < "$tmp_orm_enums"
  else
    echo "- Kayit yok"
  fi

  echo
  echo "---"
  echo
  echo "## 4) Migration Envanteri"
  echo
  echo "| No | Dosya | Ozet |"
  echo "|---|---|---|"
  if [[ -s "$tmp_migs" ]]; then
    i=1
    while IFS= read -r f; do
      file="$(basename "$f")"
      summary="$(head -n 25 "$f" | rg -n -- "--|/\\*" | head -1 | sed -E 's/^[0-9]+://; s/[|]/\\|/g; s/^\s*//; s/\s*$//' || true)"
      if [[ -z "$summary" ]]; then
        summary="TODO: kisa migration ozeti ekle"
      fi
      echo "| ${i} | \`${file}\` | ${summary} |"
      i=$((i + 1))
    done < "$tmp_migs"
  else
    echo "| 1 | - | Migration dosyasi bulunamadi |"
  fi

  echo
  echo "---"
  echo
  echo "## 5) Manuel Doldurulacak Alanlar"
  echo
  echo "### 5.1 Core Metadata"
  echo "- [ ] DB motor/version ve extension listesi eklendi"
  echo "- [ ] Sema modeli (platform/shared/tenant) net yazildi"
  echo "- [ ] Ortam bazli DB baglanti matrisi dolduruldu"

  echo
  echo "### 5.2 Veri Butunlugu"
  echo "- [ ] Tum kritik PK/FK/UNIQUE/INDEX listesi eklendi"
  echo "- [ ] State machine kullanan tablolarin durum akisi yazildi"
  echo "- [ ] Idempotent migration notlari dogrulandi"

  echo
  echo "### 5.3 SDLC / Governance"
  echo "- [ ] Hassas veri alanlari ve maskeleme/hash yaklasimi yazildi"
  echo "- [ ] Retention ve backup politikasi eklendi"
  echo "- [ ] En az 5 operasyonel SQL kontrol sorgusu eklendi"

  echo
  echo "---"
  echo
  echo "## 6) Onerilen Sonraki Adim"
  echo
  echo "1. Bu auto draft'i \`docs/domain/DB-METADATA-TEMPLATE.md\` ile birlestir."
  echo "2. Modul sahiplerinden tablo amaclarini dogrulat."
  echo "3. Son halini \`docs/domain/DB_META.md\` olarak sabitle."
} > "$OUT_FILE"

echo "Generated: $OUT_FILE"
