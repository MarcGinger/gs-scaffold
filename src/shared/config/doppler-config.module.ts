/**
 * Doppler Configuration Module
 * NestJS Module for Doppler-based configuration management
 */

import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  DopplerConfigService,
  DopplerServiceOptions,
} from './doppler-config.service';
import { ConfigLoader } from './config-loader';

export interface DopplerModuleOptions extends DopplerServiceOptions {
  /** Make the module global (recommended) */
  isGlobal?: boolean;
}

@Global()
@Module({})
export class DopplerConfigModule {
  /**
   * Configure Doppler integration for the application
   */
  static forRoot(options: DopplerModuleOptions = {}): DynamicModule {
    const configService = new DopplerConfigService({
      enableFallback: true,
      enableLogging: true,
      strict: false,
      ...options,
    });

    return {
      module: DopplerConfigModule,
      global: options.isGlobal !== false,
      imports: [
        ConfigModule.forRootAsync({
          useFactory: async () => {
            const config = await configService.loadConfiguration();
            return {
              load: [() => config],
              isGlobal: true,
            };
          },
        }),
      ],
      providers: [
        {
          provide: DopplerConfigService,
          useValue: configService,
        },
        {
          provide: ConfigLoader,
          useValue: ConfigLoader.getInstance(),
        },
      ],
      exports: [DopplerConfigService, ConfigLoader],
    };
  }

  /**
   * Configure Doppler integration for feature modules
   */
  static forFeature(): DynamicModule {
    return {
      module: DopplerConfigModule,
      providers: [
        {
          provide: ConfigLoader,
          useValue: ConfigLoader.getInstance(),
        },
      ],
      exports: [ConfigLoader],
    };
  }
}
