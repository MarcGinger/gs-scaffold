/**
 * Entity Base Class
 *
 * Base class for all domain entities.
 * Provides identity comparison and basic entity functionality.
 */

export abstract class EntityBase<TProps, TId = string> {
  protected readonly _props: TProps;
  protected readonly _id: TId;

  constructor(props: TProps, id: TId) {
    this._props = props;
    this._id = id;
  }

  protected get props(): TProps {
    return this._props;
  }

  public equals(entity: EntityBase<any, TId>): boolean {
    if (!entity || !(entity instanceof EntityBase)) {
      return false;
    }

    if (this === entity) {
      return true;
    }

    return (this._id as any)?.equals
      ? (this._id as any).equals(entity._id)
      : this._id === entity._id;
  }
}
