-- Metnex — PostgreSQL Schema İlklendirme
-- Bu dosya ilk kurulumda çalışır

-- Platform şeması (tüm tenantların üstünde)
CREATE SCHEMA IF NOT EXISTS platform;

-- Shared şema (ISO şablonları, referans verileri)
CREATE SCHEMA IF NOT EXISTS shared;

-- Root (holding) tenant şeması — projeye özel isimle değiştirin
CREATE SCHEMA IF NOT EXISTS customer_root;

-- İştirak/alt tenant şemaları (yeni tenant eklenince buraya da eklenir veya migration ile oluşturulur)
-- CREATE SCHEMA IF NOT EXISTS <tenant_slug>;

-- Yorum: Yeni tenant ekleme işlemi API üzerinden yapılır,
-- migration otomatik olarak doğru schema'yı oluşturur.
