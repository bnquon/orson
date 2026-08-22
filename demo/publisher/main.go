package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"

	"orson/demo/internal/events"
	"orson/demo/internal/worker"
)

func main() {
	brokerValue := flag.String("brokers", "localhost:9092", "comma-separated Kafka brokers")
	fixturePath := flag.String("file", "demo/fixtures/successful-order.json", "root-event JSON fixture")
	correlationID := flag.String("correlation-id", "", "correlation ID; generated when omitted")
	timeout := flag.Duration("timeout", 10*time.Second, "publish timeout")
	flag.Parse()

	if err := publish(*brokerValue, *fixturePath, *correlationID, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "publish demo order:", err)
		os.Exit(1)
	}
}

func publish(brokerValue string, fixturePath string, correlationID string, timeout time.Duration) error {
	value, err := os.ReadFile(fixturePath)
	if err != nil {
		return fmt.Errorf("read fixture: %w", err)
	}

	order, err := events.DecodeOrderCreated(value)
	if err != nil {
		return err
	}
	value, err = json.Marshal(order)
	if err != nil {
		return fmt.Errorf("encode order.created: %w", err)
	}

	if strings.TrimSpace(correlationID) == "" {
		correlationID, err = newCorrelationID()
		if err != nil {
			return err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	client, err := kgo.NewClient(kgo.SeedBrokers(worker.BrokersFromString(brokerValue)...))
	if err != nil {
		return fmt.Errorf("create Kafka producer: %w", err)
	}
	defer client.Close()

	record := &kgo.Record{
		Topic: events.TopicOrderCreated,
		Key:   []byte(order.OrderID),
		Value: value,
		Headers: []kgo.RecordHeader{
			{Key: events.ContentTypeHeader, Value: []byte(events.JSONContentType)},
			{Key: events.CorrelationHeader, Value: []byte(correlationID)},
		},
	}
	result := client.ProduceSync(ctx, record)
	if err := result.FirstErr(); err != nil {
		return fmt.Errorf("publish order.created: %w", err)
	}

	fmt.Printf(
		"published order.created key=%s correlation=%s total=%.2f\n",
		order.OrderID,
		correlationID,
		order.Total,
	)
	return nil
}

func newCorrelationID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate correlation ID: %w", err)
	}
	return "corr_" + hex.EncodeToString(bytes), nil
}
