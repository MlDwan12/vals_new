export interface TariffSnapshot {
  serviceName: string;
  tariffName: string;
  periodMonths: number;
  pricePerMonth: number;
  totalPrice: number;
}
