import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateProductCommand } from '../commands/update-product.command';
import { UpdateProductUseCase } from '../use-cases/update-product.use-case';
import { ProductAggregate } from '../../domain';
import { Result, DomainError } from '../../../../shared/errors/error.types';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler
  implements ICommandHandler<UpdateProductCommand>
{
  constructor(
    @Inject(UpdateProductUseCase)
    private readonly updateProductUseCase: UpdateProductUseCase,
  ) {}

  async execute(
    command: UpdateProductCommand,
  ): Promise<Result<ProductAggregate, DomainError>> {
    return await this.updateProductUseCase.execute(command);
  }
}
