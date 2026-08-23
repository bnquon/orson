import type { ObservedRun, ScenarioDraft } from './types';

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
      id: 'header-correlation',
      name: 'x-correlation-id',
      value: 'Generated on publish',
      protected: true,
    },
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

export const previousRun: ObservedRun = {
  id: 'run-order-success-01',
  duration: '1.42s',
  events: [
    {
      id: 'event-order-created',
      name: 'Root event published',
      topic: 'order.created',
      kind: 'root',
      timestamp: '10:38:32.018',
      elapsed: '0ms',
      partition: 0,
      offset: 1482,
      metadata: 'JSON · 143 B · observed locally',
      headers: [
        { name: 'x-correlation-id', value: 'corr_01K34J8HFV' },
        { name: 'content-type', value: 'application/json' },
      ],
      payload: '{ "orderId": "ord_123", "total": 279, "currency": "CAD" }',
      position: 'root',
    },
    {
      id: 'event-payment-charged',
      name: 'Payment charged',
      topic: 'payment.charged',
      kind: 'downstream',
      timestamp: '10:38:32.356',
      elapsed: '+338ms',
      partition: 1,
      offset: 991,
      metadata: 'JSON · 126 B · observed locally',
      headers: [{ name: 'x-correlation-id', value: 'corr_01K34J8HFV' }],
      payload: '{ "orderId": "ord_123", "paymentId": "pay_2841", "amount": 279 }',
      position: 'payment',
    },
    {
      id: 'event-inventory-reserved',
      name: 'Inventory reserved',
      topic: 'inventory.reserved',
      kind: 'downstream',
      timestamp: '10:38:32.824',
      elapsed: '+806ms',
      partition: 0,
      offset: 612,
      metadata: 'JSON · 118 B · observed locally',
      headers: [{ name: 'x-correlation-id', value: 'corr_01K34J8HFV' }],
      payload: '{ "orderId": "ord_123", "warehouse": "yvr-01", "reserved": 1 }',
      position: 'inventory',
    },
    {
      id: 'event-notification-sent',
      name: 'Notification sent',
      topic: 'notification.sent',
      kind: 'downstream',
      timestamp: '10:38:33.438',
      elapsed: '+1.42s',
      partition: 2,
      offset: 328,
      metadata: 'JSON · 111 B · observed locally',
      headers: [{ name: 'x-correlation-id', value: 'corr_01K34J8HFV' }],
      payload: '{ "orderId": "ord_123", "channel": "email", "status": "sent" }',
      position: 'notification',
    },
  ],
};
