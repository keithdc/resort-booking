/**
 * @file apps/api/src/shared/redis/redis.module.ts
 * @shared Redis connection
 * @dependencies RedisService
 */

import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
