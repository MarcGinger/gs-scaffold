/**
 * Doppler Project Setup and Management
 *
 * Phase 2.1: Doppler Project Setup
 * This module handles the creation and management of Doppler projects,
 * environments, and service tokens for the gs-scaffold application.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DopplerProjectConfig {
  name: string;
  description?: string;
  environments: DopplerEnvironment[];
}

export interface DopplerEnvironment {
  name: string;
  description?: string;
  secrets: Record<string, string>;
}

export interface DopplerServiceToken {
  name: string;
  project: string;
  config: string;
  access: 'read' | 'read/write';
  expireAt?: Date;
}

/**
 * Doppler Project Manager
 * Handles project setup, environment creation, and token management
 */
export class DopplerProjectManager {
  private static instance: DopplerProjectManager;

  static getInstance(): DopplerProjectManager {
    if (!DopplerProjectManager.instance) {
      DopplerProjectManager.instance = new DopplerProjectManager();
    }
    return DopplerProjectManager.instance;
  }

  /**
   * Check if user is authenticated with Doppler
   */
  async checkAuthentication(): Promise<{
    authenticated: boolean;
    user?: string;
  }> {
    try {
      const { stdout } = await execAsync('doppler me');
      const result = JSON.parse(stdout);
      return {
        authenticated: true,
        user: result.email || result.name,
      };
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Authenticate with Doppler (opens browser)
   */
  async authenticate(): Promise<boolean> {
    try {
      await execAsync('doppler login');
      const auth = await this.checkAuthentication();
      return auth.authenticated;
    } catch {
      return false;
    }
  }

  /**
   * List available projects
   */
  async listProjects(): Promise<Array<{ name: string; description?: string }>> {
    try {
      const { stdout } = await execAsync('doppler projects --json');
      const projects = JSON.parse(stdout);
      return projects.map((p: any) => ({
        name: p.name,
        description: p.description,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Create a new Doppler project
   */
  async createProject(config: DopplerProjectConfig): Promise<boolean> {
    try {
      const description = config.description
        ? `--description "${config.description}"`
        : '';
      await execAsync(`doppler projects create ${config.name} ${description}`);

      // Create environments for the project
      for (const env of config.environments) {
        await this.createEnvironment(config.name, env);
      }

      return true;
    } catch (error) {
      console.error('Failed to create Doppler project:', error);
      return false;
    }
  }

  /**
   * Create an environment within a project
   */
  async createEnvironment(
    project: string,
    env: DopplerEnvironment,
  ): Promise<boolean> {
    try {
      const command = `doppler configs create ${env.name} --project ${project}`;
      await execAsync(command);

      // Add secrets to the environment
      for (const [key, value] of Object.entries(env.secrets)) {
        await this.setSecret(project, env.name, key, value);
      }

      return true;
    } catch (error) {
      console.error(`Failed to create environment ${env.name}:`, error);
      return false;
    }
  }

  /**
   * Set a secret in a specific project/config
   */
  async setSecret(
    project: string,
    config: string,
    name: string,
    value: string,
  ): Promise<boolean> {
    try {
      const command = `doppler secrets set ${name}="${value}" --project ${project} --config ${config}`;
      await execAsync(command);
      return true;
    } catch (error) {
      console.error(`Failed to set secret ${name}:`, error);
      return false;
    }
  }

  /**
   * Create a service token for a project/config
   */
  async createServiceToken(
    tokenConfig: DopplerServiceToken,
  ): Promise<string | null> {
    try {
      const command = `doppler service-tokens create ${tokenConfig.name} --project ${tokenConfig.project} --config ${tokenConfig.config} --access ${tokenConfig.access} --plain`;
      const { stdout } = await execAsync(command);
      return stdout.trim();
    } catch (error) {
      console.error('Failed to create service token:', error);
      return null;
    }
  }

  /**
   * Setup the gs-scaffold project with recommended structure
   */
  async setupGsScaffoldProject(): Promise<{
    success: boolean;
    project?: string;
    environments?: string[];
    tokens?: Record<string, string>;
    errors?: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check authentication
      const auth = await this.checkAuthentication();
      if (!auth.authenticated) {
        return {
          success: false,
          errors: ['Not authenticated with Doppler. Run: doppler login'],
        };
      }

      // Define project configuration
      const projectConfig: DopplerProjectConfig = {
        name: 'gs-scaffold-api',
        description: 'GS Scaffold API Configuration and Secrets',
        environments: [
          {
            name: 'dev',
            description: 'Development environment',
            secrets: this.getDefaultDevSecrets(),
          },
          {
            name: 'staging',
            description: 'Staging environment',
            secrets: this.getDefaultStagingSecrets(),
          },
          {
            name: 'prod',
            description: 'Production environment',
            secrets: this.getDefaultProdSecrets(),
          },
        ],
      };

      // Check if project already exists
      const existingProjects = await this.listProjects();
      const projectExists = existingProjects.some(
        (p) => p.name === projectConfig.name,
      );

      if (!projectExists) {
        console.log('Creating Doppler project: gs-scaffold-api...');
        const created = await this.createProject(projectConfig);
        if (!created) {
          errors.push('Failed to create Doppler project');
        }
      } else {
        console.log('Project gs-scaffold-api already exists');
      }

      // Create service tokens
      const tokens: Record<string, string> = {};

      const devToken = await this.createServiceToken({
        name: 'gs-scaffold-dev-token',
        project: 'gs-scaffold-api',
        config: 'dev',
        access: 'read',
      });

      if (devToken) {
        tokens.dev = devToken;
      }

      return {
        success: errors.length === 0,
        project: projectConfig.name,
        environments: projectConfig.environments.map((e) => e.name),
        tokens,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      errors.push(`Setup failed: ${error}`);
      return {
        success: false,
        errors,
      };
    }
  }

  /**
   * Get default development secrets based on our current .env files
   */
  private getDefaultDevSecrets(): Record<string, string> {
    return {
      // Core Application
      APP_CORE_NAME: 'gs-scaffold',
      APP_CORE_VERSION: '0.0.1',
      APP_RUNTIME_ENVIRONMENT: 'development',
      APP_SERVER_PORT: '3000',
      APP_SERVER_PROTOCOL: 'http',
      APP_SERVER_HOST: 'localhost',

      // Database
      DATABASE_POSTGRES_HOST: 'localhost',
      DATABASE_POSTGRES_PORT: '5432',
      DATABASE_POSTGRES_NAME: 'postgres',
      DATABASE_POSTGRES_USER: 'postgres',
      DATABASE_POSTGRES_PASSWORD: 'dev-password-change-me',

      // Cache/Redis
      CACHE_REDIS_URL: 'redis://localhost:6379',

      // EventStore
      EVENTSTORE_ESDB_CONNECTION_STRING: 'esdb://localhost:2113?tls=false',

      // Authentication
      AUTH_KEYCLOAK_URL: 'http://localhost:8080',
      AUTH_KEYCLOAK_REALM: 'gs-scaffold',
      AUTH_KEYCLOAK_CLIENT_ID: 'gs-scaffold-api',
      AUTH_KEYCLOAK_CLIENT_SECRET: 'dev-client-secret-change-me',
      AUTH_JWT_AUDIENCE: 'gs-scaffold-api',

      // Security
      SECURITY_PII_ENCRYPTION_KEY: 'dev-encryption-key-32-chars-change-in-prod',
      SECURITY_OPA_URL: 'http://localhost:8181',

      // Logging
      LOGGING_CORE_LEVEL: 'debug',
      LOGGING_CORE_SINK: 'console',
      LOGGING_CORE_PRETTY_ENABLED: 'true',
    };
  }

  /**
   * Get default staging secrets (placeholders)
   */
  private getDefaultStagingSecrets(): Record<string, string> {
    return {
      APP_RUNTIME_ENVIRONMENT: 'staging',
      APP_SERVER_PROTOCOL: 'https',
      LOGGING_CORE_LEVEL: 'info',
      LOGGING_CORE_PRETTY_ENABLED: 'false',
      // Other secrets should be set manually in Doppler for staging
    };
  }

  /**
   * Get default production secrets (placeholders only)
   */
  private getDefaultProdSecrets(): Record<string, string> {
    return {
      APP_RUNTIME_ENVIRONMENT: 'production',
      APP_SERVER_PROTOCOL: 'https',
      LOGGING_CORE_LEVEL: 'info',
      LOGGING_CORE_PRETTY_ENABLED: 'false',
      LOGGING_CORE_SINK: 'stdout',
      // All other secrets must be set manually for production
    };
  }
}

/**
 * Convenience function to setup the gs-scaffold project
 */
export async function setupDopplerProject(): Promise<{
  success: boolean;
  project?: string;
  environments?: string[];
  tokens?: Record<string, string>;
  errors?: string[];
}> {
  const manager = DopplerProjectManager.getInstance();
  return manager.setupGsScaffoldProject();
}
