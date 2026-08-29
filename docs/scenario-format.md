# Scenario YAML format

Orson scenarios are local YAML files that describe one root event and the
topics Orson should observe afterward. They are validated when imported or
saved and can be committed to Git as shareable development configuration.

The complete canonical example is
[`scenarios/order-flow.yaml`](../scenarios/order-flow.yaml). Start there when
creating a scenario. The checkout fixtures show smaller successful and failed
branches:

- [`scenarios/checkout/successful-order.yaml`](../scenarios/checkout/successful-order.yaml)
- [`scenarios/checkout/failed-order.yaml`](../scenarios/checkout/failed-order.yaml)

## Shape

A scenario uses these top-level fields:

```yaml
name: my-scenario

publish:
  topic: events.started
  key: optional-key
  headers:
    - key: content-type
      value: application/json
  payload:
    example: value

watch:
  - events.completed

correlation:
  header: x-correlation-id

capture:
  timeout: 10s

topology:
  - from: events.started
    to: events.completed
```

The snippet shows the file shape, while the bundled scenario remains the
source of truth for a complete working example.

## Fields

| Field                | Required    | Description                                                                                                                  |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `name`               | Yes         | Display name for the scenario.                                                                                               |
| `publish.topic`      | Yes         | Root topic where Orson publishes the event.                                                                                  |
| `publish.key`        | No          | Kafka message key.                                                                                                           |
| `publish.headers`    | No          | Additional headers to publish. Each header has a `key` and `value`. If omitted, Orson uses `content-type: application/json`. |
| `publish.payload`    | Yes         | JSON-compatible YAML describing the root event payload.                                                                      |
| `watch`              | Yes         | One or more downstream topics to capture. Do not repeat the publish topic here.                                              |
| `correlation.header` | Recommended | Header used to associate records with the current run. Orson defaults to `x-correlation-id` if it is missing.                |
| `capture.timeout`    | Yes         | Positive duration in whole seconds, up to `300s`.                                                                            |
| `topology`           | No          | Ordered `from`/`to` edges used to render the flow graph and connect watched topics.                                          |

The correlation header is managed by Orson for each run. Do not add that same
header to `publish.headers`; Orson will reject the scenario because it would
conflict with the generated correlation ID.

## Topology and watched topics

`watch` controls which topics Orson reads. `topology` controls how those topics
are represented in the flow graph. Every topology edge must connect the
publish topic or a watched topic, and valid edges must not form a cycle.

Topology edges are optional. Each edge must reference the publish topic or a
watched topic, and valid edges must not form a cycle. Orson warns when a
watched topic has no valid edge, but it still retains that topic for capture.
For a connected flow graph, connect watched topics directly or through a chain
starting at the publish topic. A disconnected watched-to-watched component can
still be captured, but it will not be connected to the root in the graph.

The topology is not automatic causal inference. A shared correlation header
shows that records belong to the same run; it does not prove that one record
directly caused another.

## Payloads, headers, and durations

Payloads use YAML syntax but must convert cleanly to JSON. Objects, arrays,
strings, numbers, booleans, and `null` are supported. Quote strings when YAML
could interpret their value as another type.

Header names and values are strings. Keep credentials, tokens, and other
secrets out of scenario files. Captured payloads and headers belong to local
run history, not reusable scenario configuration.

Timeouts use Go duration syntax such as `5s`, `10s`, or `2m`. Orson currently
requires a whole number of seconds and limits the value to five minutes.

## Validation behavior

Imported files must contain exactly one YAML document and only supported fields.
Unknown fields, malformed YAML, missing required values, duplicate watched
topics, cycles, and invalid payloads are reported during validation.

Topology entries with missing topics, unknown topics, self-references, or
duplicates produce warnings and are not used as valid graph edges. The app
preserves the configured entries when saving so warning-bearing files can be
reviewed and corrected rather than silently rewritten.

## Saving and sharing

Use the workbench form to edit a scenario and `Save as` to write a local `.yaml`
or `.yml` file. Orson writes canonical field ordering and formatting through
the existing serializer. A newly created scenario remains frontend-only until
the save succeeds.

For a new scenario, begin with the bundled example, copy its structure, and
replace the topics and payload with values for your system. Do not add folder
metadata or connection credentials to the file.
