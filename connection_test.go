package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
)

func TestAppConnectNormalizesRequest(t *testing.T) {
	connection := &fakeKafkaConnection{}
	connector := &fakeKafkaConnector{connections: []KafkaConnection{connection}}
	app := newApp(connector)
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	response := app.Connect(api.ConnectionRequest{
		Name:               " Local Kafka ",
		Brokers:            []string{" localhost:9092 ", " broker.example:19092 "},
		ClientID:           " orson ",
		DialTimeoutSeconds: 5,
	})
	if !response.OK {
		t.Fatalf("Connect() failed: %+v", response.Error)
	}

	if got := connector.configs[0].Brokers; len(got) != 2 || got[0] != "localhost:9092" || got[1] != "broker.example:19092" {
		t.Fatalf("connector brokers = %v, want normalized brokers", got)
	}
	if connector.configs[0].ClientID != "orson" {
		t.Fatalf("connector client ID = %q, want %q", connector.configs[0].ClientID, "orson")
	}
	if response.Data == nil || response.Data.Active == nil {
		t.Fatal("Connect() returned no active connection")
	}
	if response.Data.Active.Name != "Local Kafka" {
		t.Fatalf("active connection name = %q, want %q", response.Data.Active.Name, "Local Kafka")
	}
}

func TestAppFailedReconnectPreservesActiveConnection(t *testing.T) {
	active := &fakeKafkaConnection{}
	connector := &fakeKafkaConnector{
		connections: []KafkaConnection{active},
		errors:      []error{nil, errors.New("dial tcp: connection refused")},
	}
	app := newApp(connector)
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	request := validConnectionRequest("Local Kafka")
	if response := app.Connect(request); !response.OK {
		t.Fatalf("initial Connect() failed: %+v", response.Error)
	}

	failed := app.Connect(validConnectionRequest("Remote Kafka"))
	if failed.OK {
		t.Fatal("failed reconnect returned OK")
	}
	if failed.Error == nil || failed.Error.Code != "kafka_connection_failed" {
		t.Fatalf("failed reconnect error = %+v, want kafka_connection_failed", failed.Error)
	}
	if active.isClosed() {
		t.Fatal("failed reconnect closed the active connection")
	}

	status := app.GetConnectionStatus()
	if status.Data == nil || status.Data.Active == nil {
		t.Fatal("failed reconnect removed the active connection")
	}
	if status.Data.Active.Name != "Local Kafka" {
		t.Fatalf("active connection name = %q, want %q", status.Data.Active.Name, "Local Kafka")
	}
	if status.Data.LatestAttempt.Status != api.ConnectionStatusFailed {
		t.Fatalf("latest attempt status = %q, want %q", status.Data.LatestAttempt.Status, api.ConnectionStatusFailed)
	}
}

func TestAppRejectsConnectionChangesDuringRun(t *testing.T) {
	readStarted := make(chan struct{})
	releaseRead := make(chan struct{})
	active := &fakeKafkaConnection{
		readFromOffsets: func(context.Context, []kafka.PartitionOffset, func(kafka.Record) error) error {
			close(readStarted)
			<-releaseRead
			return context.Canceled
		},
	}
	connector := &fakeKafkaConnector{connections: []KafkaConnection{active}}
	app := newApp(connector)
	app.startup(context.Background())
	defer app.shutdown(context.Background())

	if response := app.Connect(validConnectionRequest("Local Kafka")); !response.OK {
		t.Fatalf("Connect() failed: %+v", response.Error)
	}

	runDone := make(chan api.RunResponse, 1)
	go func() {
		runDone <- app.Run(api.RunRequest{
			RootTopic:             "order.created",
			WatchedTopics:         []string{"payment.charged"},
			CaptureTimeoutSeconds: 5,
		})
	}()

	select {
	case <-readStarted:
	case <-time.After(time.Second):
		t.Fatal("run did not reach capture")
	}

	disconnect := app.Disconnect()
	if disconnect.Error == nil || disconnect.Error.Code != connectionBusyCode {
		t.Fatalf("Disconnect() error = %+v, want %q", disconnect.Error, connectionBusyCode)
	}

	connect := app.Connect(validConnectionRequest("Replacement"))
	if connect.Error == nil || connect.Error.Code != connectionBusyCode {
		t.Fatalf("Connect() error = %+v, want %q", connect.Error, connectionBusyCode)
	}
	if connector.callCount() != 1 {
		t.Fatalf("connector call count = %d, want 1", connector.callCount())
	}

	close(releaseRead)
	select {
	case <-runDone:
	case <-time.After(time.Second):
		t.Fatal("run did not finish after capture release")
	}

	if response := app.Disconnect(); !response.OK {
		t.Fatalf("Disconnect() after run failed: %+v", response.Error)
	}
	if !active.isClosed() {
		t.Fatal("Disconnect() did not close the active connection")
	}
}

func TestAppShutdownWaitsForActiveRunBeforeClosingConnection(t *testing.T) {
	readStarted := make(chan struct{})
	active := &fakeKafkaConnection{
		readFromOffsets: func(ctx context.Context, _ []kafka.PartitionOffset, _ func(kafka.Record) error) error {
			close(readStarted)
			<-ctx.Done()
			return ctx.Err()
		},
	}
	connector := &fakeKafkaConnector{connections: []KafkaConnection{active}}
	app := newApp(connector)
	app.startup(context.Background())

	if response := app.Connect(validConnectionRequest("Local Kafka")); !response.OK {
		t.Fatalf("Connect() failed: %+v", response.Error)
	}

	go app.Run(api.RunRequest{
		RootTopic:             "order.created",
		WatchedTopics:         []string{"payment.charged"},
		CaptureTimeoutSeconds: 5,
	})

	select {
	case <-readStarted:
	case <-time.After(time.Second):
		t.Fatal("run did not reach capture")
	}

	shutdownDone := make(chan struct{})
	go func() {
		app.shutdown(context.Background())
		close(shutdownDone)
	}()

	select {
	case <-shutdownDone:
	case <-time.After(time.Second):
		t.Fatal("shutdown did not wait for and finish the active run")
	}

	if !active.isClosed() {
		t.Fatal("shutdown did not close the active connection")
	}
}

func validConnectionRequest(name string) api.ConnectionRequest {
	return api.ConnectionRequest{
		Name:               name,
		Brokers:            []string{"localhost:9092"},
		ClientID:           "orson",
		DialTimeoutSeconds: 5,
	}
}

type fakeKafkaConnector struct {
	mu          sync.Mutex
	connections []KafkaConnection
	errors      []error
	configs     []kafka.Config
	calls       int
}

func (f *fakeKafkaConnector) Connect(_ context.Context, config kafka.Config) (KafkaConnection, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.configs = append(f.configs, config)
	index := f.calls
	f.calls++

	if index < len(f.errors) && f.errors[index] != nil {
		return nil, f.errors[index]
	}
	if index >= len(f.connections) {
		return nil, errors.New("fake connector has no connection")
	}

	return f.connections[index], nil
}

func (f *fakeKafkaConnector) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

type fakeKafkaConnection struct {
	readFromOffsets func(context.Context, []kafka.PartitionOffset, func(kafka.Record) error) error

	mu     sync.Mutex
	closed bool
}

func (f *fakeKafkaConnection) Close() {
	f.mu.Lock()
	f.closed = true
	f.mu.Unlock()
}

func (f *fakeKafkaConnection) isClosed() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closed
}

func (f *fakeKafkaConnection) ReadEndOffsets(context.Context, []string) ([]kafka.PartitionOffset, error) {
	return []kafka.PartitionOffset{{Topic: "payment.charged", Partition: 0, Offset: 1}}, nil
}

func (f *fakeKafkaConnection) PublishMessage(_ context.Context, message kafka.Message) (kafka.Record, error) {
	return kafka.Record{Message: message, Partition: 0, Offset: 1, Timestamp: time.Now()}, nil
}

func (f *fakeKafkaConnection) ReadFromOffsets(
	ctx context.Context,
	offsets []kafka.PartitionOffset,
	onRecord func(kafka.Record) error,
) error {
	if f.readFromOffsets != nil {
		return f.readFromOffsets(ctx, offsets, onRecord)
	}

	<-ctx.Done()
	return ctx.Err()
}

var _ KafkaConnector = (*fakeKafkaConnector)(nil)
var _ KafkaConnection = (*fakeKafkaConnection)(nil)
