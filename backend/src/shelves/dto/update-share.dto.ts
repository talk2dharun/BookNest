import { IsEnum } from 'class-validator';
import { ShelfRole } from '../../generated/prisma/client.js';

export class UpdateShareDto {
  @IsEnum(ShelfRole)
  role!: ShelfRole;
}
