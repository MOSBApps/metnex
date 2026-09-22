import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { Observable, tap } from 'rxjs'
import { perfRequestStorage, type QueryCollector } from './perf-request-context'
import { PerfRequestLogService } from './perf-request-log.service'
import { PerfSettingsService } from './perf-settings.service'

type RequestWithUser = Request & { user?: { id?: string } }

@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  constructor(
    private readonly perfLog: PerfRequestLogService,
    private readonly settings: PerfSettingsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const req = http.getRequest<RequestWithUser>()
    const res = http.getResponse<Response>()
    const startMs = Date.now()
    const requestId = randomUUID()
    const tenantHeader = req.headers['x-tenant-id']
    const tenantId = typeof tenantHeader === 'string' ? tenantHeader : undefined

    return new Observable(subscriber => {
      this.settings
        .getSettings()
        .then(settings => {
          const finish = (collector: QueryCollector | null) =>
            this.finish(req, res, startMs, requestId, tenantId, settings.slowRequestThresholdMs, collector)

          if (settings.dbTraceEnabled) {
            const collector: QueryCollector = { queries: [] }
            perfRequestStorage.run(collector, () => {
              next
                .handle()
                .pipe(
                  tap({
                    complete: () => finish(collector),
                    error: () => finish(collector),
                  }),
                )
                .subscribe(subscriber)
            })
            return
          }

          next
            .handle()
            .pipe(
              tap({
                complete: () => finish(null),
                error: () => finish(null),
              }),
            )
            .subscribe(subscriber)
        })
        .catch(() => {
          next
            .handle()
            .pipe(
              tap({
                complete: () => this.finish(req, res, startMs, requestId, tenantId, 1000, null),
                error: () => this.finish(req, res, startMs, requestId, tenantId, 1000, null),
              }),
            )
            .subscribe(subscriber)
        })
    })
  }

  private finish(
    req: RequestWithUser,
    res: Response,
    startMs: number,
    requestId: string,
    tenantId: string | undefined,
    thresholdMs: number,
    collector: QueryCollector | null,
  ) {
    const durationMs = Date.now() - startMs

    try {
      res.setHeader('X-Response-Time-ms', String(durationMs))
    } catch {
      // ignore header write issues on completed responses
    }

    if (durationMs < thresholdMs && res.statusCode < 500) return

    const route =
      req.route?.path && typeof req.route.path === 'string'
        ? `${req.baseUrl ?? ''}${req.route.path}`
        : req.originalUrl?.split('?')[0] ?? req.url

    void this.perfLog.persist({
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id,
      tenantId,
      collector,
    })
  }
}
