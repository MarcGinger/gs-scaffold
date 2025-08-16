import { BadRequestException, NotFoundException } from '@nestjs/common';

export function handleCommandError(
  error: unknown,
  notFoundMessage: any,
  badRequestMessage: any,
) {
  if (error instanceof NotFoundException) {
    throw error;
  }
  if (error instanceof BadRequestException) {
    throw error;
  }
  throw error;
  // throw new BadRequestException(
  //   badRequestMessage,
  //   error instanceof Error ? error.message : String(error),
  // );
}
