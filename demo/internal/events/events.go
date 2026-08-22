package events

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	TopicOrderCreated      = "order.created"
	TopicPaymentCharged    = "payment.charged"
	TopicInventoryReserved = "inventory.reserved"
	TopicNotificationSent  = "notification.sent"
	TopicOrderCancelled    = "order.cancelled"

	CorrelationHeader = "x-correlation-id"
	ContentTypeHeader = "content-type"
	JSONContentType   = "application/json"
	FailureThreshold  = 500.0
)

type Item struct {
	SKU      string `json:"sku"`
	Quantity int    `json:"quantity"`
}

type OrderCreated struct {
	OrderID       string  `json:"orderId"`
	CustomerID    string  `json:"customerId"`
	CustomerEmail string  `json:"customerEmail"`
	Currency      string  `json:"currency"`
	Total         float64 `json:"total"`
	Items         []Item  `json:"items"`
}

func DecodeOrderCreated(value []byte) (OrderCreated, error) {
	var event OrderCreated
	if err := json.Unmarshal(value, &event); err != nil {
		return OrderCreated{}, fmt.Errorf("decode order.created: %w", err)
	}

	if err := event.Validate(); err != nil {
		return OrderCreated{}, err
	}

	return event, nil
}

func (event OrderCreated) Validate() error {
	if strings.TrimSpace(event.OrderID) == "" {
		return errors.New("order.created orderId is required")
	}
	if strings.TrimSpace(event.CustomerID) == "" {
		return errors.New("order.created customerId is required")
	}
	if strings.TrimSpace(event.CustomerEmail) == "" {
		return errors.New("order.created customerEmail is required")
	}
	if !validCurrency(event.Currency) {
		return errors.New("order.created currency must be a three-character uppercase code")
	}
	if event.Total < 0 {
		return errors.New("order.created total must not be negative")
	}
	if err := validateItems(event.Items); err != nil {
		return fmt.Errorf("order.created: %w", err)
	}

	return nil
}

func (event OrderCreated) PaymentFails() bool {
	return event.Total > FailureThreshold
}

type PaymentCharged struct {
	OrderID       string  `json:"orderId"`
	PaymentID     string  `json:"paymentId"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	Status        string  `json:"status"`
	CustomerEmail string  `json:"customerEmail"`
	Items         []Item  `json:"items"`
}

func NewPaymentCharged(order OrderCreated) PaymentCharged {
	return PaymentCharged{
		OrderID:       order.OrderID,
		PaymentID:     "pay_" + order.OrderID,
		Amount:        order.Total,
		Currency:      order.Currency,
		Status:        "charged",
		CustomerEmail: order.CustomerEmail,
		Items:         cloneItems(order.Items),
	}
}

func DecodePaymentCharged(value []byte) (PaymentCharged, error) {
	var event PaymentCharged
	if err := json.Unmarshal(value, &event); err != nil {
		return PaymentCharged{}, fmt.Errorf("decode payment.charged: %w", err)
	}

	if err := event.Validate(); err != nil {
		return PaymentCharged{}, err
	}

	return event, nil
}

func (event PaymentCharged) Validate() error {
	if strings.TrimSpace(event.OrderID) == "" {
		return errors.New("payment.charged orderId is required")
	}
	if strings.TrimSpace(event.PaymentID) == "" {
		return errors.New("payment.charged paymentId is required")
	}
	if event.Amount < 0 {
		return errors.New("payment.charged amount must not be negative")
	}
	if !validCurrency(event.Currency) {
		return errors.New("payment.charged currency must be a three-character uppercase code")
	}
	if event.Status != "charged" {
		return errors.New("payment.charged status must be charged")
	}
	if strings.TrimSpace(event.CustomerEmail) == "" {
		return errors.New("payment.charged customerEmail is required")
	}
	if err := validateItems(event.Items); err != nil {
		return fmt.Errorf("payment.charged: %w", err)
	}

	return nil
}

type InventoryReserved struct {
	OrderID       string `json:"orderId"`
	ReservationID string `json:"reservationId"`
	Items         []Item `json:"items"`
}

func NewInventoryReserved(payment PaymentCharged) InventoryReserved {
	return InventoryReserved{
		OrderID:       payment.OrderID,
		ReservationID: "res_" + payment.OrderID,
		Items:         cloneItems(payment.Items),
	}
}

type NotificationSent struct {
	OrderID        string `json:"orderId"`
	NotificationID string `json:"notificationId"`
	Channel        string `json:"channel"`
	Recipient      string `json:"recipient"`
	Template       string `json:"template"`
}

func NewNotificationSent(payment PaymentCharged) NotificationSent {
	return NotificationSent{
		OrderID:        payment.OrderID,
		NotificationID: "ntf_" + payment.OrderID,
		Channel:        "email",
		Recipient:      payment.CustomerEmail,
		Template:       "order-confirmation",
	}
}

type OrderCancelled struct {
	OrderID  string  `json:"orderId"`
	Reason   string  `json:"reason"`
	Total    float64 `json:"total"`
	Currency string  `json:"currency"`
}

func NewOrderCancelled(order OrderCreated) OrderCancelled {
	return OrderCancelled{
		OrderID:  order.OrderID,
		Reason:   "payment_declined",
		Total:    order.Total,
		Currency: order.Currency,
	}
}

func validCurrency(currency string) bool {
	return len(currency) == 3 && strings.ToUpper(currency) == currency
}

func validateItems(items []Item) error {
	if len(items) == 0 {
		return errors.New("items must contain at least one item")
	}
	for index, item := range items {
		if strings.TrimSpace(item.SKU) == "" {
			return fmt.Errorf("items[%d].sku is required", index)
		}
		if item.Quantity <= 0 {
			return fmt.Errorf("items[%d].quantity must be positive", index)
		}
	}

	return nil
}

func cloneItems(items []Item) []Item {
	return append([]Item(nil), items...)
}
