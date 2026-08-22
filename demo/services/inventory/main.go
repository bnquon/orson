package main

import (
	"orson/demo/internal/events"
	"orson/demo/internal/service"
	"orson/demo/internal/worker"
)

func main() {
	service.Run("inventory-service", "orson-demo-inventory", events.TopicPaymentCharged, handlePayment)
}

func handlePayment(value []byte) (worker.Output, error) {
	payment, err := events.DecodePaymentCharged(value)
	if err != nil {
		return worker.Output{}, err
	}

	return worker.Output{
		Topic: events.TopicInventoryReserved,
		Value: events.NewInventoryReserved(payment),
	}, nil
}
