/**
 * DateRange Value Object
 * Represents a range between two dates (start is required, end is optional)
 */
export class DateRange {
  private readonly start: Date;
  private readonly end?: Date;

  private constructor(start: Date, end?: Date) {
    this.start = new Date(start);
    this.end = end ? new Date(end) : undefined;
    this.validate();
  }

  public static create(start: Date, end?: Date): DateRange {
    return new DateRange(start, end);
  }

  private validate(): void {
    if (!this.start || isNaN(this.start.getTime())) {
      throw new Error('Start date is required and must be valid');
    }
    if (this.end && this.end < this.start) {
      throw new Error('End date must be after start date');
    }
  }

  public getStart(): Date {
    return new Date(this.start);
  }

  public getEnd(): Date | undefined {
    return this.end ? new Date(this.end) : undefined;
  }

  public equals(other: DateRange): boolean {
    return (
      this.start.getTime() === other.start.getTime() &&
      ((this.end === undefined && other.end === undefined) ||
        (this.end !== undefined &&
          other.end !== undefined &&
          this.end.getTime() === other.end.getTime()))
    );
  }
}
