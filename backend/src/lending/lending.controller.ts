import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { LendBookDto } from './dto/lend-book.dto.js';
import { LendingService } from './lending.service.js';

@ApiTags('lending')
@ApiBearerAuth()
@Controller('books')
export class LendingController {
  constructor(private readonly lending: LendingService) {}

  @Post(':id/lend')
  @HttpCode(201)
  lend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LendBookDto,
  ) {
    return this.lending.lend(user.id, id, dto);
  }

  @Post(':id/return')
  @HttpCode(200)
  markReturned(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.lending.markReturned(user.id, id);
  }
}
