import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as Minio from 'minio'

export interface StorageUsageResult {
  mbUsed: number | null
  status: 'REAL' | 'APPROXIMATE' | 'UNSUPPORTED'
  message?: string
}

@Injectable()
export class StorageUsageService implements OnModuleInit {
  private readonly logger = new Logger(StorageUsageService.name)
  private client: Minio.Client | null = null
  private bucket: string = ''

  onModuleInit() {
    const endpoint = process.env.MINIO_ENDPOINT
    const port = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : undefined
    const accessKey = process.env.MINIO_ACCESS_KEY
    const secretKey = process.env.MINIO_SECRET_KEY
    const useSsl = process.env.MINIO_USE_SSL === 'true'
    this.bucket = process.env.MINIO_BUCKET || 'metnex-dev'

    if (!endpoint || !accessKey || !secretKey) {
      this.logger.warn('MinIO configuration is missing. Storage measurement will be unsupported.')
      return
    }

    try {
      this.client = new Minio.Client({
        endPoint: endpoint,
        port: port,
        useSSL: useSsl,
        accessKey: accessKey,
        secretKey: secretKey,
      })
      this.logger.log(`MinIO client initialized (endpoint: ${endpoint}:${port}, bucket: ${this.bucket})`)
    } catch (error) {
      this.logger.error('Failed to initialize MinIO client', error)
    }
  }

  async getCustomerRootUsageMb(customerRootId: string): Promise<StorageUsageResult> {
    if (!this.client) {
      return { mbUsed: null, status: 'UNSUPPORTED', message: 'Storage connection not configured' }
    }

    try {
      const bucketExists = await this.client.bucketExists(this.bucket)
      if (!bucketExists) {
        return {
          mbUsed: null,
          status: 'UNSUPPORTED',
          message: `Configured bucket "${this.bucket}" is not available`,
        }
      }

      const prefixes = [`tenants/${customerRootId}/`, `customer-roots/${customerRootId}/`]
      let totalSizeBytes = 0
      let objectCount = 0

      for (const prefix of prefixes) {
        const result = await this.measurePrefix(prefix)
        totalSizeBytes += result.totalSizeBytes
        objectCount += result.objectCount
      }

      const sizeMb = Number((totalSizeBytes / (1024 * 1024)).toFixed(4))
      return {
        mbUsed: sizeMb,
        status: 'APPROXIMATE',
        message:
          objectCount > 0
            ? `Measured ${objectCount} object(s) under inferred customer-root prefixes. Prefix ownership is not yet an authoritative repository-wide storage contract.`
            : 'Storage access is working, but the repository does not yet define an authoritative customer-root object namespace. Showing a best-effort prefix scan with no matched objects.',
      }
    } catch (error) {
      this.logger.error('Failed to get storage usage', error)
      return { mbUsed: null, status: 'UNSUPPORTED', message: 'Storage access error' }
    }
  }

  private async measurePrefix(prefix: string): Promise<{ totalSizeBytes: number; objectCount: number }> {
    if (!this.client) {
      return { totalSizeBytes: 0, objectCount: 0 }
    }

    return new Promise((resolve, reject) => {
      let totalSizeBytes = 0
      let objectCount = 0
      const objectsStream = this.client!.listObjectsV2(this.bucket, prefix, true)

      objectsStream.on('data', obj => {
        totalSizeBytes += obj.size || 0
        objectCount += 1
      })

      objectsStream.on('error', error => {
        this.logger.error(`Failed to list objects for prefix ${prefix}`, error)
        reject(error)
      })

      objectsStream.on('end', () => {
        resolve({ totalSizeBytes, objectCount })
      })
    })
  }
}
