export enum LeadDeliveryStatus {
  PENDING = 'pending',
  // Переходный статус между claim-апдейтом и результатом HTTP-вызова к Bitrix (секунды) —
  // защищает от повторной отправки того же лида ручным retry/параллельным инстансом планировщика.
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}
