package main

import (
	"log"
	"time"

	"orson/internal/api"
	"orson/internal/kafka"
	"orson/internal/run"
)

// Run executes one root event and captures matching downstream records.
// Expected failures are returned in the response envelope so the Wails
// Promise can resolve normally instead of rejecting for application errors.
func (a *App) Run(request api.RunRequest) api.RunResponse {
	if err := request.Validate(); err != nil {
		return api.RunFailure(api.NewError(
			"invalid_request",
			"The run configuration is invalid.",
			err.Error(),
			false,
		))
	}

	coordinator, requestContext, apiErr := a.beginRun()
	if apiErr != nil {
		return api.RunFailure(apiErr)
	}
	defer a.endRun()

	result, err := coordinator.Run(requestContext, run.RunRequest{
		RootMessage: kafka.Message{
			Topic:   request.RootTopic,
			Key:     []byte(request.MessageKey),
			Value:   []byte(request.Payload),
			Headers: toKafkaHeaders(request.Headers),
		},
		WatchedTopics:  request.WatchedTopics,
		CaptureTimeout: time.Duration(request.CaptureTimeoutSeconds) * time.Second,
	})
	if err != nil {
		log.Printf("run failed: %v", err)
		return api.RunFailure(api.NewError(
			"run_failed",
			"The event run could not be completed.",
			err.Error(),
			true,
		))
	}

	return api.RunSuccess(toRunData(result))
}

func toKafkaHeaders(headers []api.Header) []kafka.Header {
	converted := make([]kafka.Header, 0, len(headers))
	for _, header := range headers {
		converted = append(converted, kafka.Header{
			Key:   header.Key,
			Value: []byte(header.Value),
		})
	}

	return converted
}

func toRunData(result run.RunResult) api.RunData {
	records := make([]api.EventRecord, 0, len(result.Records))
	for _, record := range result.Records {
		records = append(records, toAPIRecord(record))
	}

	return api.RunData{
		CorrelationID: string(result.CorrelationID),
		RootRecord:    toAPIRecord(result.RootRecord),
		Records:       records,
	}
}

func toAPIRecord(record kafka.Record) api.EventRecord {
	headers := make([]api.Header, 0, len(record.Message.Headers))
	for _, header := range record.Message.Headers {
		headers = append(headers, api.Header{
			Key:   header.Key,
			Value: string(header.Value),
		})
	}

	return api.EventRecord{
		Topic:     record.Message.Topic,
		Key:       string(record.Message.Key),
		Value:     string(record.Message.Value),
		Headers:   headers,
		Partition: record.Partition,
		Offset:    record.Offset,
		Timestamp: record.Timestamp.UTC().Format(time.RFC3339Nano),
	}
}
