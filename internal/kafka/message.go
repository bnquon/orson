package kafka

import "time"

type Header struct {
	Key   string
	Value []byte
}

type Message struct {
	Topic   string
	Key     []byte
	Value   []byte
	Headers []Header
}

type Record struct {
	Message   Message
	Partition int32
	Offset    int64
	Timestamp time.Time
}
