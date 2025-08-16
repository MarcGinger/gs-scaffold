import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateProductCommand } from '../commands/create-product.command';
import { CreateProductUseCase } from '../use-cases/create-product.use-case';
import { ProductAggregate } from '../../domain';
import { Result, DomainError } from '../../../../shared/errors/error.types';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler
  implements ICommandHandler<CreateProductCommand>
{
  constructor(
    @Inject(CreateProductUseCase)
    private readonly createProductUseCase: CreateProductUseCase,
  ) {}

  async execute(
    command: CreateProductCommand,
  ): Promise<Result<ProductAggregate, DomainError>> {
    return await this.createProductUseCase.execute(command);
  }
}
