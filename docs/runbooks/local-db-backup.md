# metnex — Local DB Backup ve Restore

Tüm local yedekler proje kökündeki `backup/` dizinine yazılır.

## Manuel Backup

```bash
./scripts/backup-db.sh
./scripts/backup-db.sh --label pre-migration
```

Dosya adı formatı:

```text
backup/local-<db>-YYYYMMDD-HHMMSS[-label].dump
```

## Pre-Commit Otomatik Backup

Kurulum:

```bash
./scripts/setup-hooks.sh
```

Bu işlemden sonra `git commit` öncesi local DB ayaktaysa otomatik yedek alınır.

## Restore

```bash
./scripts/restore-db.sh --file backup/<dosya>.dump
```

Uyarı: restore mevcut local veritabanını silip yeniden oluşturur. Önce yedek almak güvenlidir.
