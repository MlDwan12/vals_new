import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { Service } from '../domain/service.entity';

type ServiceSearchFields = Pick<
  Service,
  'id' | 'slug' | 'title' | 'subtitle' | 'description'
>;

// Услуги — без даты публикации (в отличие от статей/кейсов, у сущности вообще нет такого поля),
// поэтому индексируются всегда, без гейта по публикации.
export function buildServiceSearchDocument(
  service: ServiceSearchFields,
): GlobalSearchDocument {
  const description = [service.subtitle, service.description]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ');

  return {
    id: `service_${service.id}`,
    entityType: 'service',
    title: service.title,
    description,
    url: `/services/${service.slug}`,
  };
}

export function serviceFaqDocumentIds(service: Pick<Service, 'faq'>): string[] {
  return service.faq.map((faq) => `serviceFaq_${faq.id}`);
}
