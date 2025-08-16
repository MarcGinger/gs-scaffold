export interface IAggregateWithDto<TDto = unknown> {
  toDto(): TDto;
}
