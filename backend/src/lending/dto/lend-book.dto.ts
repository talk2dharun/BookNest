import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class LendBookDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}
