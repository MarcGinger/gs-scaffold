/**
 * Domain Entity: Product
 *
 * Represents the core Product entity in the catalog domain.
 * Encapsulates product data, identity, and basic entity behavior.
 *
 * This entity follows DDD principles:
 * - Identity: ProductId as unique identifier
 * - Immutability: Changes create new instances
 * - Encapsulation: Private state with controlled access
 * - Business validation: Domain rules enforced
 *
 * @domain Catalog Context - Product Entity
 * @layer Domain Entities
 */

import { EntityBase } from './entity.base';
import {
  ProductId,
  ProductName,
  Price,
  Sku,
  Category,
  ProductStatus,
} from '../index';
import {
  Result,
  ok,
  err,
  DomainError,
} from '../../../../shared/errors/error.types';
import { ProductErrors } from '../errors/product.errors';

/**
 * Properties required to create a Product entity
 * These represent the essential data that defines a product
 */
export interface ProductEntityProps {
  id: ProductId;
  name: ProductName;
  sku: Sku;
  price: Price;
  category: Category;
  status: ProductStatus;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product Entity
 *
 * Core domain entity representing a product in the catalog.
 * Handles product identity, validation, and state management.
 */
export class ProductEntity extends EntityBase<ProductEntityProps, ProductId> {
  private static clock: { now: () => Date } = { now: () => new Date() };

  public static setClock(c: { now: () => Date }) {
    this.clock = c;
  }

  private constructor(props: ProductEntityProps) {
    super(props, props.id);
  }

  /**
   * Factory method to create a new product entity
   *
   * @param props - Product properties
   * @returns Result containing ProductEntity or DomainError
   */
  public static create(
    props: ProductEntityProps,
  ): Result<ProductEntity, DomainError> {
    // Validate required properties
    const validationResult = ProductEntity.validate(props);
    if (validationResult.ok === false) {
      return err(validationResult.error);
    }

    return ok(new ProductEntity(props));
  }

  /**
   * Factory method to reconstitute a product entity from persistence
   *
   * @param props - Product properties from database
   * @returns ProductEntity instance
   */
  public static reconstitute(props: ProductEntityProps): ProductEntity {
    return new ProductEntity(props);
  }

  /**
   * Validates product entity properties
   *
   * @param props - Properties to validate
   * @returns Validation result
   */
  private static validate(
    props: ProductEntityProps,
  ): Result<void, DomainError> {
    // Basic validation
    if (!props.id) {
      return err(ProductErrors.INVALID_PRODUCT_DATA);
    }

    if (!props.name) {
      return err(ProductErrors.INVALID_PRODUCT_DATA);
    }

    if (!props.sku) {
      return err(ProductErrors.INVALID_PRODUCT_DATA);
    }

    if (!props.price) {
      return err(ProductErrors.INVALID_PRICE);
    }

    if (!props.category) {
      return err(ProductErrors.INVALID_CATEGORY);
    }

    if (!props.status) {
      return err(ProductErrors.INVALID_PRODUCT_DATA);
    }

    if (!props.createdAt || !props.updatedAt) {
      return err(ProductErrors.INVALID_PRODUCT_DATA);
    }

    return ok(undefined);
  }

  // ======================
  // Getters (Public API)
  // ======================

  public get id(): ProductId {
    return this.props.id;
  }

  public get name(): ProductName {
    return this.props.name;
  }

  public get sku(): Sku {
    return this.props.sku;
  }

  public get price(): Price {
    return this.props.price;
  }

  public get category(): Category {
    return this.props.category;
  }

  public get status(): ProductStatus {
    return this.props.status;
  }

  public get description(): string | undefined {
    return this.props.description;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // ======================
  // Business Methods
  // ======================

  /**
   * Updates the product name
   * Creates a new entity instance with updated properties
   *
   * @param newName - New product name
   * @returns Result with updated entity or error
   */
  public updateName(newName: ProductName): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      name: newName,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Updates the product description
   *
   * @param description - New description
   * @returns Result with updated entity or error
   */
  public updateDescription(
    description?: string,
  ): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      description,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Changes the product price
   *
   * @param newPrice - New price
   * @returns Result with updated entity or error
   */
  public changePrice(newPrice: Price): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (newPrice.getValue() <= 0) {
      return err(ProductErrors.INVALID_PRICE);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      price: newPrice,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Changes the product category
   *
   * @param newCategory - New category
   * @returns Result with updated entity or error
   */
  public changeCategory(
    newCategory: Category,
  ): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      category: newCategory,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Activates the product (makes it available)
   *
   * @returns Result with updated entity or error
   */
  public activate(): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.props.status.isActive()) {
      return err(ProductErrors.PRODUCT_ALREADY_ACTIVE);
    }

    const activeStatus = ProductStatus.active();
    if (!this.props.status.canTransitionTo(activeStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      status: activeStatus,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Deactivates the product (makes it unavailable)
   *
   * @returns Result with updated entity or error
   */
  public deactivate(): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.props.status.isInactive()) {
      return err(ProductErrors.PRODUCT_ALREADY_INACTIVE);
    }

    const inactiveStatus = ProductStatus.inactive();
    if (!this.props.status.canTransitionTo(inactiveStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      status: inactiveStatus,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  /**
   * Marks the product as deleted (soft delete)
   *
   * @returns Result with updated entity or error
   */
  public delete(): Result<ProductEntity, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_ALREADY_DELETED);
    }

    const deletedStatus = ProductStatus.deleted();
    if (!this.props.status.canTransitionTo(deletedStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const updatedProps: ProductEntityProps = {
      ...this.props,
      status: deletedStatus,
      updatedAt: ProductEntity.clock.now(),
    };

    return ProductEntity.create(updatedProps);
  }

  // ======================
  // Query Methods
  // ======================

  /**
   * Checks if the product is active
   */
  public isActive(): boolean {
    return this.props.status.isActive();
  }

  /**
   * Checks if the product is inactive
   */
  public isInactive(): boolean {
    return this.props.status.isInactive();
  }

  /**
   * Checks if the product is deleted
   */
  public isDeleted(): boolean {
    return this.props.status.isDeleted();
  }

  /**
   * Checks if the product is in draft state
   */
  public isDraft(): boolean {
    return this.props.status.isDraft();
  }

  /**
   * Checks if two products are the same entity
   *
   * @param other - Other product to compare
   * @returns True if same entity
   */
  public sameAs(other: ProductEntity): boolean {
    return this.props.id.equals(other.props.id);
  }

  /**
   * Gets a snapshot of current entity state for serialization
   *
   * @returns Plain object representation
   */
  public toSnapshot(): ProductEntitySnapshot {
    return {
      id: this.props.id.getValue(),
      name: this.props.name.getValue(),
      sku: this.props.sku.getValue(),
      price: this.props.price.getValue(),
      currency: this.props.price.getCurrency(),
      categoryName: this.props.category.getName(),
      categoryId: this.props.category.getId(),
      status: this.props.status.getValue(),
      description: this.props.description,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}

/**
 * Serializable snapshot of Product entity
 * Used for persistence and data transfer
 */
export interface ProductEntitySnapshot {
  id: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  categoryName: string;
  categoryId: string;
  status: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
