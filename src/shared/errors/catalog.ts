import { DomainError } from './error.types';
import { AppConfigUtil } from '../config/app-config.util';

/**
 * Creates a typed error catalog with namespaced error codes.
 *
 * This helper function takes a set of error definitions and a namespace,
 * then creates a catalog where each error gets a prefixed code.
 *
 * In development environments, this will automatically validate naming
 * conventions and log warnings for any violations.
 *
 * @param definitions Object containing error definitions without codes
 * @param namespace Prefix for all error codes (e.g., 'USER', 'ORDER')
 * @returns Typed catalog with namespaced error codes
 *
 * @example
 * ```typescript
 * const UserErrors = makeCatalog({
 *   USER_NOT_FOUND: {
 *     title: 'User not found',
 *     category: 'domain',
 *   },
 *   INVALID_EMAIL: {
 *     title: 'Invalid email format',
 *     category: 'validation',
 *   }
 * }, 'USER');
 *
 * // Results in:
 * // UserErrors.USER_NOT_FOUND.code === 'USER.USER_NOT_FOUND'
 * // UserErrors.INVALID_EMAIL.code === 'USER.INVALID_EMAIL'
 * ```
 */
export function makeCatalog<
  T extends Record<string, Omit<DomainError, 'code'>>,
>(definitions: T, namespace: string) {
  // Auto-validate in development environments
  if (!AppConfigUtil.isProduction()) {
    const validationErrors = validateCatalogNaming(definitions);
    if (validationErrors.length > 0) {
      console.warn(
        `[Error Catalog Warning] Namespace "${namespace}" has naming violations:\n` +
          validationErrors.map((err) => `  - ${err}`).join('\n'),
      );
    }
  }

  return Object.fromEntries(
    Object.entries(definitions).map(([key, errorDef]) => {
      const code = `${namespace}.${key}` as const;
      return [key, { ...errorDef, code }];
    }),
  ) as {
    [K in keyof T]: DomainError<`${typeof namespace}.${Extract<K, string>}`>;
  };
}

/**
 * Type helper to extract error codes from a catalog.
 * Useful for creating union types of valid error codes.
 *
 * @example
 * ```typescript
 * const UserErrors = makeCatalog({ ... }, 'USER');
 * type UserErrorCode = CatalogErrorCode<typeof UserErrors>;
 * // Results in: 'USER.USER_NOT_FOUND' | 'USER.INVALID_EMAIL' | ...
 * ```
 */
export type CatalogErrorCode<T extends Record<string, DomainError>> =
  T[keyof T]['code'];

/**
 * Type helper to extract all errors from a catalog.
 * Useful for creating union types of all possible errors.
 *
 * @example
 * ```typescript
 * const UserErrors = makeCatalog({ ... }, 'USER');
 * type UserError = CatalogError<typeof UserErrors>;
 * ```
 */
export type CatalogError<T extends Record<string, DomainError>> = T[keyof T];

/**
 * Validates that all errors in a catalog follow naming conventions.
 * Checks that error keys are UPPER_SNAKE_CASE.
 *
 * @param definitions Error definitions to validate
 * @returns Array of validation errors with detailed feedback, empty if all valid
 */
export function validateCatalogNaming<
  T extends Record<string, Omit<DomainError, 'code'>>,
>(definitions: T): string[] {
  const errors: string[] = [];
  const upperSnakeCasePattern = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

  Object.keys(definitions).forEach((key) => {
    if (!upperSnakeCasePattern.test(key)) {
      // Convert the key to suggested UPPER_SNAKE_CASE format
      const suggested = key
        .replace(/([a-z])([A-Z])/g, '$1_$2') // Handle camelCase: camelCase -> camel_Case
        .replace(/[^A-Za-z0-9_]/g, '_') // Replace invalid chars with underscore
        .replace(/_+/g, '_') // Collapse multiple underscores
        .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
        .toUpperCase();

      errors.push(
        `Error key "${key}" should be UPPER_SNAKE_CASE. ` +
          `Suggestion: "${suggested}". ` +
          `Pattern: ${upperSnakeCasePattern.toString()}`,
      );
    }
  });

  return errors;
}

/**
 * Creates a validated catalog that throws if naming conventions aren't followed.
 * Use this in development to catch naming issues early.
 *
 * @param definitions Error definitions
 * @param namespace Namespace for error codes
 * @returns Validated error catalog
 * @throws Error if naming conventions are violated
 */
export function makeValidatedCatalog<
  T extends Record<string, Omit<DomainError, 'code'>>,
>(definitions: T, namespace: string) {
  const validationErrors = validateCatalogNaming(definitions);

  if (validationErrors.length > 0) {
    throw new Error(
      `Catalog validation failed for namespace "${namespace}":\n` +
        validationErrors.map((err) => `  - ${err}`).join('\n'),
    );
  }

  return makeCatalog(definitions, namespace);
}

/**
 * Merges multiple error catalogs into a single catalog.
 * Useful when you need to combine errors from different domains.
 *
 * Performs comprehensive collision detection:
 * - Checks for duplicate catalog keys
 * - Checks for duplicate error codes across different catalogs
 *
 * @param catalogs Multiple error catalogs to merge
 * @returns Combined catalog with all errors
 *
 * @example
 * ```typescript
 * const AllErrors = mergeCatalogs(UserErrors, OrderErrors, PaymentErrors);
 * ```
 */
export function mergeCatalogs<
  T extends Record<string, Record<string, DomainError>>,
>(...catalogs: T[keyof T][]): Record<string, DomainError> {
  const merged: Record<string, DomainError> = {};

  catalogs.forEach((catalog) => {
    Object.entries(catalog).forEach(([key, error]) => {
      // Check for duplicate catalog keys
      if (merged[key]) {
        throw new Error(
          `Duplicate catalog key "${key}" found when merging catalogs. ` +
            `Existing: ${merged[key].code}, New: ${error.code}`,
        );
      }

      // Check for duplicate error codes (same code from different catalogs)
      const existingErrorWithSameCode = Object.values(merged).find(
        (existingError) => existingError.code === error.code,
      );

      if (existingErrorWithSameCode) {
        throw new Error(
          `Duplicate error code "${error.code}" found when merging catalogs. ` +
            `This error code already exists in the merged catalog.`,
        );
      }

      merged[key] = error;
    });
  });

  return merged;
}
