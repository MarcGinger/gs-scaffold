// src/contexts/_shared/errors/catalog.ts

/**
 * Re-export the catalog builder for context-specific error catalogs.
 * This provides a consistent import path for all domain contexts.
 */

export {
  makeCatalog,
  makeValidatedCatalog,
} from '../../../shared/errors/catalog';
