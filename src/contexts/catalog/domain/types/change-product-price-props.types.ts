/**
 * Domain Types: Change Product Price Props
 *
 * Explicit interface for price change properties to avoid "type soup"
 * This interface ensures type safety and consistency across all layers
 * when dealing with product price modifications.
 *
 * @domain Catalog Context - Product Price Management
 * @purpose Enforce consistent price change structure
 * @layer Domain Types
 */

/**
 * Properties required for changing a product's price
 *
 * This interface is implemented by:
 * - ChangeProductPriceDto (Application Layer)
 * - ChangeProductPriceCommand (Application Layer)
 * - ProductResponseDto (Application Layer - for price display)
 *
 * @interface ChangeProductPriceProps
 */
export interface ChangeProductPriceProps {
  /**
   * New price value for the product
   * Must be a positive number representing the monetary value
   *
   * @type {number}
   * @minimum 0
   * @example 29.99
   */
  price: number;

  /**
   * Currency code for the price
   * Must be a valid ISO 4217 currency code
   *
   * @type {string}
   * @format ISO 4217 (3-letter currency code)
   * @example "USD", "EUR", "GBP"
   */
  currency: string;
}

/**
 * Type guard to check if an object implements ChangeProductPriceProps
 *
 * @param obj - Object to check
 * @returns {boolean} True if object has required properties
 */
export function isChangeProductPriceProps(
  obj: any,
): obj is ChangeProductPriceProps {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ChangeProductPriceProps).price === 'number' &&
    (obj as ChangeProductPriceProps).price >= 0 &&
    typeof (obj as ChangeProductPriceProps).currency === 'string' &&
    (obj as ChangeProductPriceProps).currency.length === 3
  );
}

/**
 * Default currency for price changes when not specified
 * Can be configured per deployment environment
 */
export const DEFAULT_CURRENCY = 'USD';

/**
 * Supported currencies for price changes
 * Extend this list based on business requirements
 */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
] as const;

/**
 * Type representing supported currency codes
 */
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
