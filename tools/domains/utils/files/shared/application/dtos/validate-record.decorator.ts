import { BadRequestException } from '@nestjs/common';
import { validateSync, ValidationError } from 'class-validator';

/**
 * Helper to recursively extract string messages from ValidationErrors
 */
function flattenValidationErrors(
  errors: ValidationError[],
  prefix = '',
): string[] {
  return errors.flatMap((error) => {
    const propertyPath = prefix
      ? `${prefix}.${error.property}`
      : error.property;
    const constraints = error.constraints
      ? Object.values(error.constraints).map((msg) => `${propertyPath}: ${msg}`)
      : [];

    const children = error.children?.length
      ? flattenValidationErrors(error.children, propertyPath)
      : [];

    return [...constraints, ...children];
  });
}

/**
 * Transforms and validates a Record<string, T> object.
 * Throws BadRequestException with ValidationError[] if validation fails.
 *
 * @param value The raw value to transform and validate
 * @param modelClass The DTO class constructor (e.g., AttributeruleCreateRequest)
 * @returns A fully validated Record<string, T>
 */
export function transformAndValidateRecord<T extends object>(
  value: any,
  modelClass: new () => T,
): Record<string, T> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;

  const allMessages: string[] = [];

  const result = Object.entries(value)
    .filter(([_, v]) => v !== null && v !== undefined && typeof v === 'object')
    .reduce(
      (acc, [key, rawVal]) => {
        const instance = Object.assign(new modelClass(), rawVal);
        const errors = validateSync(instance, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });

        if (errors.length > 0) {
          allMessages.push(...flattenValidationErrors(errors, key));
        }

        acc[key] = instance;
        return acc;
      },
      {} as Record<string, T>,
    );

  if (allMessages.length > 0) {
    throw new BadRequestException(allMessages);
  }

  return result;
}
