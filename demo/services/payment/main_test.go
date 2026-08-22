package main

import (
	"encoding/json"
	"testing"

	"orson/demo/internal/events"
)

func TestHandleOrderChoosesBranch(t *testing.T) {
	tests := []struct {
		name      string
		total     float64
		wantTopic string
	}{
		{name: "successful", total: 279, wantTopic: events.TopicPaymentCharged},
		{name: "failed", total: 799, wantTopic: events.TopicOrderCancelled},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value, err := json.Marshal(events.OrderCreated{
				OrderID:       "ord_123",
				CustomerID:    "cus_123",
				CustomerEmail: "developer@example.com",
				Currency:      "CAD",
				Total:         test.total,
				Items:         []events.Item{{SKU: "orson-mug", Quantity: 1}},
			})
			if err != nil {
				t.Fatalf("encode order: %v", err)
			}

			output, err := handleOrder(value)
			if err != nil {
				t.Fatalf("handleOrder() error = %v", err)
			}
			if output.Topic != test.wantTopic {
				t.Fatalf("handleOrder() topic = %q, want %q", output.Topic, test.wantTopic)
			}
		})
	}
}
