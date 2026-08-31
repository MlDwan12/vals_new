import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';

type LandingSearchFields = {
  id: number;
  slug: string;
  serviceSlug: string;
  title: string;
  subtitle: string | null;
};

export function buildLandingUrl(serviceSlug: string, slug: string): string {
  return `/services/${serviceSlug}/${slug}`;
}

export function buildLandingSearchDocument(
  landing: LandingSearchFields,
): GlobalSearchDocument {
  return {
    id: `landing_${landing.id}`,
    entityType: 'landing',
    title: landing.title,
    description: landing.subtitle ?? '',
    url: buildLandingUrl(landing.serviceSlug, landing.slug),
  };
}
