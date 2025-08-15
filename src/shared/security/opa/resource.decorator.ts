import { SetMetadata } from '@nestjs/common';

export interface ResourceOptions {
  type: string;
  action: string;
  extractId?: (req: any) => string | undefined | Promise<string | undefined>;
  extractAttributes?: (
    req: any,
  ) => Record<string, any> | Promise<Record<string, any>>;
}

export const RESOURCE_KEY = 'resource';

export const Resource = (options: ResourceOptions) =>
  SetMetadata(RESOURCE_KEY, options);
