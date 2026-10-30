import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateProgressDto {
  @Type(() => Number)
  @IsInt({ message: 'currentPage must be an integer' })
  @Min(0, { message: 'Page cannot be negative' })
  currentPage!: number;
}
