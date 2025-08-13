// src/shared/errors/catalog.ts

import { DomainError } from './error.types';

/**
 * Creates a typed error catalog with namespaced error codes.
 *
 * This helper function takes a set of error definitions and a namespace,
 * then creates a catalog where each error gets a prefixed code.
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
 * @returns Array of validation errors, empty if all valid
 */
export function validateCatalogNaming<
  T extends Record<string, Omit<DomainError, 'code'>>,
>(definitions: T): string[] {
  const errors: string[] = [];
  const upperSnakeCasePattern = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

  Object.keys(definitions).forEach((key) => {
    if (!upperSnakeCasePattern.test(key)) {
      errors.push(
        `Error key "${key}" should be UPPER_SNAKE_CASE (e.g., "USER_NOT_FOUND")`,
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
      if (merged[key]) {
        throw new Error(
          `Duplicate error key "${key}" found when merging catalogs. ` +
            `Existing: ${merged[key].code}, New: ${error.code}`,
        );
      }
      merged[key] = error;
    });
  });

  return merged;
}
