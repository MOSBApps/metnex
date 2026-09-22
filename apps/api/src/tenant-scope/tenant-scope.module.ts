import { Module } from '@nestjs/common'
import { CustomerSchemaRegistryService } from './customer-schema-registry.service'
import { TenantClosureService } from './tenant-closure.service'
import { TenantScopeService } from './tenant-scope.service'

@Module({
  providers: [TenantClosureService, CustomerSchemaRegistryService, TenantScopeService],
  exports: [TenantClosureService, CustomerSchemaRegistryService, TenantScopeService],
})
export class TenantScopeModule {}
