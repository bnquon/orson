package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
)

type Client struct {
	franz  *kgo.Client
	admin  *kadm.Client
	config Config
}

func Connect(ctx context.Context, config Config) (*Client, error) {
	config = config.Normalize()

	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("validate kafka config: %w", err)
	}

	franz, err := kgo.NewClient(
		kgo.SeedBrokers(config.Brokers...),
		kgo.ClientID(config.ClientID),
		kgo.DialTimeout(config.DialTimeout),
	)

	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}

	if err := franz.Ping(ctx); err != nil {
		franz.Close()
		return nil, fmt.Errorf("connect to kafka brokers: %w", err)
	}

	adm := kadm.NewClient(franz)

	return &Client{
		franz:  franz,
		admin:  adm,
		config: config,
	}, nil
}

func (c *Client) Close() {
	if c == nil || c.franz == nil {
		return
	}

	c.franz.Close()
}
