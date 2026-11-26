/**
 * @file apps/api/src/shared/validation/id-param.pipe.spec.ts
 * @shared App-wide id parameter check
 */

import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { IdParamPipe } from './id-param.pipe';

const GOOD = '33333333-3333-3333-3333-333333333331';

function param(data: string): ArgumentMetadata {
  return { type: 'param', data };
}

describe('IdParamPipe', () => {
  const pipe = new IdParamPipe();

  it.each(['id', 'houseId', 'propertyId', 'holdId', 'paymentId', 'discountId', 'extraId', 'optionId', 'periodId'])(
    'accepts a real id in the %s parameter',
    (name) => {
      expect(pipe.transform(GOOD, param(name))).toBe(GOOD);
    },
  );

  it.each(['not-an-id', "1'; DROP TABLE x;--", '', '../../etc/passwd', '33333333-3333-3333-3333-33333333333', GOOD + 'a'])(
    'refuses %j in an id parameter with 400 INVALID_ID',
    (bad) => {
      expect(() => pipe.transform(bad, param('houseId'))).toThrow(BadRequestException);
      try {
        pipe.transform(bad, param('id'));
      } catch (error: unknown) {
        expect(error).toMatchObject({ response: { code: 'INVALID_ID' } });
      }
    },
  );

  it('leaves slugs alone', () => {
    expect(pipe.transform('alpine-lake', param('slug'))).toBe('alpine-lake');
    expect(pipe.transform('lake-chalet', param('houseSlug'))).toBe('lake-chalet');
  });

  it('only looks at route parameters, not the body or the query', () => {
    expect(pipe.transform('whatever', { type: 'query', data: 'id' })).toBe('whatever');
    expect(pipe.transform({ id: 'x' }, { type: 'body' })).toEqual({ id: 'x' });
  });

  it('refuses a non-string value in an id parameter', () => {
    expect(() => pipe.transform(undefined, param('id'))).toThrow(BadRequestException);
  });
});
