/**
 * Copyright (c) 2025 Marc Ginger. All rights reserved.
 *
 * This file is part of a proprietary NestJS system developed by Marc Ginger.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited and may result in legal action.
 *
 * Confidential and proprietary.
 */

import { ApiProperty } from '@nestjs/swagger';
export class HealthDetailMemoryResource {
  @ApiProperty({
    description:
      'The amount of memory (in megabytes) currently used on the heap.',
  })
  heapUsed: string;

  @ApiProperty({
    description: 'The total size of the allocated heap (in megabytes).',
  })
  heapTotal: string;

  @ApiProperty({
    description:
      'Memory allocated for ArrayBuffer and SharedArrayBuffer (in megabytes).',
  })
  arrayBuffers: string;

  @ApiProperty({
    description:
      'Resident Set Size: total memory allocated for the process (in megabytes).',
  })
  rss: string;
}

export class HealthDetailDatabaseResource {
  @ApiProperty({ description: 'Database connectivity status' })
  healthy: boolean;

  @ApiProperty({ description: 'Database schema name', required: false })
  schema?: string;

  @ApiProperty({ description: 'Database connection status' })
  isConnected: boolean;

  @ApiProperty({ description: 'Last health check timestamp' })
  lastCheck: string;

  @ApiProperty({ description: 'Migration status information' })
  migrations: {
    migrationsTableExists: boolean;
    lastCheck: string;
  };
}

export class HealthDetailResource {
  @ApiProperty({
    type: () => HealthDetailMemoryResource,
    description: 'Detailed memory usage statistics of the process.',
  })
  memory: HealthDetailMemoryResource;

  @ApiProperty({
    type: () => HealthDetailDatabaseResource,
    description: 'Detailed database health information.',
    required: false,
  })
  database?: HealthDetailDatabaseResource;
}
