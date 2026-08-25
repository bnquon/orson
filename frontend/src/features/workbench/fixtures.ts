import type { ScenarioDraft } from './types';

export const initialScenario: ScenarioDraft = {
  rootTopic: 'order.created',
  watchedTopics: [
    { id: 'topic-payment-charged', name: 'payment.charged' },
    { id: 'topic-inventory-reserved', name: 'inventory.reserved' },
    { id: 'topic-notification-sent', name: 'notification.sent' },
    { id: 'topic-order-cancelled', name: 'order.cancelled' },
  ],
  topology: [
    { id: 'edge-order-payment', from: 'order.created', to: 'payment.charged' },
    { id: 'edge-order-cancelled', from: 'order.created', to: 'order.cancelled' },
    { id: 'edge-payment-inventory', from: 'payment.charged', to: 'inventory.reserved' },
    { id: 'edge-payment-notification', from: 'payment.charged', to: 'notification.sent' },
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
  correlationHeader: 'x-correlation-id',
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
