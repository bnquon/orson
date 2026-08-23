import type { ScenarioDraft } from './types';

export const initialScenario: ScenarioDraft = {
  rootTopic: 'order.created',
  watchedTopics: [
    { id: 'topic-payment-charged', name: 'payment.charged' },
    { id: 'topic-inventory-reserved', name: 'inventory.reserved' },
    { id: 'topic-notification-sent', name: 'notification.sent' },
    { id: 'topic-order-cancelled', name: 'order.cancelled' },
  ],
  messageKey: 'ord_123',
  headers: [
    {
      id: 'header-content-type',
      name: 'content-type',
      value: 'application/json',
      protected: false,
    },
  ],
  payload: `{
  "orderId": "ord_123",
  "customerId": "cus_123",
  "customerEmail": "developer@example.com",
  "currency": "CAD",
  "total": 279,
  "items": [
    { "sku": "orson-mug", "quantity": 1 }
  ]
}`,
  captureTimeoutSeconds: '10',
};
