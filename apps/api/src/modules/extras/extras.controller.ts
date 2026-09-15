/**
 * @file apps/api/src/modules/extras/extras.controller.ts
 * @feature extras
 * @dependencies ExtrasService, StaffGuard
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ApiOkBody, ExtraService } from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { UpsertExtraDto } from './dto/upsert-extra.dto';
import { ExtrasService } from './extras.service';

@Controller()
export class ExtrasController {
  public constructor(private readonly extras: ExtrasService) {}

  @Get('properties/:slug/extras')
  public async listPublished(@Param('slug') slug: string): Promise<ApiOkBody<ExtraService[]>> {
    return { status: 'ok', data: await this.extras.listPublishedForSlug(slug) };
  }

  @Get('staff/properties/:propertyId/extras')
  @UseGuards(StaffGuard)
  public async list(@Param('propertyId') propertyId: string): Promise<ApiOkBody<ExtraService[]>> {
    return { status: 'ok', data: await this.extras.list(propertyId) };
  }

  /**
   * Creates an extra on that property only.
   */
  @Post('staff/properties/:propertyId/extras')
  @UseGuards(StaffGuard)
  public async create(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertExtraDto,
  ): Promise<ApiOkBody<ExtraService>> {
    return { status: 'ok', data: await this.extras.create(propertyId, body) };
  }

  /**
   * Updates an extra.
   */
  @Patch('staff/extras/:extraId')
  @UseGuards(StaffGuard)
  public async update(
    @Param('extraId') extraId: string,
    @Body() body: UpsertExtraDto,
  ): Promise<ApiOkBody<ExtraService>> {
    return { status: 'ok', data: await this.extras.update(extraId, body) };
  }

  /**
   * Removes an extra from the catalog.
   */
  @Delete('staff/extras/:extraId')
  @UseGuards(StaffGuard)
  public async remove(@Param('extraId') extraId: string): Promise<ApiOkBody<{ deleted: true }>> {
    await this.extras.delete(extraId);
    return { status: 'ok', data: { deleted: true } };
  }
}
