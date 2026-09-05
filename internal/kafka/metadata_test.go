package kafka

import (
	"reflect"
	"testing"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func TestTopicMetadataRequestDisablesAutoCreation(t *testing.T) {
	names := []string{"root", "watch"}
	request := topicMetadataRequest(names)
	if request.AllowAutoTopicCreation {
		t.Fatal("metadata request allows topic auto-creation")
	}
	var got []string
	for _, topic := range request.Topics {
		if topic.Topic == nil {
			t.Fatal("metadata request contains an unnamed topic")
		}
		got = append(got, *topic.Topic)
	}
	if !reflect.DeepEqual(got, names) {
		t.Fatalf("metadata request topics = %v, want %v", got, names)
	}
}

func TestTopicMetadataResults(t *testing.T) {
	for _, test := range []struct {
		name        string
		topic       kmsg.MetadataResponseTopic
		omit        bool
		missing     bool
		unavailable bool
	}{
		{name: "exists", topic: kmsg.MetadataResponseTopic{Partitions: []kmsg.MetadataResponseTopicPartition{{Partition: 0}}}},
		{name: "missing", topic: kmsg.MetadataResponseTopic{ErrorCode: kerr.UnknownTopicOrPartition.Code}, missing: true},
		{name: "authorization", topic: kmsg.MetadataResponseTopic{ErrorCode: kerr.TopicAuthorizationFailed.Code}, unavailable: true},
		{name: "broker", topic: kmsg.MetadataResponseTopic{ErrorCode: kerr.BrokerNotAvailable.Code}, unavailable: true},
		{name: "partition", topic: kmsg.MetadataResponseTopic{Partitions: []kmsg.MetadataResponseTopicPartition{{ErrorCode: kerr.LeaderNotAvailable.Code}}}, unavailable: true},
		{name: "omitted", omit: true, unavailable: true},
		{name: "no partitions", unavailable: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			var topics []kmsg.MetadataResponseTopic
			if !test.omit {
				topicName := "configured"
				test.topic.Topic = &topicName
				topics = append(topics, test.topic)
			}
			results := topicMetadataResults(topics, []string{"configured"})
			if len(results) != 1 || results[0].Name != "configured" || results[0].Missing != test.missing || (results[0].Err != nil) != test.unavailable {
				t.Fatalf("results = %+v", results)
			}
		})
	}
}
