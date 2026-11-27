/**
 * @file apps/web/src/shared/seo/metadata.ts
 * @shared Page titles, descriptions, canonical links and social cards for the guest site
 * @dependencies site-url, json-ld (price text)
 */

import type { HouseDetail, HouseSummary, PropertyDetail, PropertySummary } from '@resort-booking/shared-types';
import type { Metadata } from 'next';
import { lowestRate, priceFromText } from './json-ld';
import { SITE_NAME, propertyPath, stayPath } from './site-url';

/** A search result snippet shows about 155 characters; longer text is cut. */
const DESCRIPTION_LIMIT = 155;

/** Plain one-line text: tags and extra white space removed, cut at a word boundary with an ellipsis. */
export function shortText(text: string, limit: number = DESCRIPTION_LIMIT): string {
  const flat = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) {
    return flat;
  }
  const cut = flat.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** An image address that a social card or search result can load: absolute http(s) only. */
function webImage(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

interface CardInput {
  title: string;
  description: string;
  path: string;
  image: string | null;
  imageAlt: string;
}

/**
 * The shared parts: canonical link, Open Graph and Twitter cards. A nested page replaces the layout's cards, so
 * each page carries its own.
 */
function pageMetadata({ title, description, path, image, imageAlt }: CardInput): Metadata {
  const picture = webImage(image);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en',
      title,
      description,
      url: path,
      ...(picture === null ? {} : { images: [{ url: picture, alt: imageAlt }] }),
    },
    twitter: {
      card: picture === null ? 'summary' : 'summary_large_image',
      title,
      description,
      ...(picture === null ? {} : { images: [picture] }),
    },
  };
}

/** Pages that must not appear in search results (private or thin). `follow` says whether links on it may be followed. */
export function noIndexMetadata(title: string, follow: boolean): Metadata {
  return { title, robots: { index: false, follow } };
}

function cityList(properties: readonly PropertySummary[]): string[] {
  return [...new Set(properties.map((property): string => property.city.trim()).filter((city): boolean => city !== ''))];
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

function inCities(properties: readonly PropertySummary[]): string {
  const cities = cityList(properties);
  return cities.length === 0 ? '' : ` in ${joinWords(cities.slice(0, 3))}`;
}

/** The home page: the brand, where the stays are, and the direct-booking promise. */
export function homeMetadata(properties: readonly PropertySummary[]): Metadata {
  const title = `Book holiday stays direct${inCities(properties)}`;
  const description = shortText(
    `Book holiday stays${inCities(properties)} directly with the owner. See which stays are free for your dates, pay securely online and arrive.`,
  );
  const cover = properties.find((property): boolean => webImage(property.coverPhotoUrl) !== null);
  const card = pageMetadata({ title, description, path: '/', image: cover?.coverPhotoUrl ?? null, imageAlt: cover?.name ?? SITE_NAME });
  // The home title leads with the brand instead of ending with it.
  return { ...card, title: { absolute: `${SITE_NAME}: ${title}` } };
}

/** The list of every published property. */
export function propertiesMetadata(properties: readonly PropertySummary[]): Metadata {
  const description = shortText(
    `Our holiday properties${inCities(properties)}. Open a property to see its stays, photos, prices and location, then book direct.`,
  );
  const cover = properties.find((property): boolean => webImage(property.coverPhotoUrl) !== null);
  return pageMetadata({ title: 'Our properties', description, path: '/properties', image: cover?.coverPhotoUrl ?? null, imageAlt: cover?.name ?? SITE_NAME });
}

/** One property: its name and town, a price-from line when it has stays, and its own description. */
export function propertyMetadata(property: PropertyDetail, houses: readonly HouseSummary[]): Metadata {
  const lowest = lowestRate(houses);
  const biggest = houses.reduce((most, house): number => Math.max(most, house.capacity), 0);
  const facts = [
    houses.length > 0 ? `${String(houses.length)} ${houses.length === 1 ? 'stay' : 'stays'}` : null,
    biggest > 0 ? `sleeps up to ${String(biggest)}` : null,
    lowest === null ? null : priceFromText(lowest.cents, lowest.currencyCode),
  ].filter((fact): fact is string => fact !== null);
  const intro = property.description.trim() === '' ? `Holiday stays in ${property.city}.` : property.description;
  const description = shortText(`${facts.length > 0 ? `${facts.join(', ')}. ` : ''}${intro} Book direct.`);
  return pageMetadata({
    title: `${property.name}: stays in ${property.city}`,
    description,
    path: propertyPath(property.slug),
    image: webImage(property.coverPhotoUrl) ?? property.photos[0]?.url ?? null,
    imageAlt: property.photos[0]?.altText || property.name,
  });
}

/** One stay: its name, property and town, how many it sleeps, and the price-from line. */
export function stayMetadata(house: HouseDetail): Metadata {
  const facts = `Sleeps ${String(house.capacity)}, ${priceFromText(house.nightlyRateCents, house.currencyCode)}.`;
  const intro = house.description.trim() === '' ? `${house.name} at ${house.propertyName} in ${house.propertyCity}.` : house.description;
  return pageMetadata({
    title: `${house.name} at ${house.propertyName}, ${house.propertyCity}`,
    description: shortText(`${facts} ${intro} Book direct.`),
    path: stayPath(house.propertySlug, house.slug),
    image: webImage(house.coverPhotoUrl) ?? house.photos[0]?.url ?? null,
    imageAlt: house.photos[0]?.altText || house.name,
  });
}

/** Search results: never indexed (an endless set of date combinations), but links on the page may be followed. */
export function searchMetadata(): Metadata {
  return noIndexMetadata('Available stays', true);
}

/** Looking up a booking: private, never indexed, links not followed. */
export function manageMetadata(): Metadata {
  return noIndexMetadata('Manage your booking', false);
}
