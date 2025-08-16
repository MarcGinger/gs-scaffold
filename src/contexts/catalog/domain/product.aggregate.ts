import { AggregateRootBase } from '../../../shared/domain/aggregates/aggregate-root.base';
import { DomainEvent } from '../../../shared/domain/events/events';
import {
  ProductId,
  ProductName,
  Price,
  Sku,
  Category,
  ProductStatus,
  ProductErrors,
  ProductEntity,
  ProductEntityProps,
  ProductEntitySnapshot,
} from './index';
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

/**
 * Product Aggregate
 *
 * Handles complex business rules, event sourcing, and cross-entity operations.
 * Uses ProductEntity for state management while focusing on domain events
 * and aggregate-level business logic.
 */
export class ProductAggregate extends AggregateRootBase {
  private entity: ProductEntity;

  private constructor(entity: ProductEntity) {
    super();
    this.entity = entity;
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

    // Create the entity
    const entityProps: ProductEntityProps = {
      id,
      name,
      sku,
      price,
      category,
      status: ProductStatus.draft(),
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const entityResult = ProductEntity.create(entityProps);
    if (entityResult.ok === false) {
      return err(entityResult.error);
    }

    const product = new ProductAggregate(entityResult.value);

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

  // Factory method for reconstituting from persistence
  public static reconstitute(entity: ProductEntity): ProductAggregate {
    return new ProductAggregate(entity);
  }

  // Business methods - validate then apply events (no pre-mutation)
  public updateDetails(
    name: ProductName,
    description: string | undefined,
    metadata: EventMetadata,
  ): Result<void, DomainError> {
    // Precondition checks using entity
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    // No-op guard: check if anything actually changed
    const nameChanged = !name.equals(this.entity.name);
    const descriptionChanged = description !== this.entity.description;

    if (!nameChanged && !descriptionChanged) {
      return err(ProductErrors.PRODUCT_NOT_MODIFIED);
    }

    // Prepare event data (capture old values before applying)
    const oldName = this.entity.name;
    const oldDescription = this.entity.description;

    const event = new ProductUpdatedDomainEvent(
      this.entity.id.getValue(),
      this.version + 1,
      metadata,
      {
        changes: {
          ...(nameChanged && {
            name: { old: oldName.getValue(), new: name.getValue() },
          }),
          ...(descriptionChanged && {
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
    // Precondition checks using entity (no pre-mutation)
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (newPrice.getValue() <= 0) {
      return err(ProductErrors.INVALID_PRICE);
    }

    // No-op guard: check if price actually changed
    if (newPrice.equals && newPrice.equals(this.entity.price)) {
      return err(ProductErrors.PRICE_UNCHANGED);
    }

    // Prepare event data (capture old values before applying)
    const oldPrice = this.entity.price;

    const event = new ProductPriceChangedDomainEvent(
      this.entity.id.getValue(),
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
    // Precondition checks using entity (no pre-mutation)
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    // No-op guard: check if category actually changed
    if (category.getId() === this.entity.category.getId()) {
      return err(ProductErrors.CATEGORY_UNCHANGED);
    }

    // Prepare event data (capture old values before applying)
    const oldCategory = this.entity.category;

    const event = new ProductCategorizedDomainEvent(
      this.entity.id.getValue(),
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
    // Precondition checks using entity (no pre-mutation)
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.entity.isActive()) {
      return err(ProductErrors.PRODUCT_ALREADY_ACTIVE);
    }

    // Check if transition is allowed
    const activeStatus = ProductStatus.active();
    if (!this.entity.status.canTransitionTo(activeStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const event = new ProductActivatedDomainEvent(
      this.entity.id.getValue(),
      this.version + 1,
      metadata,
    );

    this.apply(event);
    return ok(undefined);
  }

  public deactivate(metadata: EventMetadata): Result<void, DomainError> {
    // Precondition checks using entity (no pre-mutation)
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_DELETED);
    }

    if (this.entity.isInactive()) {
      return err(ProductErrors.PRODUCT_ALREADY_INACTIVE);
    }

    // Check if transition is allowed
    const inactiveStatus = ProductStatus.inactive();
    if (!this.entity.status.canTransitionTo(inactiveStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const event = new ProductDeactivatedDomainEvent(
      this.entity.id.getValue(),
      this.version + 1,
      metadata,
    );

    this.apply(event);
    return ok(undefined);
  }

  public delete(metadata: EventMetadata): Result<void, DomainError> {
    // Precondition checks using entity (no pre-mutation)
    if (this.entity.isDeleted()) {
      return err(ProductErrors.PRODUCT_ALREADY_DELETED);
    }

    // Check if transition is allowed
    const deletedStatus = ProductStatus.deleted();
    if (!this.entity.status.canTransitionTo(deletedStatus)) {
      return err(ProductErrors.INVALID_STATUS_TRANSITION);
    }

    const event = new ProductDeletedDomainEvent(
      this.entity.id.getValue(),
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
    // Build entity from event payload for proper event replay
    const id = unsafeUnwrap(ProductId.create(event.aggregateId));
    const name = unsafeUnwrap(ProductName.create(event.payload.name));
    const sku = unsafeUnwrap(Sku.create(event.payload.sku));
    const price = unsafeUnwrap(
      Price.create(event.payload.price, event.payload.currency),
    );
    const category = unsafeUnwrap(
      Category.create(event.payload.categoryId, event.payload.categoryName),
    );
    const status = ProductStatus.fromString(event.payload.status);
    const now = new Date(event.occurredAt);

    const props: ProductEntityProps = {
      id,
      name,
      sku,
      price,
      category,
      status,
      description: event.payload.description,
      createdAt: now,
      updatedAt: now,
    };

    this.entity = unsafeUnwrap(ProductEntity.create(props));
  }

  private onProductUpdated(event: ProductUpdatedDomainEvent): void {
    // Apply changes to the entity
    let updatedEntity = this.entity;

    if (event.payload.changes.name) {
      const nameResult = updatedEntity.updateName(
        unsafeUnwrap(ProductName.create(event.payload.changes.name.new)),
      );
      if (nameResult.ok) {
        updatedEntity = nameResult.value;
      }
    }

    if (event.payload.changes.description !== undefined) {
      const descResult = updatedEntity.updateDescription(
        event.payload.changes.description.new,
      );
      if (descResult.ok) {
        updatedEntity = descResult.value;
      }
    }

    this.entity = updatedEntity;
  }

  private onProductPriceChanged(event: ProductPriceChangedDomainEvent): void {
    const newPrice = unsafeUnwrap(
      Price.create(event.payload.newPrice, event.payload.currency),
    );
    const result = this.entity.changePrice(newPrice);
    if (result.ok) {
      this.entity = result.value;
    }
  }

  private onProductCategorized(event: ProductCategorizedDomainEvent): void {
    const newCategory = unsafeUnwrap(
      Category.create(
        event.payload.newCategoryId,
        event.payload.newCategoryName,
      ),
    );
    const result = this.entity.changeCategory(newCategory);
    if (result.ok) {
      this.entity = result.value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onProductActivated(_event: ProductActivatedDomainEvent): void {
    const result = this.entity.activate();
    if (result.ok) {
      this.entity = result.value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onProductDeactivated(_event: ProductDeactivatedDomainEvent): void {
    const result = this.entity.deactivate();
    if (result.ok) {
      this.entity = result.value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onProductDeleted(_event: ProductDeletedDomainEvent): void {
    const result = this.entity.delete();
    if (result.ok) {
      this.entity = result.value;
    }
  }

  // Snapshot methods (required by base class)
  protected applySnapshot(snapshot: ProductEntitySnapshot): void {
    const entityProps: ProductEntityProps = {
      id: unsafeUnwrap(ProductId.create(snapshot.id)),
      name: unsafeUnwrap(ProductName.create(snapshot.name)),
      sku: unsafeUnwrap(Sku.create(snapshot.sku)),
      price: unsafeUnwrap(Price.create(snapshot.price, snapshot.currency)),
      category: unsafeUnwrap(
        Category.create(snapshot.categoryId, snapshot.categoryName),
      ),
      status: ProductStatus.fromString(snapshot.status),
      description: snapshot.description,
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };

    this.entity = ProductEntity.reconstitute(entityProps);
  }

  public createSnapshot(): ProductEntitySnapshot {
    return this.entity.toSnapshot();
  }

  // Getters - delegate to entity
  get id(): ProductId {
    return this.entity.id;
  }

  get name(): ProductName {
    return this.entity.name;
  }

  get sku(): Sku {
    return this.entity.sku;
  }

  get price(): Price {
    return this.entity.price;
  }

  get category(): Category {
    return this.entity.category;
  }

  get status(): ProductStatus {
    return this.entity.status;
  }

  get description(): string | undefined {
    return this.entity.description;
  }

  get createdAt(): Date {
    return this.entity.createdAt;
  }

  get updatedAt(): Date {
    return this.entity.updatedAt;
  }

  // Additional aggregate-level methods
  public getEntity(): ProductEntity {
    return this.entity;
  }

  public isActive(): boolean {
    return this.entity.isActive();
  }

  public isDeleted(): boolean {
    return this.entity.isDeleted();
  }

  public isDraft(): boolean {
    return this.entity.isDraft();
  }
}
