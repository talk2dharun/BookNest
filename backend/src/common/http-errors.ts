import { BadRequestException } from '@nestjs/common';

export type FieldError = {
  field: string;
  message: string;
};

export function fieldBadRequest(field: string, message: string) {
  return new BadRequestException({
    message,
    details: [{ field, message } satisfies FieldError],
  });
}
