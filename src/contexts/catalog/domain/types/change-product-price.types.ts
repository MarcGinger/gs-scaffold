/**
 * Interface representing price-related properties
 * Used to ensure consistency between DTOs, commands, and domain objects
 */
export interface ChangeProductPrice {
  price: number;
  currency: string;
}
