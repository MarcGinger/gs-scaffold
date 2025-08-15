/**
 * Secret Migration Manager - Phase 2.2
 * 
 * This module handles the gradual migration of secrets from .env files to Doppler,
 * following the priority-based migration strategy defined in the mapping document.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

const execAsync = promisify(exec);

export interface MigrationSecretGroup {
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  name: string;
  description: string;
  secrets: MigrationSecret[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface MigrationSecret {
  legacyName: string;
  dopplerName: string;
  description: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  required: boolean;
  hasDefault: boolean;
  currentValue?: string;
  notes?: string;
}

export interface MigrationPlan {
  totalSecrets: number;
  migratedSecrets: number;
  remainingSecrets: number;
  groups: MigrationSecretGroup[];
}

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  warnings: string[];
  nextPriority?: string;
}

/**
 * Secret Migration Manager
 * Handles the step-by-step migration of secrets from .env to Doppler
 */
export class SecretMigrationManager {
  private static instance: SecretMigrationManager;

  static getInstance(): SecretMigrationManager {
    if (!SecretMigrationManager.instance) {
      SecretMigrationManager.instance = new SecretMigrationManager();
    }
    return SecretMigrationManager.instance;
  }

  /**
   * Get the complete migration plan with all secret groups
   */
  getMigrationPlan(): MigrationPlan {
    const groups: MigrationSecretGroup[] = [
      // P0: Critical Secrets - Authentication and Core Database
      {
        priority: 'P0',
        name: 'Critical Authentication & Database',
        description: 'Essential secrets required for application startup',
        riskLevel: 'critical',
        secrets: [
          {
            legacyName: 'KEYCLOAK_CLIENT_SECRET',
            dopplerName: 'AUTH_KEYCLOAK_CLIENT_SECRET',
            description: 'OAuth client secret for authentication',
            riskLevel: 'critical',
            required: true,
            hasDefault: false,
            notes: 'Required for all environments'
          },
          {
            legacyName: 'PII_ENCRYPTION_KEY',
            dopplerName: 'SECURITY_PII_ENCRYPTION_KEY',
            description: 'Encryption key for PII data protection',
            riskLevel: 'critical',
            required: true,
            hasDefault: false,
            notes: 'Must be unique per environment'
          },
          {
            legacyName: 'DATABASE_PASSWORD',
            dopplerName: 'DATABASE_POSTGRES_PASSWORD',
            description: 'PostgreSQL database password',
            riskLevel: 'critical',
            required: true,
            hasDefault: false,
            notes: 'Core database access credential'
          },
          {
            legacyName: 'DATABASE_URL',
            dopplerName: 'DATABASE_POSTGRES_URL',
            description: 'Complete PostgreSQL connection string',
            riskLevel: 'critical',
            required: true,
            hasDefault: false,
            notes: 'Full connection string with embedded credentials'
          }
        ]
      },

      // P1: High Priority - Service Connections
      {
        priority: 'P1',
        name: 'Service Connections',
        description: 'Critical service connection strings and credentials',
        riskLevel: 'high',
        secrets: [
          {
            legacyName: 'REDIS_URL',
            dopplerName: 'CACHE_REDIS_URL',
            description: 'Redis cache connection string',
            riskLevel: 'high',
            required: true,
            hasDefault: false,
            notes: 'May contain embedded credentials'
          },
          {
            legacyName: 'REDIS_PASSWORD',
            dopplerName: 'CACHE_REDIS_PASSWORD',
            description: 'Redis authentication password',
            riskLevel: 'high',
            required: false,
            hasDefault: false,
            notes: 'May be embedded in REDIS_URL'
          },
          {
            legacyName: 'ESDB_CONNECTION_STRING',
            dopplerName: 'EVENTSTORE_ESDB_CONNECTION_STRING',
            description: 'EventStore database connection',
            riskLevel: 'high',
            required: true,
            hasDefault: false,
            notes: 'Core event sourcing dependency'
          },
          {
            legacyName: 'DATABASE_USER',
            dopplerName: 'DATABASE_POSTGRES_USER',
            description: 'PostgreSQL database username',
            riskLevel: 'high',
            required: true,
            hasDefault: true,
            notes: 'Database connection credential'
          }
        ]
      },

      // P2: Medium Priority - Service Endpoints and Auth Config
      {
        priority: 'P2',
        name: 'Service Endpoints & Authentication Config',
        description: 'Service URLs and authentication configuration',
        riskLevel: 'medium',
        secrets: [
          {
            legacyName: 'KEYCLOAK_URL',
            dopplerName: 'AUTH_KEYCLOAK_URL',
            description: 'Keycloak authentication server URL',
            riskLevel: 'medium',
            required: true,
            hasDefault: true,
            notes: 'Authentication service endpoint'
          },
          {
            legacyName: 'KEYCLOAK_REALM',
            dopplerName: 'AUTH_KEYCLOAK_REALM',
            description: 'Keycloak authentication realm',
            riskLevel: 'medium',
            required: true,
            hasDefault: true,
            notes: 'Authentication realm configuration'
          },
          {
            legacyName: 'KEYCLOAK_CLIENT_ID',
            dopplerName: 'AUTH_KEYCLOAK_CLIENT_ID',
            description: 'OAuth client identifier',
            riskLevel: 'medium',
            required: true,
            hasDefault: true,
            notes: 'OAuth client configuration'
          },
          {
            legacyName: 'JWT_AUDIENCE',
            dopplerName: 'AUTH_JWT_AUDIENCE',
            description: 'JWT token audience claim',
            riskLevel: 'medium',
            required: true,
            hasDefault: true,
            notes: 'JWT validation configuration'
          },
          {
            legacyName: 'OPA_URL',
            dopplerName: 'SECURITY_OPA_URL',
            description: 'Open Policy Agent service URL',
            riskLevel: 'medium',
            required: false,
            hasDefault: true,
            notes: 'Authorization policy service'
          },
          {
            legacyName: 'PUBLIC_API_URL',
            dopplerName: 'APP_SERVER_PUBLIC_URL',
            description: 'Public API endpoint URL',
            riskLevel: 'medium',
            required: false,
            hasDefault: false,
            notes: 'External/public endpoint reference'
          },
          {
            legacyName: 'LOKI_BASIC_AUTH',
            dopplerName: 'LOGGING_LOKI_BASIC_AUTH',
            description: 'Loki logging service authentication',
            riskLevel: 'medium',
            required: false,
            hasDefault: false,
            notes: 'Logging service credentials'
          }
        ]
      },

      // P3: Standard Priority - Application Configuration
      {
        priority: 'P3',
        name: 'Application Configuration',
        description: 'Core application and runtime settings',
        riskLevel: 'low',
        secrets: [
          {
            legacyName: 'NODE_ENV',
            dopplerName: 'APP_RUNTIME_ENVIRONMENT',
            description: 'Application runtime environment',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Environment designation'
          },
          {
            legacyName: 'PORT',
            dopplerName: 'APP_SERVER_PORT',
            description: 'HTTP server port',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Server binding configuration'
          },
          {
            legacyName: 'PROTOCOL',
            dopplerName: 'APP_SERVER_PROTOCOL',
            description: 'HTTP/HTTPS protocol',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Protocol configuration'
          },
          {
            legacyName: 'HOST',
            dopplerName: 'APP_SERVER_HOST',
            description: 'Server binding host',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Host binding configuration'
          },
          {
            legacyName: 'LOG_LEVEL',
            dopplerName: 'LOGGING_CORE_LEVEL',
            description: 'Application log level',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Log verbosity control'
          },
          {
            legacyName: 'LOG_SINK',
            dopplerName: 'LOGGING_CORE_SINK',
            description: 'Log output destination',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Logging output configuration'
          },
          {
            legacyName: 'DATABASE_HOST',
            dopplerName: 'DATABASE_POSTGRES_HOST',
            description: 'PostgreSQL host address',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Database connection component'
          },
          {
            legacyName: 'DATABASE_PORT',
            dopplerName: 'DATABASE_POSTGRES_PORT',
            description: 'PostgreSQL port number',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Database connection component'
          },
          {
            legacyName: 'DATABASE_NAME',
            dopplerName: 'DATABASE_POSTGRES_NAME',
            description: 'PostgreSQL database name',
            riskLevel: 'low',
            required: true,
            hasDefault: true,
            notes: 'Database connection component'
          }
        ]
      },

      // P4: Low Priority - Optional and Performance Settings
      {
        priority: 'P4',
        name: 'Optional & Performance Settings',
        description: 'Non-critical configuration and performance tuning',
        riskLevel: 'low',
        secrets: [
          {
            legacyName: 'APP_NAME',
            dopplerName: 'APP_CORE_NAME',
            description: 'Application name identifier',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Application identification'
          },
          {
            legacyName: 'APP_VERSION',
            dopplerName: 'APP_CORE_VERSION',
            description: 'Application version string',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Version tracking'
          },
          {
            legacyName: 'PRETTY_LOGS',
            dopplerName: 'LOGGING_CORE_PRETTY_ENABLED',
            description: 'Enable pretty log formatting',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Development convenience'
          },
          {
            legacyName: 'JWKS_CACHE_MAX_AGE',
            dopplerName: 'AUTH_JWKS_CACHE_MAX_AGE',
            description: 'JWKS cache duration',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Performance optimization'
          },
          {
            legacyName: 'JWKS_REQUESTS_PER_MINUTE',
            dopplerName: 'AUTH_JWKS_REQUESTS_PER_MINUTE',
            description: 'JWKS request rate limit',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Rate limiting configuration'
          },
          {
            legacyName: 'DATABASE_POOL_MIN',
            dopplerName: 'DATABASE_POSTGRES_POOL_MIN',
            description: 'Database connection pool minimum',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Performance tuning'
          },
          {
            legacyName: 'DATABASE_POOL_MAX',
            dopplerName: 'DATABASE_POSTGRES_POOL_MAX',
            description: 'Database connection pool maximum',
            riskLevel: 'low',
            required: false,
            hasDefault: true,
            notes: 'Performance tuning'
          }
        ]
      }
    ];

    const totalSecrets = groups.reduce((sum, group) => sum + group.secrets.length, 0);

    return {
      totalSecrets,
      migratedSecrets: 0,
      remainingSecrets: totalSecrets,
      groups
    };
  }

  /**
   * Load current environment variables from .env files
   */
  async loadCurrentEnvironment(envPath?: string): Promise<Record<string, string>> {
    const envFile = envPath || '.env';
    
    try {
      const envContent = await fs.readFile(envFile, 'utf-8');
      const parsed = dotenv.parse(envContent);
      return parsed;
    } catch (error) {
      // If .env file doesn't exist, use process.env
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
  }

  /**
   * Check which secrets are already present in Doppler
   */
  async checkDopplerSecrets(project: string, config: string): Promise<Record<string, boolean>> {
    try {
      const command = `doppler secrets --project ${project} --config ${config} --format json`;
      const { stdout } = await execAsync(command);
      const secrets = JSON.parse(stdout) as Record<string, unknown>;
      
      const result: Record<string, boolean> = {};
      for (const key of Object.keys(secrets)) {
        result[key] = true;
      }
      return result;
    } catch (error) {
      throw new Error(`Failed to check Doppler secrets: ${error}`);
    }
  }

  /**
   * Migrate a specific priority group to Doppler
   */
  async migratePriorityGroup(
    priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4',
    project: string = 'gs-scaffold-api',
    config: string = 'dev',
    options: {
      dryRun?: boolean;
      overwrite?: boolean;
      skipExisting?: boolean;
    } = {}
  ): Promise<MigrationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
      // Get migration plan and find the priority group
      const plan = this.getMigrationPlan();
      const group = plan.groups.find(g => g.priority === priority);
      
      if (!group) {
        throw new Error(`Priority group ${priority} not found`);
      }

      console.log(`\n🔄 Migrating ${group.name} (${priority})`);
      console.log(`📋 Description: ${group.description}`);
      console.log(`🎯 Risk Level: ${group.riskLevel}`);
      console.log(`📊 Secrets to migrate: ${group.secrets.length}\n`);

      // Load current environment
      const currentEnv = await this.loadCurrentEnvironment();

      // Check existing Doppler secrets if not overwriting
      let existingSecrets: Record<string, boolean> = {};
      if (!options.overwrite) {
        try {
          existingSecrets = await this.checkDopplerSecrets(project, config);
        } catch (error) {
          warnings.push(`Could not check existing Doppler secrets: ${error}`);
        }
      }

      // Process each secret in the group
      for (const secret of group.secrets) {
        console.log(`🔍 Processing: ${secret.legacyName} → ${secret.dopplerName}`);

        // Check if secret exists in current environment
        const currentValue = currentEnv[secret.legacyName];
        
        if (!currentValue) {
          if (secret.required && !secret.hasDefault) {
            errors.push(`Required secret ${secret.legacyName} not found in environment`);
            errorCount++;
            continue;
          } else {
            warnings.push(`Optional secret ${secret.legacyName} not found, skipping`);
            skippedCount++;
            continue;
          }
        }

        // Check if already exists in Doppler
        if (existingSecrets[secret.dopplerName] && options.skipExisting) {
          console.log(`  ℹ️  Already exists in Doppler, skipping`);
          skippedCount++;
          continue;
        }

        // Validate secret value
        if (this.isPlaceholderValue(currentValue)) {
          warnings.push(`${secret.legacyName} appears to be a placeholder value: ${currentValue}`);
          if (secret.riskLevel === 'critical') {
            errors.push(`Critical secret ${secret.legacyName} has placeholder value`);
            errorCount++;
            continue;
          }
        }

        // Perform migration (or dry run)
        if (options.dryRun) {
          console.log(`  🔍 DRY RUN: Would set ${secret.dopplerName} = ${this.maskValue(currentValue)}`);
          migratedCount++;
        } else {
          try {
            await this.setDopplerSecret(project, config, secret.dopplerName, currentValue);
            console.log(`  ✅ Migrated: ${secret.dopplerName}`);
            migratedCount++;
          } catch (error) {
            errors.push(`Failed to migrate ${secret.legacyName}: ${error}`);
            errorCount++;
          }
        }
      }

      // Determine next priority
      const priorityOrder: Array<'P0' | 'P1' | 'P2' | 'P3' | 'P4'> = ['P0', 'P1', 'P2', 'P3', 'P4'];
      const currentIndex = priorityOrder.indexOf(priority);
      const nextPriority = currentIndex < priorityOrder.length - 1 ? priorityOrder[currentIndex + 1] : undefined;

      console.log(`\n📊 Migration Summary for ${priority}:`);
      console.log(`  ✅ Migrated: ${migratedCount}`);
      console.log(`  ⏭️  Skipped: ${skippedCount}`);
      console.log(`  ❌ Errors: ${errorCount}`);
      
      if (warnings.length > 0) {
        console.log(`  ⚠️  Warnings: ${warnings.length}`);
      }

      return {
        success: errorCount === 0,
        migratedCount,
        skippedCount,
        errorCount,
        errors,
        warnings,
        nextPriority,
      };

    } catch (error) {
      errors.push(`Migration failed: ${error}`);
      return {
        success: false,
        migratedCount,
        skippedCount,
        errorCount: errorCount + 1,
        errors,
        warnings,
      };
    }
  }

  /**
   * Set a secret in Doppler
   */
  private async setDopplerSecret(project: string, config: string, name: string, value: string): Promise<void> {
    const command = `doppler secrets set ${name}="${value}" --project ${project} --config ${config}`;
    await execAsync(command);
  }

  /**
   * Check if a value appears to be a placeholder
   */
  private isPlaceholderValue(value: string): boolean {
    const placeholderPatterns = [
      /change.?me/i,
      /example/i,
      /placeholder/i,
      /dev.?secret/i,
      /test.?value/i,
      /your.?secret/i,
      /replace.?this/i,
    ];

    return placeholderPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Mask a value for safe display
   */
  private maskValue(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }
    const start = value.substring(0, 3);
    const end = value.substring(value.length - 3);
    const middle = '*'.repeat(Math.min(value.length - 6, 10));
    return `${start}${middle}${end}`;
  }

  /**
   * Generate a migration status report
   */
  async generateMigrationReport(project: string = 'gs-scaffold-api', config: string = 'dev'): Promise<string> {
    const plan = this.getMigrationPlan();
    const currentEnv = await this.loadCurrentEnvironment();
    
    let existingSecrets: Record<string, boolean> = {};
    try {
      existingSecrets = await this.checkDopplerSecrets(project, config);
    } catch {
      // Ignore errors, report will show as unavailable
    }

    let report = `# 📊 Secret Migration Status Report\n\n`;
    report += `**Project**: ${project}\n`;
    report += `**Config**: ${config}\n`;
    report += `**Generated**: ${new Date().toISOString()}\n\n`;

    for (const group of plan.groups) {
      report += `## ${group.priority}: ${group.name}\n\n`;
      report += `**Description**: ${group.description}\n`;
      report += `**Risk Level**: ${group.riskLevel}\n`;
      report += `**Secrets**: ${group.secrets.length}\n\n`;

      report += `| Secret | Legacy Name | Status | Notes |\n`;
      report += `|--------|-------------|--------|-------|\n`;

      for (const secret of group.secrets) {
        const hasLegacy = !!currentEnv[secret.legacyName];
        const hasDoppler = !!existingSecrets[secret.dopplerName];
        
        let status = '❌ Missing';
        if (hasLegacy && hasDoppler) {
          status = '✅ Migrated';
        } else if (hasLegacy) {
          status = '🔄 Ready';
        } else if (hasDoppler) {
          status = '⚠️ Doppler Only';
        }

        const notes = secret.notes || '';
        report += `| ${secret.dopplerName} | ${secret.legacyName} | ${status} | ${notes} |\n`;
      }

      report += `\n`;
    }

    return report;
  }
}

/**
 * Convenience function for priority group migration
 */
export async function migratePriorityGroup(
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4',
  options: {
    dryRun?: boolean;
    overwrite?: boolean;
    skipExisting?: boolean;
    project?: string;
    config?: string;
  } = {}
): Promise<MigrationResult> {
  const manager = SecretMigrationManager.getInstance();
  return manager.migratePriorityGroup(
    priority,
    options.project || 'gs-scaffold-api',
    options.config || 'dev',
    options
  );
}

/**
 * Generate migration status report
 */
export async function generateMigrationReport(project?: string, config?: string): Promise<string> {
  const manager = SecretMigrationManager.getInstance();
  return manager.generateMigrationReport(project, config);
}
