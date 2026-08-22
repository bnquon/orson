package events

import (
	"testing"
)

func TestOrderCreatedPaymentFails(t *testing.T) {
	tests := []struct {
		name  string
		total float64
		fails bool
	}{
		{name: "below threshold", total: 279, fails: false},
		{name: "at threshold", total: 500, fails: false},
		{name: "above threshold", total: 500.01, fails: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			order := validOrder()
			order.Total = test.total

			if got := order.PaymentFails(); got != test.fails {
				t.Fatalf("PaymentFails() = %v, want %v", got, test.fails)
			}
		})
	}
}

func TestOrderCreatedValidate(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*OrderCreated)
	}{
		{name: "missing order id", mutate: func(order *OrderCreated) { order.OrderID = "" }},
		{name: "invalid currency", mutate: func(order *OrderCreated) { order.Currency = "cad" }},
		{name: "negative total", mutate: func(order *OrderCreated) { order.Total = -1 }},
		{name: "missing items", mutate: func(order *OrderCreated) { order.Items = nil }},
		{name: "invalid quantity", mutate: func(order *OrderCreated) { order.Items[0].Quantity = 0 }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			order := validOrder()
			test.mutate(&order)

			if err := order.Validate(); err == nil {
				t.Fatal("Validate() returned nil, want an error")
			}
		})
	}
}

func TestSuccessfulEventMapping(t *testing.T) {
	order := validOrder()
	payment := NewPaymentCharged(order)
	reservation := NewInventoryReserved(payment)
	notification := NewNotificationSent(payment)

	if payment.OrderID != order.OrderID || payment.Amount != order.Total {
		t.Fatal("payment did not preserve order identity and total")
	}
	if reservation.OrderID != order.OrderID || len(reservation.Items) != len(order.Items) {
		t.Fatal("reservation did not preserve order identity and items")
	}
	if notification.OrderID != order.OrderID || notification.Recipient != order.CustomerEmail {
		t.Fatal("notification did not preserve order identity and recipient")
	}
}

func TestCancelledEventMapping(t *testing.T) {
	order := validOrder()
	order.Total = 799
	cancelled := NewOrderCancelled(order)

	if cancelled.OrderID != order.OrderID || cancelled.Total != order.Total {
		t.Fatal("cancellation did not preserve order identity and total")
	}
	if cancelled.Reason != "payment_declined" {
		t.Fatalf("Reason = %q, want payment_declined", cancelled.Reason)
	}
}

func validOrder() OrderCreated {
	return OrderCreated{
		OrderID:       "ord_123",
		CustomerID:    "cus_123",
		CustomerEmail: "developer@example.com",
		Currency:      "CAD",
		Total:         279,
		Items:         []Item{{SKU: "orson-mug", Quantity: 1}},
	}
}
