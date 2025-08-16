import { AggregateRootBase } from '../../../shared/domain/aggregates/aggregate-root.base';
import { DomainEvent } from '../../../shared/domain/events/events';
import { ProductId } from './value-objects/product-id.vo';
import { ProductName } from './value-objects/product-name.vo';
import { Price } from './value-objects/price.vo';
import { Sku } from './value-objects/sku.vo';
import { Category } from './value-objects/category.vo';
import { ProductStatus } from './value-objects/product-status.vo';
import { ProductErrors } from './errors/product.errors';
import {
  Result,
  ok,
  err,
  DomainError,
  unsafeUnwrap,
} from '../../../shared/errors/error.types';
import {
  ProductCreatedDomainEvent,
  ProductUpdatedDomainEvent,
  ProductPriceChangedDomainEvent,
  ProductCategorizedDomainEvent,
  ProductActivatedDomainEvent,
  ProductDeactivatedDomainEvent,
  ProductDeletedDomainEvent,
} from './events/catalog-domain.events';
import { EventMetadata } from './events/product.events';

export interface ProductProps {
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

export class ProductAggregate extends AggregateRootBase {
  private props: ProductProps;

  private constructor(props: ProductProps) {
    super();
    this.props = props;
  }

  // Factory method for creating new products
  public static create(
    id: ProductId,
    name: ProductName,
    sku: Sku,
    price: Price,
    category: Category,
    metadata: EventMetadata,
    description?: string,
  ): Result<ProductAggregate, DomainError> {
    // Domain validation
    if (price.getValue() < 0) {
      return err(ProductErrors.INVALID_PRICE);
    }

    const product = new ProductAggregate({
      id,
      name,
      sku,
      price,
      category,
      status: ProductStatus.draft(),
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Apply creation event
    const event = new ProductCreatedDomainEvent(id.getValue(), 1, metadata, {
      name: name.getValue(),
      sku: sku.getValue(),
      price: price.getValue(),
      currency: price.getCurrency(),
      categoryId: category.getId(),
      categoryName: category.getName(),
      status: 'DRAFT',
      description,
    });

    product.apply(event);
    return ok(product);
  }

  // Business methods
  public updateDetails(
    name: ProductName,
    description: string | undefined,
    metadata: EventMetadata,
  ): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    const oldName = this.props.name;
    const oldDescription = this.props.description;

    const event = new ProductUpdatedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
      {
        changes: {
          ...(name.getValue() !== oldName.getValue() && {
            name: { old: oldName.getValue(), new: name.getValue() },
          }),
          ...(description !== oldDescription && {
            description: { old: oldDescription, new: description },
          }),
        },
      },
    );

    this.apply(event);
    return ok(undefined);
  }

  public changePrice(
    newPrice: Price,
    metadata: EventMetadata,
  ): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (newPrice.getValue() < 0) {
      return err(ProductErrors.INVALID_PRICE);
    }

    const oldPrice = this.props.price;

    const event = new ProductPriceChangedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
      {
        oldPrice: oldPrice.getValue(),
        newPrice: newPrice.getValue(),
        currency: newPrice.getCurrency(),
      },
    );

    this.apply(event);
    return ok(undefined);
  }

  public categorize(
    category: Category,
    metadata: EventMetadata,
  ): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    const oldCategory = this.props.category;

    const event = new ProductCategorizedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
      {
        oldCategoryId: oldCategory.getId(),
        newCategoryId: category.getId(),
        newCategoryName: category.getName(),
      },
    );

    this.apply(event);
    return ok(undefined);
  }

  public activate(metadata: EventMetadata): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.props.status.isActive()) {
      return err(ProductErrors.PRODUCT_ALREADY_ACTIVE);
    }

    const event = new ProductActivatedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
    );

    this.apply(event);
    return ok(undefined);
  }

  public deactivate(metadata: EventMetadata): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.props.status.isInactive()) {
      return err(ProductErrors.PRODUCT_ALREADY_INACTIVE);
    }

    const event = new ProductDeactivatedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
    );

    this.apply(event);
    return ok(undefined);
  }

  public delete(metadata: EventMetadata): Result<void, DomainError> {
    if (this.props.status.isDeleted()) {
      return err(ProductErrors.PRODUCT_ALREADY_DELETED);
    }

    const event = new ProductDeletedDomainEvent(
      this.props.id.getValue(),
      this.version + 1,
      metadata,
    );

    this.apply(event);
    return ok(undefined);
  }

  // Event handling (when method from base class)
  protected when(event: DomainEvent): void {
    switch (event.type) {
      case 'ProductCreated':
        this.onProductCreated(event as ProductCreatedDomainEvent);
        break;
      case 'ProductUpdated':
        this.onProductUpdated(event as ProductUpdatedDomainEvent);
        break;
      case 'ProductPriceChanged':
        this.onProductPriceChanged(event as ProductPriceChangedDomainEvent);
        break;
      case 'ProductCategorized':
        this.onProductCategorized(event as ProductCategorizedDomainEvent);
        break;
      case 'ProductActivated':
        this.onProductActivated(event as ProductActivatedDomainEvent);
        break;
      case 'ProductDeactivated':
        this.onProductDeactivated(event as ProductDeactivatedDomainEvent);
        break;
      case 'ProductDeleted':
        this.onProductDeleted(event as ProductDeletedDomainEvent);
        break;
    }
  }

  private onProductCreated(event: ProductCreatedDomainEvent): void {
    // State is already set in constructor for create command
    this.props.updatedAt = event.occurredAt;
  }

  private onProductUpdated(event: ProductUpdatedDomainEvent): void {
    if (event.payload.changes.name) {
      this.props.name = ProductName.create(
        event.payload.changes.name.new,
      ).unwrap();
    }
    if (event.payload.changes.description !== undefined) {
      this.props.description = event.payload.changes.description.new;
    }
    this.props.updatedAt = event.occurredAt;
  }

  private onProductPriceChanged(event: ProductPriceChangedDomainEvent): void {
    this.props.price = Price.create(
      event.payload.newPrice,
      event.payload.currency,
    ).unwrap();
    this.props.updatedAt = event.occurredAt;
  }

  private onProductCategorized(event: ProductCategorizedDomainEvent): void {
    this.props.category = Category.create(
      event.payload.newCategoryId,
      event.payload.newCategoryName,
    ).unwrap();
    this.props.updatedAt = event.occurredAt;
  }

  private onProductActivated(event: ProductActivatedDomainEvent): void {
    this.props.status = ProductStatus.active();
    this.props.updatedAt = event.occurredAt;
  }

  private onProductDeactivated(event: ProductDeactivatedDomainEvent): void {
    this.props.status = ProductStatus.inactive();
    this.props.updatedAt = event.occurredAt;
  }

  private onProductDeleted(event: ProductDeletedDomainEvent): void {
    this.props.status = ProductStatus.deleted();
    this.props.updatedAt = event.occurredAt;
  }

  // Snapshot methods (required by base class)
  protected applySnapshot(snapshot: any): void {
    this.props = {
      id: ProductId.create(snapshot.id).unwrap(),
      name: ProductName.create(snapshot.name).unwrap(),
      sku: Sku.create(snapshot.sku).unwrap(),
      price: Price.create(snapshot.price, snapshot.currency).unwrap(),
      category: Category.create(
        snapshot.categoryId,
        snapshot.categoryName,
      ).unwrap(),
      status: ProductStatus.fromString(snapshot.status),
      description: snapshot.description,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };
  }

  public createSnapshot(): any {
    return {
      id: this.props.id.getValue(),
      name: this.props.name.getValue(),
      sku: this.props.sku.getValue(),
      price: this.props.price.getValue(),
      currency: this.props.price.getCurrency(),
      categoryId: this.props.category.getId(),
      categoryName: this.props.category.getName(),
      status: this.props.status.getValue(),
      description: this.props.description,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }

  // Getters
  get id(): ProductId {
    return this.props.id;
  }

  get name(): ProductName {
    return this.props.name;
  }

  get sku(): Sku {
    return this.props.sku;
  }

  get price(): Price {
    return this.props.price;
  }

  get category(): Category {
    return this.props.category;
  }

  get status(): ProductStatus {
    return this.props.status;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
