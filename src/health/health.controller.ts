/**
 * Copyright (c) 2025 Marc Ginger. All rights reserved.
 *
 * This file is part of a proprietary NestJS system developed by Marc Ginger.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited and may result in legal action.
 *
 * Confidential and proprietary.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { HealthDetailResource } from './health.dto';
import { DatabaseHealthService } from '../shared/infrastructure/database';
@Controller('actuator')
@ApiTags('Health check')
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly memoryHealthIndicator: MemoryHealthIndicator,
    private readonly databaseHealthService: DatabaseHealthService,
  ) {}

  /**
   * Performs a health check on memory and database.
   * @returns {Promise<any>} Health check result
   */
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns the health status of the application',
  })
  @HealthCheck()
  async check() {
    return this.healthCheckService.check([
      // the process should not use more than 300MB memory
      () =>
        this.memoryHealthIndicator.checkHeap('memory heap', 300 * 1024 * 1024),
      // The process should not have more than 300MB RSS memory allocated
      () =>
        this.memoryHealthIndicator.checkRSS('memory RSS', 300 * 1024 * 1024),

      // Database connectivity check
      () => this.checkDatabase(),
    ]);
  }

  /**
   * Custom database health indicator
   */
  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const isHealthy = await this.databaseHealthService.isHealthy();
    const result: HealthIndicatorResult = {
      database: {
        status: isHealthy ? 'up' : 'down',
      },
    };

    if (!isHealthy) {
      throw new Error('Database health check failed');
    }

    return result;
  }

  /**
   * Returns detailed memory usage information.
   * @returns {HealthDetailResource} Memory usage details
   */
  @Get('/detail')
  @ApiOperation({
    summary: 'Deep health scan',
    description: 'Returns detailed memory usage and database information',
  })
  @ApiResponse({ type: HealthDetailResource, isArray: false })
  async healthDetails(): Promise<HealthDetailResource> {
    const memoryUsage = process.memoryUsage();

    const heapUsed = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotal = memoryUsage.heapTotal / 1024 / 1024;
    const arrayBuffers = memoryUsage.arrayBuffers / 1024 / 1024;
    const rss = memoryUsage.rss / 1024 / 1024;

    // Get detailed database health
    const dbHealth = await this.databaseHealthService.getHealthDetails();

    const migrationStatus =
      await this.databaseHealthService.getMigrationStatus();

    return {
      memory: {
        heapUsed: `${Math.round(heapUsed * 100) / 100} MB`,
        heapTotal: `${Math.round(heapTotal * 100) / 100} MB`,
        arrayBuffers: `${Math.round(arrayBuffers * 100) / 100} MB`,
        rss: `${Math.round(rss * 100) / 100} MB`,
      },
      database: {
        healthy: dbHealth.healthy,
        schema: dbHealth.schema,
        isConnected: dbHealth.isConnected,
        lastCheck: dbHealth.lastCheck,
        migrations: migrationStatus,
      },
    };
  }
}
