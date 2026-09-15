/**
 * @file apps/api/src/modules/extras/extras.service.ts
 * @feature extras
 * @dependencies ExtrasRepository, PropertyRepository
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ExtraService, ExtraServiceWrite } from '@resort-booking/shared-types';
import { PropertyService } from '../property/property.service';
import { ExtrasRepository } from './extras.repository';

@Injectable()
export class ExtrasService {
  public constructor(
    private readonly extras: ExtrasRepository,
    private readonly properties: PropertyService,
  ) {}

  /**
   * Property extras catalog.
   */
  public async list(propertyId: string): Promise<ExtraService[]> {
    await this.requireProperty(propertyId);
    return this.extras.listByProperty(propertyId);
  }

  /**
   * Guest checkout extras (published only).
   */
  public async listPublishedForSlug(propertySlug: string): Promise<ExtraService[]> {
    const property = await this.properties.getPublishedProperty(propertySlug);
    const rows = await this.extras.listByProperty(property.id);
    return rows.filter((row: ExtraService): boolean => row.published);
  }

  /**
   * Adds an extra. Instant extras need a price; on-request may be 0 until staff quote later.
   */
  public async create(propertyId: string, input: ExtraServiceWrite): Promise<ExtraService> {
    const property = await this.requireProperty(propertyId);
    this.assertWrite(input);
    return this.extras.create(property.organizationId, propertyId, input);
  }

  /**
   * Edits an extra.
   */
  public async update(extraId: string, input: ExtraServiceWrite): Promise<ExtraService> {
    this.assertWrite(input);
    const updated = await this.extras.update(extraId, input);
    if (updated === null) {
      throw new NotFoundException({ message: 'Extra not found', code: 'EXTRA_NOT_FOUND' });
    }
    return updated;
  }

  /**
   * Deletes an extra. Existing reservations keep any already chosen extras separately later.
   */
  public async delete(extraId: string): Promise<void> {
    const deleted = await this.extras.delete(extraId);
    if (!deleted) {
      throw new NotFoundException({ message: 'Extra not found', code: 'EXTRA_NOT_FOUND' });
    }
  }

  private async requireProperty(propertyId: string): Promise<{ organizationId: string }> {
    const property = await this.properties.getStaffProperty(propertyId);
    return { organizationId: property.organizationId };
  }

  private assertWrite(input: ExtraServiceWrite): void {
    if (input.kind === 'instant' && input.priceCents <= 0) {
      throw new BadRequestException({
        message: 'Instant extras need a price in cents',
        code: 'EXTRA_PRICE_REQUIRED',
      });
    }
  }
}
