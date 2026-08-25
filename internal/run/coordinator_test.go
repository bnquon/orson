package run

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"orson/internal/kafka"
)

func TestCoordinatorEmitsOrderedEventsAndFiltersUnrelatedRecords(t *testing.T) {
	client := newEventKafkaClient()
	coordinator, err := NewCoordinator(client)
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}

	events := runCoordinator(t, coordinator, RunRequest{
		RunID: RunID("run-1"),
		RootMessage: kafka.Message{
			Topic: "order.created",
			Value: []byte("root"),
		},
		WatchedTopics:  []string{"payment.charged"},
		CaptureTimeout: 30 * time.Millisecond,
	})

	if len(events) != 5 {
		t.Fatalf("event count = %d, want 5", len(events))
	}
	wantKinds := []EventKind{EventStarted, EventReady, EventRootPublished, EventMessage, EventFinished}
	for index, event := range events {
		if event.Kind != wantKinds[index] {
			t.Errorf("event %d kind = %q, want %q", index, event.Kind, wantKinds[index])
		}
		if event.Sequence != uint64(index+1) {
			t.Errorf("event %d sequence = %d, want %d", index, event.Sequence, index+1)
		}
	}
	if events[3].Record == nil || events[3].Record.Message.Topic != "payment.charged" {
		t.Fatalf("message event = %+v, want payment.charged", events[3].Record)
	}
	if events[4].Status != RunStatusTimedOut {
		t.Fatalf("finished status = %q, want timed_out", events[4].Status)
	}
	if events[4].Failure == nil || events[4].Failure.Stage != FailureStageTimeout {
		t.Fatalf("finished failure = %+v, want timeout stage", events[4].Failure)
	}
	if len(client.message.Headers) != 1 || client.message.Headers[0].Key != "x-correlation-id" {
		t.Fatalf("published headers = %+v, want default correlation header", client.message.Headers)
	}
}

func TestCoordinatorPublishesAndMatchesConfiguredCorrelationHeader(t *testing.T) {
	client := newEventKafkaClient()
	client.records = func(message kafka.Message) []kafka.Record {
		correlationValue := message.Headers[len(message.Headers)-1].Value
		return []kafka.Record{
			{
				Message: kafka.Message{
					Topic:   "wrong.header",
					Headers: []kafka.Header{{Key: "x-correlation-id", Value: correlationValue}},
				},
				Partition: 0,
				Offset:    11,
			},
			{
				Message: kafka.Message{
					Topic:   "payment.charged",
					Headers: []kafka.Header{{Key: " x-flow-id ", Value: correlationValue}},
				},
				Partition: 0,
				Offset:    12,
			},
		}
	}
	coordinator, err := NewCoordinator(client)
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}

	events := runCoordinator(t, coordinator, RunRequest{
		RunID:             RunID("custom-header-run"),
		RootMessage:       kafka.Message{Topic: "order.created"},
		CorrelationHeader: "  X-Flow-ID  ",
		WatchedTopics:     []string{"payment.charged"},
		CaptureTimeout:    30 * time.Millisecond,
	})

	if len(client.message.Headers) != 1 || client.message.Headers[0].Key != "X-Flow-ID" {
		t.Fatalf("published headers = %+v, want configured casing", client.message.Headers)
	}
	messageEvents := make([]Event, 0)
	for _, event := range events {
		if event.Kind == EventMessage {
			messageEvents = append(messageEvents, event)
		}
	}
	if len(messageEvents) != 1 || messageEvents[0].Record.Message.Topic != "payment.charged" {
		t.Fatalf("message events = %+v, want only custom-header match", messageEvents)
	}
}

func TestCoordinatorGeneratesUniqueCorrelationIDs(t *testing.T) {
	values := make([]string, 0, 2)
	for index := 0; index < 2; index++ {
		client := newEventKafkaClient()
		coordinator, err := NewCoordinator(client)
		if err != nil {
			t.Fatalf("NewCoordinator() failed: %v", err)
		}
		runCoordinator(t, coordinator, RunRequest{
			RunID:          RunID(fmt.Sprintf("run-%d", index)),
			RootMessage:    kafka.Message{Topic: "order.created"},
			WatchedTopics:  []string{"payment.charged"},
			CaptureTimeout: 10 * time.Millisecond,
		})
		values = append(values, string(client.message.Headers[0].Value))
	}
	if values[0] == values[1] {
		t.Fatalf("correlation IDs = %q and %q, want unique values", values[0], values[1])
	}
}

func TestCoordinatorRejectsManagedRootHeader(t *testing.T) {
	coordinator, err := NewCoordinator(newEventKafkaClient())
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}
	err = coordinator.Run(context.Background(), RunRequest{
		RunID: RunID("conflict"),
		RootMessage: kafka.Message{
			Topic:   "order.created",
			Headers: []kafka.Header{{Key: " X-FLOW-ID ", Value: []byte("user-value")}},
		},
		CorrelationHeader: "x-flow-id",
		WatchedTopics:     []string{"payment.charged"},
		CaptureTimeout:    time.Second,
	}, nil)
	if err == nil {
		t.Fatal("Run() accepted a managed root header")
	}
}

func TestCoordinatorCancellationEmitsOneTerminalEvent(t *testing.T) {
	client := newEventKafkaClient()
	client.holdCapture = true
	coordinator, err := NewCoordinator(client)
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	eventsCh := make(chan []Event, 1)
	go func() {
		events := make([]Event, 0)
		_ = coordinator.Run(ctx, RunRequest{
			RunID:          RunID("run-2"),
			RootMessage:    kafka.Message{Topic: "order.created"},
			WatchedTopics:  []string{"payment.charged"},
			CaptureTimeout: time.Second,
		}, func(event Event) { events = append(events, event) })
		eventsCh <- events
	}()

	<-client.ready
	cancel()
	events := <-eventsCh
	if len(events) == 0 || events[len(events)-1].Status != RunStatusCancelled {
		t.Fatalf("events = %+v, want cancelled terminal event", events)
	}
	finished := 0
	for _, event := range events {
		if event.Kind == EventFinished {
			finished++
		}
	}
	if finished != 1 {
		t.Fatalf("finished event count = %d, want 1", finished)
	}
	if events[len(events)-1].Failure == nil || events[len(events)-1].Failure.Stage != FailureStageCancellation {
		t.Fatalf("finished failure = %+v, want cancellation stage", events[len(events)-1].Failure)
	}
}

func TestCoordinatorEmitsPublishFailure(t *testing.T) {
	client := newEventKafkaClient()
	client.publishErr = errors.New("publish failed")
	coordinator, err := NewCoordinator(client)
	if err != nil {
		t.Fatalf("NewCoordinator() failed: %v", err)
	}

	events := runCoordinator(t, coordinator, RunRequest{
		RunID:          RunID("run-3"),
		RootMessage:    kafka.Message{Topic: "order.created"},
		WatchedTopics:  []string{"payment.charged"},
		CaptureTimeout: time.Second,
	})
	finished := events[len(events)-1]
	if finished.Status != RunStatusFailed || finished.Failure == nil || finished.Failure.Stage != FailureStagePublish {
		t.Fatalf("finished event = %+v, want publish failure", finished)
	}
}

func runCoordinator(t *testing.T, coordinator *Coordinator, request RunRequest) []Event {
	t.Helper()
	events := make([]Event, 0)
	if err := coordinator.Run(context.Background(), request, func(event Event) {
		events = append(events, event)
	}); err != nil {
		t.Fatalf("Coordinator.Run() failed: %v", err)
	}
	return events
}

type eventKafkaClient struct {
	ready       chan struct{}
	holdCapture bool
	publishErr  error
	records     func(kafka.Message) []kafka.Record
	published   chan struct{}
	message     kafka.Message
	readyOnce   sync.Once
	publishOnce sync.Once
}

func newEventKafkaClient() *eventKafkaClient {
	return &eventKafkaClient{
		ready:     make(chan struct{}),
		published: make(chan struct{}),
	}
}

func (c *eventKafkaClient) ReadEndOffsets(context.Context, []string) ([]kafka.PartitionOffset, error) {
	return []kafka.PartitionOffset{{Topic: "payment.charged", Partition: 0, Offset: 1}}, nil
}

func (c *eventKafkaClient) PublishMessage(_ context.Context, message kafka.Message) (kafka.Record, error) {
	if c.publishErr != nil {
		return kafka.Record{}, c.publishErr
	}
	c.message = message
	if c.published == nil {
		c.published = make(chan struct{})
	}
	c.publishOnce.Do(func() { close(c.published) })
	return kafka.Record{Message: message, Partition: 0, Offset: 10}, nil
}

func (c *eventKafkaClient) ReadFromOffsets(
	ctx context.Context,
	_ []kafka.PartitionOffset,
	onReady func(),
	onRecord func(kafka.Record) error,
) error {
	onReady()
	c.readyOnce.Do(func() { close(c.ready) })

	if !c.holdCapture {
		select {
		case <-c.published:
		case <-ctx.Done():
			return ctx.Err()
		}
		if err := onRecord(kafka.Record{Message: c.message, Partition: 0, Offset: 10}); err != nil {
			return err
		}
		records := []kafka.Record{{
			Message:   kafka.Message{Topic: "payment.charged", Headers: c.message.Headers},
			Partition: 0,
			Offset:    11,
		}}
		if c.records != nil {
			records = c.records(c.message)
		}
		for _, record := range records {
			if err := onRecord(record); err != nil {
				return err
			}
		}
		<-ctx.Done()
		return ctx.Err()
	}

	<-ctx.Done()
	return ctx.Err()
}

var _ KafkaClient = (*eventKafkaClient)(nil)
