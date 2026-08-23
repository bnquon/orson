package kafka

import (
	"strings"
	"testing"
	"time"
)

func TestConfigNormalizeTrimsBrokerAndClientID(t *testing.T) {
	config := Config{
		Brokers:     []string{" localhost:9092 ", " [::1]:9093 "},
		ClientID:    " orson ",
		DialTimeout: 5 * time.Second,
	}

	normalized := config.Normalize()

	if normalized.ClientID != "orson" {
		t.Fatalf("normalized client ID = %q, want %q", normalized.ClientID, "orson")
	}

	wantBrokers := []string{"localhost:9092", "[::1]:9093"}
	if len(normalized.Brokers) != len(wantBrokers) {
		t.Fatalf("normalized brokers = %v, want %v", normalized.Brokers, wantBrokers)
	}
	for i := range wantBrokers {
		if normalized.Brokers[i] != wantBrokers[i] {
			t.Fatalf("normalized broker %d = %q, want %q", i, normalized.Brokers[i], wantBrokers[i])
		}
	}
}

func TestConfigValidateBrokerAddresses(t *testing.T) {
	tests := []struct {
		name    string
		brokers []string
		want    string
	}{
		{name: "missing brokers", want: "at least one broker"},
		{name: "empty broker", brokers: []string{"   "}, want: "broker address cannot be empty"},
		{name: "missing port", brokers: []string{"localhost"}, want: "host:port"},
		{name: "non numeric port", brokers: []string{"localhost:kafka"}, want: "port from 1 to 65535"},
		{name: "zero port", brokers: []string{"localhost:0"}, want: "port from 1 to 65535"},
		{name: "port too high", brokers: []string{"localhost:65536"}, want: "port from 1 to 65535"},
		{name: "empty host", brokers: []string{":9092"}, want: "host:port"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := (Config{
				Brokers:     test.brokers,
				ClientID:    "orson",
				DialTimeout: time.Second,
			}).Validate()
			if err == nil {
				t.Fatal("Validate() returned nil error")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Validate() error = %q, want it to contain %q", err, test.want)
			}
		})
	}
}

func TestConfigValidateAcceptsMultipleValidBrokers(t *testing.T) {
	err := (Config{
		Brokers:     []string{"localhost:9092", "broker.example:19092", "[::1]:9093"},
		ClientID:    "orson",
		DialTimeout: time.Second,
	}).Validate()
	if err != nil {
		t.Fatalf("Validate() failed for valid brokers: %v", err)
	}
}

func TestConfigValidateRequiresClientIDAndPositiveTimeout(t *testing.T) {
	base := Config{
		Brokers:     []string{"localhost:9092"},
		ClientID:    "orson",
		DialTimeout: time.Second,
	}

	clientIDConfig := base
	clientIDConfig.ClientID = "  "
	if err := clientIDConfig.Validate(); err == nil || !strings.Contains(err.Error(), "client ID") {
		t.Fatalf("Validate() client ID error = %v", err)
	}

	timeoutConfig := base
	timeoutConfig.DialTimeout = 0
	if err := timeoutConfig.Validate(); err == nil || !strings.Contains(err.Error(), "dial timeout") {
		t.Fatalf("Validate() timeout error = %v", err)
	}
}
