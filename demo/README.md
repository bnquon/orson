# Orson Kafka demo

This is a real local Kafka event pipeline built specifically for developing and demonstrating Orson. Orson is not part of the pipeline yet; the one-shot publisher stands in for it until live Kafka support is added to the desktop app.

The event behavior and payloads are defined in [EVENTS.md](./EVENTS.md).

## What runs

```text
publisher → order.created → payment service
                               ├── payment.charged
                               │      ├── inventory service → inventory.reserved
                               │      └── notification service → notification.sent
                               └── order.cancelled
```

Docker Compose starts:

- one official Apache Kafka broker in single-node KRaft mode
- a topic-initialization container
- the payment demo service
- the inventory demo service
- the notification demo service

Kafka is available to host applications at `localhost:9092`. Containers use `kafka:19092` internally.

## Start the pipeline

From the repository root:

```bash
docker compose -f demo/compose.yaml up --build
```

Wait until each demo service logs that it is listening.

## Publish the successful flow

In another terminal:

```bash
go run ./demo/publisher -file demo/fixtures/successful-order.json
```

This produces:

```text
order.created
payment.charged
inventory.reserved
notification.sent
```

## Publish the failed flow

```bash
go run ./demo/publisher -file demo/fixtures/failed-order.json
```

This produces:

```text
order.created
order.cancelled
```

The publisher generates a fresh `x-correlation-id` unless one is supplied:

```bash
go run ./demo/publisher \
  -file demo/fixtures/successful-order.json \
  -correlation-id local-check-001
```

## Watch service activity

```bash
docker compose -f demo/compose.yaml logs -f payment inventory notification
```

## Inspect a topic manually

For example, to inspect successful payments:

```bash
docker compose -f demo/compose.yaml exec kafka \
  /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:19092 \
  --topic payment.charged \
  --from-beginning \
  --property print.key=true \
  --property print.headers=true
```

## Stop or reset

Stop the pipeline while retaining Kafka data:

```bash
docker compose -f demo/compose.yaml down
```

Delete the local Kafka volume and start clean:

```bash
docker compose -f demo/compose.yaml down -v
```

The demo is intentionally local-only and uses plaintext Kafka with no authentication. Do not expose port `9092` outside a development machine.
