import { Transform } from 'class-transformer';
import { IsEmail, IsEnum } from 'class-validator';
import { ShelfRole } from '../../generated/prisma/client.js';

export class ShareShelfDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsEnum(ShelfRole)
  role!: ShelfRole;
}
