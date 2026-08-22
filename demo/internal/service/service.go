package service

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"

	"orson/demo/internal/worker"
)

func Run(name string, group string, inputTopic string, handler worker.Handler) {
	brokerValue := os.Getenv("KAFKA_BROKERS")
	if brokerValue == "" {
		brokerValue = "localhost:9092"
	}

	logger := log.New(os.Stdout, "", log.LstdFlags|log.Lmicroseconds)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	err := worker.Run(ctx, worker.Config{
		Name:       name,
		Brokers:    worker.BrokersFromString(brokerValue),
		Group:      group,
		InputTopic: inputTopic,
		Handle:     handler,
		Logger:     logger,
	})
	if err != nil && !errors.Is(err, context.Canceled) {
		logger.Fatal(err)
	}
}
