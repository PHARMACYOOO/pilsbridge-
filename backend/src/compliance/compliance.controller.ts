import { Body, Controller, Get, HttpCode, MaxFileSizeValidator, Param, ParseEnumPipe, ParseFilePipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { DocumentKind, DocumentStatus, Role } from '../generated/prisma/client.js';
import { ComplianceWatchService } from './compliance-watch.service.js';
import { ComplianceService } from './compliance.service.js';
import { ReviewDocumentDto, UploadDocumentDto } from './dto.js';

const MAX_UPLOAD = 10 * 1024 * 1024;

const sendFile = (res: Response, { buf, type }: { buf: Buffer; type: string }) =>
  res.set({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(buf);

@ApiTags('pharmacy · compliance')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/compliance')
export class PharmacyComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.compliance.overview(user);
  }

  /** Upload a licence or certificate for Pilbridge to verify. */
  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'kind', 'reference'],
      properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: Object.values(DocumentKind) }, reference: { type: 'string' }, issuer: { type: 'string' }, expiresAt: { type: 'string', example: '2027-11-12' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD })], fileIsRequired: true })) file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.compliance.upload(user, file, dto);
  }

  @Get('documents/:id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.compliance.file(user, id));
  }
}

@ApiTags('admin · compliance')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/compliance')
export class AdminComplianceController {
  constructor(
    private readonly compliance: ComplianceService,
    private readonly watch: ComplianceWatchService,
  ) {}

  @Get('documents')
  @ApiQuery({ name: 'status', enum: DocumentStatus, required: false })
  documents(@Query('status', new ParseEnumPipe(DocumentStatus, { optional: true })) status?: DocumentStatus) {
    return this.compliance.forReview(status);
  }

  @Get('documents/:id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.compliance.file(user, id));
  }

  @Post('documents/:id/review')
  @HttpCode(200)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    return this.compliance.review(user, id, dto);
  }

  /** Run the licence check now (it also runs on a timer): suspend expired licences, send due reminders. */
  @Post('check')
  @HttpCode(200)
  check() {
    return this.watch.check();
  }
}
