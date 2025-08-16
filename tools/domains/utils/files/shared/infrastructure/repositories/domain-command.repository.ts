import { BadRequestException, NotFoundException, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILogger } from 'src/shared/logger';
import { AggregateRoot, IEvent } from '@nestjs/cqrs';
import { IAggregateWithDto } from '../../domain';
import { InfrastructureRepository } from './infrastructure.repository';
import { IException } from 'src/shared/domain/exceptions';
import { IUserToken } from 'src/shared/auth';

/**
 * Abstract base class for CQRS command repositories without saga support
 * This extends DomainCommandRepository to add CQRS command functionality for simple repositories
 * Use this for repositories that need CQRS patterns but don't require saga coordination
 * For saga-enabled repositories, use EventSourcingRepository instead
 * @template TEntity - Entity type
 * @template TAggregate - Aggregate type extending AggregateRoot
 * @template TExceptionMessages - Exception messages type
 * @template TDto - DTO type
 */

export abstract class DomainCommandRepository<
  TEntity,
  TAggregate extends AggregateRoot & IAggregateWithDto<TDto>,
  TExceptionMessages extends Record<string, IException>,
  TDto = unknown,
> extends InfrastructureRepository<TExceptionMessages> {
  /**
   * Constructor
   * @param configService Config service
   * @param logger Logger service
   * @param exceptionMessages Messages used for exceptions
   * @param aggregateType Type for creating aggregates
   */
  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: ILogger,
    protected readonly exceptionMessages: TExceptionMessages,
    protected readonly aggregateType: Type<TAggregate>,
  ) {
    super(configService, logger, exceptionMessages);
  }

  /**
   * Abstract method to get an item from the event stream
   * @param user User token
   * @param identifier Entity identifier
   * @returns Stream item or undefined if not found
   */
  protected abstract get(
    user: IUserToken,
    identifier: string | number,
  ): Promise<TEntity | undefined>;
  /**
   * Creates an aggregate from an entity
   * This method maps entity data to the domain model using value objects
   */
  protected createAggregate(user: IUserToken, entity: TEntity): TAggregate {
    return new this.aggregateType(entity);
  }

  /**
   * Retrieves an aggregate by its identifier using event stream
   * This provides a common implementation for event stream-based repositories
   * @param user User token
   * @param identifier Entity identifier
   * @returns Aggregate or undefined if not found
   */
  async getById(
    user: IUserToken,
    identifier: string | number,
  ): Promise<TAggregate | undefined> {
    const entity = await this.get(user, identifier);
    if (!entity) return undefined;
    return this.createAggregate(user, entity);
  }

  /**
   * Creates and persists a new aggregate, returning its DTO for external use.
   * This enforces domain boundary: only DTOs are returned outside the repository.
   */
  async createAndReturnDto(
    user: IUserToken,
    aggregate: TAggregate,
  ): Promise<TDto> {
    const startTime = Date.now();
    const logContext = this.createLogContext(
      'DomainCommandRepository',
      'create',
      '',
      user,
    );

    this.logger.debug(logContext, `Create operation started`);

    try {
      const event = this.getCreateEvent(user, aggregate);
      aggregate.apply(event);
      await this.save(user, aggregate);

      const duration = Date.now() - startTime;
      this.logger.log(
        {
          ...logContext,
          duration,
        },
        `Create succeeded in ${duration}ms`,
      );
      // Only return the DTO, not the aggregate
      return aggregate.toDto();
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorContext = this.createErrorContext(
        logContext,
        error as Error,
        duration,
        aggregate.toDto(),
      );

      // Use a safe fallback for error message
      const errorMessage = this.extractErrorMessage(error, {
        message: 'Create operation failed',
        description: 'An error occurred while creating the aggregate',
        code: 'CREATE_ERROR',
        exception: 'DomainCommandRepositoryCreateException',
        statusCode: '400',
        domain: 'true',
      });

      return this.handleError(
        error as Error,
        user,
        errorContext,
        errorMessage,
        duration,
      );
    }
  }

  /**
   * Validates that an entity exists or throws a not found exception
   * @param entity The entity to validate
   * @param notFoundMessage The message to use in the not found exception
   */
  protected validateEntityExists<T>(
    entity: T | null | undefined,
    notFoundMessage: IException,
  ): asserts entity is T {
    if (!entity) {
      throw new NotFoundException(notFoundMessage);
    }
  }

  /**
   * Helper method to format error messages for missing codes
   * @param entityType Type of entity that had missing codes
   * @param missingCodes Array of missing codes
   * @returns Formatted error message
   */
  protected formatMissingCodesMessage(
    entityType: string,
    missingCodes: string[],
  ): string {
    return `${entityType} codes not found: ${missingCodes.join(', ')}`;
  }

  /**
   * Finds identifiers that are missing from the retrieved entities
   * @param requestedIdentifiers Array of identifiers that were requested
   * @param foundEntities Array of entities that were found
   * @param identifierProperty The property name to use as identifier (e.g., 'code', 'key', 'id')
   * @returns Array of identifiers that were requested but not found
   */
  protected findMissingIdentifiers<T extends Record<string, any>>(
    requestedIdentifiers: string[],
    foundEntities: T[],
    identifierProperty: string = 'code',
  ): string[] {
    // Use type assertion to string for safety
    const foundValues = foundEntities.map((entity) =>
      String(entity[identifierProperty]),
    );
    return requestedIdentifiers.filter((id) => !foundValues.includes(id));
  }

  /**
   * Validates that expected entities match found entities by count, using a generic identifier property
   * @param found Array of found entities
   * @param expected Array of expected identifiers
   * @param entityType Type of entity for error message
   * @param logContext Context for logging
   * @param identifierProperty The property name to use as identifier (e.g., 'code', 'key', 'id')
   */
  protected validateEntityIdentifiersFound<T extends Record<string, any>>(
    found: T[],
    expected: string[],
    entityType: string,
    logContext: Record<string, unknown>,
    identifierProperty: string = 'code',
  ): void {
    if (found.length !== expected.length) {
      const missing = this.findMissingIdentifiers(
        expected,
        found,
        identifierProperty,
      );
      this.logger.warn(
        {
          ...logContext,
          missing,
          entityType,
          identifierProperty,
        },
        `Some ${entityType} ${identifierProperty}s not found: ${missing.join(', ')}`,
      );
      throw new BadRequestException(
        this.formatMissingCodesMessage(entityType, missing),
      );
    }
  }

  /**
   * Creates a domain event for entity creation
   * @param user User who created the entity
   * @param aggregate Aggregate created from the entity
   * @returns Event object
   */
  protected abstract getCreateEvent(
    user: IUserToken,
    aggregate: TAggregate,
  ): IEvent;

  /**
   * Creates a domain event for entity update
   * @param user User who updated the entity
   * @param aggregate Aggregate created from the updated entity
   * @returns Event object
   */
  protected abstract getUpdateEvent(
    user: IUserToken,
    aggregate: TAggregate,
  ): IEvent;

  protected abstract save(
    user: IUserToken,
    entity: TAggregate,
  ): Promise<TEntity>;
}
