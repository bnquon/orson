# Orson

## Status

Early MVP. The product details may change as the idea is validated.

## Product summary

Orson is a local-first desktop app for developing and debugging Kafka event flows.

A developer publishes a root event, then watches related downstream events appear across selected topics. Events are grouped using a shared correlation header and displayed as a timeline or configured flow map.

The core loop is:

1. Configure a root topic and watched topics.
2. Publish a root event.
3. Capture downstream events with the same correlation header.
4. Inspect their payloads, headers, timing, partitions, and offsets.
5. Edit the root payload and replay it.
6. Save the scenario locally and optionally share it through Git.

## Target user

Backend developers working with Kafka-based event-driven systems, primarily in local and staging environments.

The MVP is not intended to be a production monitoring platform or Kafka administration dashboard.

## Core problem

Existing Kafka interfaces show messages topic by topic.

They do not make it easy to answer:

> What happened after I published this event?

Developers often search several topics manually, copy identifiers between tools, inspect payloads separately, and republish events by hand.

## MVP example

The included demo system models an order flow:

```text
order.created
    ├── payment.charged
    │   ├── inventory.reserved
    │   └── notification.sent
    └── order.cancelled
```

A successful order follows the inventory and notification branches.

Editing the order total to trigger a payment failure should produce `order.cancelled`.

The successful-run versus failed-run interaction is the primary demo.

## Correlation model

The MVP supports one correlation method: a Kafka header.

Default header:

```text
x-correlation-id
```

For each run, Orson:

1. Generates a unique correlation ID.
2. Adds it to the root event.
3. Publishes the root event.
4. Collects downstream events containing the same header.

Downstream services are responsible for copying the header when producing new events.

Support for Kafka keys, JSON paths, causation IDs, and OpenTelemetry may be added later.

## Capture behavior

The user configures:

- one root topic
- one or more watched topics
- the correlation header name
- a root payload
- a capture timeout

Before publishing, Orson records the current end offset of every watched topic and begins reading from those positions.

The capture reader must not join, modify, or commit offsets for the application’s existing consumer groups.

Orson only collects new messages whose correlation header matches the current run.

## Timeline and flow map

The timeline shows matching messages in the order they were observed.

The flow map uses a topology explicitly defined by the scenario.

Header correlation only proves that messages belong to the same run. It does not prove that one message directly caused another.

Do not implement automatic causal inference in the MVP.

Missing expected events should remain visible:

```text
✓ order.created
✓ payment.charged
✕ inventory.reserved — timed out
✓ notification.sent
```

## Replay behavior

Replay means publishing the root event again and observing how the real system responds.

Never automatically republish captured downstream events.

Each replay should generate a new correlation ID so results from separate runs do not become mixed.

The user may edit the root payload before replaying.

## Storage

### Scenarios

Reusable scenarios are stored as human-readable YAML files.

Scenario files may contain:

- scenario name
- root topic
- watched topics
- correlation header name
- root payload template
- expected topic topology
- capture timeout
- non-secret settings

Scenario files should be suitable for committing to Git.

Example:

```yaml
name: successful-order

publish:
  topic: order.created
  payload:
    orderId: ord_123
    total: 279

watch:
  - payment.charged
  - inventory.reserved
  - notification.sent
  - order.cancelled

correlation:
  header: x-correlation-id

capture:
  timeout: 10s

topology:
  - from: order.created
    to: payment.charged

  - from: payment.charged
    to: inventory.reserved

  - from: payment.charged
    to: notification.sent

  - from: order.created
    to: order.cancelled
```

### Runs

Captured run data is local-only.

The initial demo may keep the current run in memory. SQLite can be added when run history and comparison are implemented.

Runs must not automatically be committed to Git because message payloads may contain sensitive data.

### Credentials

Credentials must never be written into scenario files.

Eventually, secrets should be stored in the operating system keychain. Environment variables are acceptable during early development.

## Technical stack

- Wails desktop application
- Go backend
- React and TypeScript frontend
- franz-go Kafka client
- YAML scenario files
- SQLite for future run history
- plain SVG for the initial timeline and flow map

Do not add React Flow during the hardcoded MVP.

React Flow can be reconsidered when graphs become dynamic or editable.

## Architecture

The React frontend is responsible for presentation and user interaction.

The Go backend is responsible for:

- Kafka connections
- reading topic metadata and offsets
- publishing records
- capturing records
- correlation filtering
- scenario file access
- run storage
- credential access

Kafka logic should remain independent of Wails so a CLI can reuse it later.

Suggested structure:

```text
orson/
├── main.go
├── app.go
├── wails.json
│
├── internal/
│   ├── kafka/
│   │   ├── client.go
│   │   ├── capture.go
│   │   └── producer.go
│   │
│   ├── correlation/
│   │   └── header.go
│   │
│   ├── scenario/
│   │   ├── model.go
│   │   └── files.go
│   │
│   └── run/
│       ├── model.go
│       └── store.go
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ScenarioSidebar.tsx
│       │   ├── EventTimeline.tsx
│       │   ├── FlowMap.tsx
│       │   └── EventInspector.tsx
│       │
│       ├── pages/
│       │   └── RunPage.tsx
│       │
│       ├── stores/
│       │   └── runStore.ts
│       │
│       └── App.tsx
│
├── scenarios/
│   └── successful-order.yaml
│
└── demo/
    ├── docker-compose.yml
    └── services/
```

Do not create every suggested directory before it is needed.

## Backend/frontend communication

The frontend calls Go methods through Wails:

```text
Connect
StartRun
StopRun
PublishRootEvent
SaveScenario
OpenScenario
```

The Go backend emits updates to the frontend:

```text
run:ready
run:message
run:timeout
run:error
run:completed
```

The frontend must not connect directly to Kafka.

## Product vocabulary

Use these terms consistently:

- **Scenario:** reusable configuration and root-event template
- **Run:** one execution and its captured messages
- **Root event:** event published by the user
- **Watched topic:** downstream topic monitored during a run
- **Replay:** republishing the root event as a new run
- **Expected flow:** user-configured topic connections
- **Observed timeline:** messages actually captured during a run

Do not use “workflow” when “scenario” or “run” is more precise.

## MVP interface

The main interface contains:

- scenario and watched-topic sidebar
- publish and run controls
- timeline and flow-map toggle
- event inspector
- payload and header viewer
- root-event editing
- replay control
- save and open scenario controls

The event inspector should show:

- topic
- payload
- headers
- Kafka key
- partition
- offset
- Kafka timestamp
- locally observed time

## Design direction

Orson should feel like a focused event instrument, not a generic SaaS dashboard.

The visual identity uses an abstract bear symbol constructed from connected nodes and lines.

The bear should be subtle and geometric, not a detailed cartoon mascot.

Suggested palette:

```text
Coal       #15181B
Parchment  #EEE9DE
Ochre      #D68A3A
Lake blue  #4F8390
Fault red  #D45F57
```

Color roles:

- coal for the main workspace
- parchment for primary text
- ochre for active listening and brand moments
- lake blue for selected events and routes
- fault red for missing, failed, or timed-out events

Typography:

- Instrument Sans or another clean sans-serif for interface text
- IBM Plex Mono for topics, headers, payloads, offsets, and timestamps

Use:

- a dense desktop layout
- split-pane navigation and inspection
- restrained semantic colors
- visible keyboard focus
- reduced-motion support
- clear empty, loading, and failure states

Avoid:

- gradients
- excessive cards
- excessive rounded pills
- decorative dashboards
- unnecessary animations
- making every label monospace
- copying Postman’s complexity
- railroad or train branding

The signature visual moment is events lighting up in the timeline or flow map as they arrive.

Useful interface references:

- Bruno for scenario navigation and payload editing
- Chrome DevTools Network panel for inspection
- Jaeger for trace timing
- Beekeeper Studio for the desktop shell

## MVP scope

Include:

- one Kafka connection
- JSON payloads
- root and watched-topic selection
- correlation-header generation and matching
- live capture
- observed timeline
- configured flow map
- event inspector
- root-payload editing
- replay
- local YAML scenario files
- Docker Compose demo system

## Non-goals

Do not include in the initial MVP:

- RabbitMQ or other brokers
- cloud accounts or syncing
- collaborative editing
- production monitoring
- Kafka cluster administration
- historical topic searching
- automatic topic discovery
- automatic causal inference
- Avro or Protobuf
- Schema Registry
- OpenTelemetry integration
- assertions or CI
- AI features
- dynamic graph editing
- session diffing

## Safety requirements

- Start every watched-topic reader before publishing.
- Never consume through an application’s existing consumer group.
- Never automatically replay downstream events.
- Clearly show which Kafka connection and environment are active.
- Do not persist credentials in scenario files.
- Do not claim inferred timing represents proven causality.
- Treat captured payloads as potentially sensitive.
- Generate a new correlation ID for every replay.

## Build order

1. Create a Docker Compose Kafka demo with the fixed order flow.
2. Build the static React interface using simulated events.
3. Connect to Kafka with franz-go.
4. Capture fixed watched topics from their current end offsets.
5. Publish a root event with a generated correlation header.
6. Filter and stream matching events into the interface.
7. Implement the observed timeline and fixed flow map.
8. Add root-event editing and replay.
9. Save and open YAML scenario files.
10. Generalize topic and header configuration.
11. Validate the product with real Kafka developers.
12. Only then consider run history, diffing, schemas, CI, or additional correlation methods.

## MVP success condition

The MVP is successful when a developer can:

1. Open the demo scenario.
2. Publish `order.created`.
3. Watch matching downstream events appear live.
4. Inspect any captured message.
5. Edit the root payload.
6. Replay it as a new run.
7. Observe a different branch.
8. Save the reusable scenario locally.
