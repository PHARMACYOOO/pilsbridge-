import { Body, Controller, Get, HttpCode, MaxFileSizeValidator, Param, ParseEnumPipe, ParseFilePipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { PrescriptionStatus, Role } from '../generated/prisma/client.js';
import { ReviewPrescriptionDto, UploadPrescriptionDto } from './dto.js';
import { PrescriptionsService } from './prescriptions.service.js';

const MAX_UPLOAD = 10 * 1024 * 1024;

@ApiTags('prescriptions')
@ApiBearerAuth()
@Roles(Role.PATIENT)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly rx: PrescriptionsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' }, prescriberName: { type: 'string' } }, required: ['image'] } })
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD })], fileIsRequired: true })) file: Express.Multer.File,
    @Body() dto: UploadPrescriptionDto,
  ) {
    return this.rx.upload(user, file, dto.prescriberName);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rx.listMine(user);
  }
}

@ApiTags('pharmacy · prescriptions')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/prescriptions')
export class PharmacyPrescriptionsController {
  constructor(private readonly rx: PrescriptionsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: PrescriptionStatus, required: false })
  list(@CurrentUser() user: AuthUser, @Query('status', new ParseEnumPipe(PrescriptionStatus, { optional: true })) status?: PrescriptionStatus) {
    return this.rx.listForPharmacy(user, status);
  }

  /** The prescription image. Pharmacists only — counter staff and riders never see it. */
  @Get(':code/image')
  @Roles(Role.PHARMACIST)
  async image(@CurrentUser() user: AuthUser, @Param('code') code: string, @Res() res: Response) {
    const { buf, type } = await this.rx.image(user, code);
    res.set({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(buf);
  }

  @Post(':code/review')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  review(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReviewPrescriptionDto) {
    return this.rx.review(user, code, dto);
  }
}
