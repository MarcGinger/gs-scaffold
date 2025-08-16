import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ILogger } from 'src/shared/logger';
import { IEventStoreMeta } from '../event-store.model';

/**
 * Represents a linked stream entity with strong typing for event stream operations.
 * Following DDD principles with explicit value objects and type safety.
 */
export interface ILinkStore {
  /** Unique identifier for the linked stream */
  readonly id?: string;
  /** Business code identifier for the stream */
  readonly code?: string;
  /** Store name for EventStore operations */
  readonly streamName?: string;
  /** Version for optimistic concurrency control */
  readonly version?: number;
  /** Timestamp when the link was created */
  readonly createdAt?: string;
  /** Timestamp when the link was last updated */
  readonly updatedAt?: string;
  /** Tenant context for multi-tenant operations */
  readonly tenantId?: string;
  /** Store status for lifecycle management */
  readonly status?: 'active' | 'inactive' | 'archived';
  /** Additional metadata with known structure */
  readonly metadata?: {
    readonly tags?: readonly string[];
    readonly category?: string;
    readonly priority?: 'low' | 'medium' | 'high';
    readonly [key: string]: unknown;
  };
}

/**
 * Link stream projection service responsible for maintaining
 * an in-memory projection of linked stream entities.
 *
 * This service handles the projection concerns separate from
 * the core event stream operations.
 */
@Injectable()
export class LinkStoreProjection {
  private readonly linkStore: Record<string, Record<string, ILinkStore>> = {};

  constructor(@Inject('ILogger') private readonly logger: ILogger) {}

  /**
   * Handle link events for the internal link store projection
   */
  handleLinkEvent(evt: ILinkStore, meta: IEventStoreMeta): void {
    try {
      // Ensure tenant store exists
      if (!this.linkStore[meta.tenant]) {
        this.linkStore[meta.tenant] = {};
      }

      // Update the projection state
      this.linkStore[meta.tenant][meta.key] = evt;

      this.logger.debug(
        {
          tenant: meta.tenant,
          key: meta.key,
          eventType: meta.type,
          linkId: evt.id,
          streamName: evt.streamName,
        },
        'Updated link stream projection with new event',
      );
    } catch (error) {
      this.logger.error(
        {
          evt,
          meta,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to handle link event in projection',
      );
    }
  }

  /**
   * Get a specific link stream by tenant and key
   */
  getLinkStore(tenant: string, key: string): ILinkStore | null {
    try {
      const tenantStore = this.linkStore[tenant];
      if (!tenantStore) {
        this.logger.debug(
          { tenant, key },
          'No tenant store found for link stream lookup',
        );
        return null;
      }

      const linkStore = tenantStore[key];
      if (!linkStore) {
        this.logger.debug({ tenant, key }, 'No link stream found for key');
        return null;
      }

      return linkStore;
    } catch (error) {
      this.logger.error(
        {
          tenant,
          key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get link stream from projection',
      );
      return null;
    }
  }

  /**
   * Get all link streams for a tenant
   */
  getLinkStoresForTenant(tenant: string): ILinkStore[] {
    try {
      const tenantStore = this.linkStore[tenant];
      if (!tenantStore) {
        this.logger.debug(
          { tenant },
          'No tenant store found for link streams lookup',
        );
        return [];
      }

      return Object.values(tenantStore);
    } catch (error) {
      this.logger.error(
        {
          tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get link streams for tenant from projection',
      );
      return [];
    }
  }

  /**
   * Get all link streams across all tenants
   */
  getAllLinkStores(): Record<string, ILinkStore[]> {
    try {
      const result: Record<string, ILinkStore[]> = {};

      for (const [tenant, tenantStore] of Object.entries(this.linkStore)) {
        result[tenant] = Object.values(tenantStore);
      }

      return result;
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get all link streams from projection',
      );
      return {};
    }
  }

  /**
   * Remove a link stream from the projection
   */
  removeLinkStore(tenant: string, key: string): boolean {
    try {
      const tenantStore = this.linkStore[tenant];
      if (!tenantStore || !tenantStore[key]) {
        this.logger.debug({ tenant, key }, 'Link stream not found for removal');
        return false;
      }

      delete tenantStore[key];

      this.logger.debug({ tenant, key }, 'Removed link stream from projection');

      return true;
    } catch (error) {
      this.logger.error(
        {
          tenant,
          key,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to remove link stream from projection',
      );
      return false;
    }
  }

  /**
   * Clear all link streams for a tenant
   */
  clearTenantLinkStores(tenant: string): void {
    try {
      if (this.linkStore[tenant]) {
        delete this.linkStore[tenant];
        this.logger.debug({ tenant }, 'Cleared all link streams for tenant');
      }
    } catch (error) {
      this.logger.error(
        {
          tenant,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to clear tenant link streams',
      );
    }
  }

  /**
   * Get projection statistics
   */
  getProjectionStats(): {
    totalTenants: number;
    totalLinkStores: number;
    tenantCounts: Record<string, number>;
  } {
    try {
      const tenantCounts: Record<string, number> = {};
      let totalLinkStores = 0;

      for (const [tenant, tenantStore] of Object.entries(this.linkStore)) {
        const count = Object.keys(tenantStore).length;
        tenantCounts[tenant] = count;
        totalLinkStores += count;
      }

      return {
        totalTenants: Object.keys(this.linkStore).length,
        totalLinkStores,
        tenantCounts,
      };
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get projection statistics',
      );
      return {
        totalTenants: 0,
        totalLinkStores: 0,
        tenantCounts: {},
      };
    }
  }
}
