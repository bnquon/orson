package kafka

import (
	"testing"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
)

func TestTopicMetadataResults(t *testing.T) {
	for _, test := range []struct {
		name        string
		topic       kadm.TopicDetail
		omit        bool
		missing     bool
		unavailable bool
	}{
		{name: "exists", topic: kadm.TopicDetail{Partitions: kadm.PartitionDetails{0: {Partition: 0}}}},
		{name: "missing", topic: kadm.TopicDetail{Err: kerr.UnknownTopicOrPartition}, missing: true},
		{name: "authorization", topic: kadm.TopicDetail{Err: kerr.TopicAuthorizationFailed}, unavailable: true},
		{name: "broker", topic: kadm.TopicDetail{Err: kerr.BrokerNotAvailable}, unavailable: true},
		{name: "partition", topic: kadm.TopicDetail{Partitions: kadm.PartitionDetails{0: {Err: kerr.LeaderNotAvailable}}}, unavailable: true},
		{name: "omitted", omit: true, unavailable: true},
		{name: "no partitions", unavailable: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			topics := kadm.TopicDetails{}
			if !test.omit {
				topics["configured"] = test.topic
			}
			results := topicMetadataResults(topics, []string{"configured"})
			if len(results) != 1 || results[0].Name != "configured" || results[0].Missing != test.missing || (results[0].Err != nil) != test.unavailable {
				t.Fatalf("results = %+v", results)
			}
		})
	}
}
