package worker

import (
	"encoding/json"
	"testing"

	"github.com/twmb/franz-go/pkg/kgo"
)

func TestNewOutputRecordCopiesTransportMetadata(t *testing.T) {
	input := &kgo.Record{
		Key: []byte("ord_123"),
		Headers: []kgo.RecordHeader{
			{Key: "x-correlation-id", Value: []byte("corr_123")},
			{Key: "content-type", Value: []byte("application/json")},
		},
	}
	output := Output{
		Topic: "payment.charged",
		Value: map[string]string{"orderId": "ord_123"},
	}

	record, err := NewOutputRecord(input, output)
	if err != nil {
		t.Fatalf("NewOutputRecord() error = %v", err)
	}

	if record.Topic != output.Topic || string(record.Key) != "ord_123" {
		t.Fatal("output record did not copy topic and key")
	}
	if len(record.Headers) != len(input.Headers) {
		t.Fatal("output record did not copy every header")
	}

	var payload map[string]string
	if err := json.Unmarshal(record.Value, &payload); err != nil {
		t.Fatalf("decode output payload: %v", err)
	}
	if payload["orderId"] != "ord_123" {
		t.Fatal("output record did not encode the payload")
	}

	record.Headers[0].Value[0] = 'X'
	if string(input.Headers[0].Value) != "corr_123" {
		t.Fatal("output record headers share mutable storage with the input")
	}
}

func TestBrokersFromString(t *testing.T) {
	brokers := BrokersFromString(" kafka:19092, localhost:9092 ,, ")
	if len(brokers) != 2 {
		t.Fatalf("len(BrokersFromString()) = %d, want 2", len(brokers))
	}
	if brokers[0] != "kafka:19092" || brokers[1] != "localhost:9092" {
		t.Fatalf("BrokersFromString() = %v", brokers)
	}
}
