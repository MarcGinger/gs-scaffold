export interface ILogger {
  debug(context: Record<string, unknown>, message: string): void;
  log(context: Record<string, unknown>, message: string): void;
  error(
    context: Record<string, unknown>,
    message: string,
    trace?: string,
  ): void;
  warn(context: Record<string, unknown>, message: string): void;
  verbose(context: Record<string, unknown>, message: string): void;
}
