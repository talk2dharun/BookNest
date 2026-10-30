import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { AddShelfBookDto } from './dto/add-shelf-book.dto.js';
import { CreateShelfDto } from './dto/create-shelf.dto.js';
import { ShareShelfDto } from './dto/share-shelf.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import { UpdateShelfDto } from './dto/update-shelf.dto.js';
import { ShelvesService } from './shelves.service.js';

@ApiTags('shelves')
@ApiBearerAuth()
@Controller('shelves')
export class ShelvesController {
  constructor(private readonly shelves: ShelvesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShelfDto) {
    return this.shelves.create(user.id, dto);
  }

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.shelves.findMine(user.id);
  }

  @Get('shared-with-me')
  findSharedWithMe(@CurrentUser() user: AuthUser) {
    return this.shelves.findSharedWithMe(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shelves.findOne(user.id, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShelfDto,
  ) {
    return this.shelves.rename(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shelves.remove(user.id, id);
  }

  @Post(':id/books')
  addBook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddShelfBookDto,
  ) {
    return this.shelves.addBook(user.id, id, dto);
  }

  @Delete(':id/books/:bookId')
  @HttpCode(204)
  removeBook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookId', ParseUUIDPipe) bookId: string,
  ) {
    return this.shelves.removeBook(user.id, id, bookId);
  }

  @Post(':id/shares')
  share(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShareShelfDto,
  ) {
    return this.shelves.share(user.id, id, dto);
  }

  @Patch(':id/shares/:userId')
  updateShare(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) collaboratorId: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.shelves.updateShare(user.id, id, collaboratorId, dto);
  }

  @Delete(':id/shares/:userId')
  @HttpCode(204)
  removeShare(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) collaboratorId: string,
  ) {
    return this.shelves.removeShare(user.id, id, collaboratorId);
  }
}
