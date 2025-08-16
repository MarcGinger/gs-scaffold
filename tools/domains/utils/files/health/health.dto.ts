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

export class HealthDetailResource {
  @ApiProperty({
    type: () => HealthDetailMemoryResource,
    description: 'Detailed memory usage statistics of the process.',
  })
  memory: HealthDetailMemoryResource;
}
