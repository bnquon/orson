package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
)

type Output struct {
	Topic string
	Value any
}

type Handler func(value []byte) (Output, error)

type Config struct {
	Name       string
	Brokers    []string
	Group      string
	InputTopic string
	Handle     Handler
	Logger     *log.Logger
}

func Run(ctx context.Context, config Config) error {
	if err := config.validate(); err != nil {
		return err
	}

	logger := config.Logger
	if logger == nil {
		logger = log.Default()
	}

	client, err := kgo.NewClient(
		kgo.SeedBrokers(config.Brokers...),
		kgo.ClientID(config.Name),
		kgo.ConsumerGroup(config.Group),
		kgo.ConsumeTopics(config.InputTopic),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		kgo.DisableAutoCommit(),
	)
	if err != nil {
		return fmt.Errorf("create %s Kafka client: %w", config.Name, err)
	}
	defer client.Close()

	if err := client.Ping(ctx); err != nil {
		return fmt.Errorf("connect %s to Kafka: %w", config.Name, err)
	}

	logger.Printf("%s listening on %s", config.Name, config.InputTopic)

	for {
		fetches := client.PollFetches(ctx)
		if ctx.Err() != nil {
			return nil
		}
		if fetchErrors := fetches.Errors(); len(fetchErrors) > 0 {
			for _, fetchError := range fetchErrors {
				logger.Printf("%s fetch error: %v", config.Name, fetchError.Err)
			}
			continue
		}

		iterator := fetches.RecordIter()
		for !iterator.Done() {
			input := iterator.Next()
			output, err := config.Handle(input.Value)
			if err != nil {
				logger.Printf(
					"%s rejected %s partition=%d offset=%d: %v",
					config.Name,
					config.InputTopic,
					input.Partition,
					input.Offset,
					err,
				)
				if err := client.CommitRecords(ctx, input); err != nil {
					return fmt.Errorf("%s commit rejected %s record: %w", config.Name, config.InputTopic, err)
				}
				continue
			}

			record, err := NewOutputRecord(input, output)
			if err != nil {
				return fmt.Errorf("%s build output record: %w", config.Name, err)
			}

			if err := client.ProduceSync(ctx, record).FirstErr(); err != nil {
				return fmt.Errorf("%s publish %s: %w", config.Name, output.Topic, err)
			}
			if err := client.CommitRecords(ctx, input); err != nil {
				return fmt.Errorf("%s commit %s record: %w", config.Name, config.InputTopic, err)
			}

			logger.Printf(
				"%s processed %s partition=%d offset=%d -> %s",
				config.Name,
				input.Topic,
				input.Partition,
				input.Offset,
				output.Topic,
			)
		}
	}
}

func NewOutputRecord(input *kgo.Record, output Output) (*kgo.Record, error) {
	if input == nil {
		return nil, errors.New("input record is required")
	}
	if strings.TrimSpace(output.Topic) == "" {
		return nil, errors.New("output topic is required")
	}

	value, err := json.Marshal(output.Value)
	if err != nil {
		return nil, fmt.Errorf("encode output payload: %w", err)
	}

	return &kgo.Record{
		Topic:   output.Topic,
		Key:     append([]byte(nil), input.Key...),
		Value:   value,
		Headers: cloneHeaders(input.Headers),
	}, nil
}

func BrokersFromString(value string) []string {
	parts := strings.Split(value, ",")
	brokers := make([]string, 0, len(parts))
	for _, part := range parts {
		if broker := strings.TrimSpace(part); broker != "" {
			brokers = append(brokers, broker)
		}
	}
	return brokers
}

func (config Config) validate() error {
	if strings.TrimSpace(config.Name) == "" {
		return errors.New("worker name is required")
	}
	if len(config.Brokers) == 0 {
		return errors.New("at least one Kafka broker is required")
	}
	if strings.TrimSpace(config.Group) == "" {
		return errors.New("consumer group is required")
	}
	if strings.TrimSpace(config.InputTopic) == "" {
		return errors.New("input topic is required")
	}
	if config.Handle == nil {
		return errors.New("handler is required")
	}
	return nil
}

func cloneHeaders(headers []kgo.RecordHeader) []kgo.RecordHeader {
	cloned := make([]kgo.RecordHeader, len(headers))
	for index, header := range headers {
		cloned[index] = kgo.RecordHeader{
			Key:   header.Key,
			Value: append([]byte(nil), header.Value...),
		}
	}
	return cloned
}
