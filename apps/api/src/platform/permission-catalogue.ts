export interface PermissionEntry {
  code: string
  description: string
}

export const ASSIGNABLE_CATALOGUE: PermissionEntry[] = [
  { code: 'SETTINGS:GENERAL:VIEW', description: 'Tenant genel ayarlarını görüntüleme' },
  { code: 'SETTINGS:GENERAL:MANAGE', description: 'Tenant genel ayarlarını yönetme' },
  { code: 'SETTINGS:SMTP:VIEW', description: 'Tenant SMTP ayarlarını görüntüleme' },
  { code: 'SETTINGS:SMTP:MANAGE', description: 'Tenant SMTP ayarlarını yönetme' },
  { code: 'SETTINGS:AI_PROVIDER:VIEW', description: 'Tenant AI sağlayıcı ayarlarını görüntüleme' },
  { code: 'SETTINGS:AI_PROVIDER:MANAGE', description: 'Tenant AI sağlayıcı ayarlarını yönetme' },
  { code: 'CUSTOMER:ADMIN:VIEW', description: 'Müşteri yönetim paneli görüntüleme' },
  { code: 'CUSTOMER:ADMIN:MANAGE', description: 'Müşteri yönetim işlemlerini gerçekleştirme' },
  { code: 'REPORT:ARTIFACT:VIEW', description: 'Rapor artifact görüntüleme' },
  { code: 'REPORT:ARTIFACT:EXPORT', description: 'Rapor çıktısı indirme' },
]
