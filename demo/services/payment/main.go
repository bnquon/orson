package main

import (
	"orson/demo/internal/events"
	"orson/demo/internal/service"
	"orson/demo/internal/worker"
)

func main() {
	service.Run("payment-service", "orson-demo-payment", events.TopicOrderCreated, handleOrder)
}

func handleOrder(value []byte) (worker.Output, error) {
	order, err := events.DecodeOrderCreated(value)
	if err != nil {
		return worker.Output{}, err
	}

	if order.PaymentFails() {
		return worker.Output{
			Topic: events.TopicOrderCancelled,
			Value: events.NewOrderCancelled(order),
		}, nil
	}

	return worker.Output{
		Topic: events.TopicPaymentCharged,
		Value: events.NewPaymentCharged(order),
	}, nil
}
