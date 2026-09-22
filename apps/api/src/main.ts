import * as dotenv from 'dotenv'
dotenv.config()

import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

function resolveCorsOrigins(): string[] {
  const raw = process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000'
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  })
  app.setGlobalPrefix('api/v1')

  await app.listen(Number(process.env['PORT'] ?? 3001))
}

void bootstrap()
