// SPDX-License-Identifier: Apache-2.0
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { INTERNAL_ROLES } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { MAX_FILE_SIZE, StorageService } from './storage.service';
import { FILE_KINDS } from './storage.types';
import type { FileFilters, FileKind } from './storage.types';

interface UploadFileBody {
  kind?: string;
  orderId?: string;
  title?: string;
  category?: string;
}

@Controller('files')
@Roles(...INTERNAL_ROLES)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFileBody,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('Thiếu file trong trường "file".');
    }
    const kind = body.kind ?? 'attachment';
    if (!FILE_KINDS.includes(kind as FileKind)) {
      throw new BadRequestException(
        `kind phải là một trong: ${FILE_KINDS.join(', ')}.`,
      );
    }
    return this.storage.upload(
      {
        buffer: file.buffer,
        originalName: file.originalname,
        mime: file.mimetype,
        size: file.size,
        kind: kind as FileKind,
        orderId: body.orderId ?? null,
        title: body.title ?? null,
        category: body.category ?? null,
      },
      req.user,
    );
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('orderId') orderId?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const filters: FileFilters = {
      ...(orderId ? { orderId } : {}),
      ...(kind && FILE_KINDS.includes(kind as FileKind)
        ? { kind: kind as FileKind }
        : {}),
      ...(status ? { status: status as FileFilters['status'] } : {}),
      includeDeleted: includeDeleted === 'true',
    };
    return this.storage.listForCaller(filters, req.user);
  }

  @Get(':id/content')
  async content(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const { file, body } = await this.storage.contentForCaller(id, req.user);
    return new StreamableFile(body, {
      type: file.mime,
      disposition: `inline; filename="${file.originalName.replace(/"/g, '')}"`,
      length: file.size,
    });
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.storage.getForCaller(id, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.storage.delete(id, body?.reason ?? '', req.user);
  }
}
