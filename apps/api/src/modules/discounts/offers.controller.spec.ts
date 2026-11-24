/**
 * @file apps/api/src/modules/discounts/offers.controller.spec.ts
 * @feature discounts
 */

import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { PromotedOffer } from '@resort-booking/shared-types';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

describe('OffersController', () => {
  const listForProperty = jest.fn<Promise<PromotedOffer[]>, [string]>();
  let controller: OffersController;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [{ provide: OffersService, useValue: { listForProperty } }],
    }).compile();
    controller = moduleRef.get(OffersController);
  });

  it('wraps the offers in the standard ok body', async () => {
    listForProperty.mockResolvedValue([]);
    await expect(controller.list('alpine-lake')).resolves.toEqual({ status: 'ok', data: [] });
    expect(listForProperty).toHaveBeenCalledWith('alpine-lake');
  });

  it('is public: no staff guard on the route or the class', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OffersController)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, OffersController.prototype.list)).toBeUndefined();
  });
});
