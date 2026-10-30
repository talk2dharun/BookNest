import { IsUUID } from 'class-validator';

export class AddShelfBookDto {
  @IsUUID()
  bookId!: string;
}
