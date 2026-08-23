package kafka

import (
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Brokers     []string
	ClientID    string
	DialTimeout time.Duration
}

// DefaultConfig is retained for local development and integration tests.
// The application does not use it to connect during startup.
func DefaultConfig() Config {
	return Config{
		Brokers:     []string{"localhost:9092"},
		ClientID:    "orson",
		DialTimeout: 5 * time.Second,
	}
}

func (c Config) Normalize() Config {
	normalized := c
	normalized.ClientID = strings.TrimSpace(c.ClientID)
	normalized.Brokers = make([]string, len(c.Brokers))

	for i, broker := range c.Brokers {
		normalized.Brokers[i] = strings.TrimSpace(broker)
	}

	return normalized
}

func (c Config) Validate() error {
	if len(c.Brokers) == 0 {
		return errors.New("at least one broker is required")
	}

	for _, broker := range c.Brokers {
		if strings.TrimSpace(broker) == "" {
			return errors.New("broker address cannot be empty")
		}

		host, port, err := net.SplitHostPort(strings.TrimSpace(broker))
		if err != nil || strings.TrimSpace(host) == "" {
			return fmt.Errorf("broker address %q must use host:port format", broker)
		}

		portNumber, err := strconv.Atoi(port)
		if err != nil || portNumber < 1 || portNumber > 65535 {
			return fmt.Errorf("broker address %q must use a port from 1 to 65535", broker)
		}
	}

	if strings.TrimSpace(c.ClientID) == "" {
		return errors.New("client ID cannot be empty")
	}

	if c.DialTimeout <= 0 {
		return errors.New("dial timeout must be positive")
	}

	return nil
}
