# Orson roadmap

This roadmap turns the product brief into a sequence of small, testable milestones. Each milestone should leave Orson in a demonstrable state and reduce risk for the next one.

## Guiding approach

- Build one complete order-flow vertical slice before generalizing configuration.
- Keep Kafka code independent from Wails so it can support a CLI later.
- Use simulated events to settle the interface before connecting it to live Kafka data.
- Keep the current run in memory for the MVP.
- Add directories and abstractions only when the milestone needs them.
- Treat scenario files as shareable configuration and captured runs as sensitive local data.

## Start here: define the demo contract

The first implementation PR should define the fixed order-flow contract that every later milestone will use.

Deliverables:

- Document the JSON shape for each demo event.
- Define which service owns each transition.
- Define the rule that chooses the successful or failed branch.
- Define how `x-correlation-id` is copied between events.
- Add `scenarios/successful-order.yaml` with the fixed topics and expected topology.
- Add a matching failed-order fixture or document which payload field triggers failure.

Failure-path decision:

For the MVP demo, `order.cancelled` replaces `payment.charged` when payment fails. The payment service emits one or the other, never both. This keeps `payment.charged` semantically honest without introducing a separate `payment.failed` event.

Done when:

- A developer can read the fixtures and predict every event produced by a successful and failed order.
- No service behavior or event shape is implicit.

## Milestone 1: reproducible Kafka demo system

Build the system Orson will observe before building Kafka support inside Orson.

Deliverables:

- Add a Docker Compose Kafka environment.
- Create the fixed demo topics.
- Add the smallest possible demo services for payment, inventory, notification, and cancellation behavior.
- Copy `x-correlation-id` unchanged to every downstream event.
- Add health checks and deterministic startup behavior.
- Add a simple manual publish script or command for exercising both branches without Orson.

Done when:

- One command starts the complete demo environment.
- Publishing the successful fixture produces the expected success events.
- Publishing the failed fixture produces the expected cancellation branch.
- Reusing a correlation ID makes the entire flow easy to inspect manually.

## Milestone 2: simulated desktop experience

Build the core interaction with fixture data before introducing Kafka timing and connection failures.

Deliverables:

- Create the dense desktop shell and split-pane layout.
- Add a scenario sidebar and active-environment indicator.
- Add publish, stop, replay, and timeline/flow-map controls.
- Add an observed timeline using simulated events.
- Add the fixed SVG order-flow map.
- Add an event inspector for payload, headers, key, partition, offset, and timestamps.
- Show expected events that have not arrived yet.
- Model empty, listening, completed, timed-out, and failed states.

Done when:

- A simulated successful run can be played from start to finish.
- A simulated failed run visibly takes a different branch.
- Selecting an event opens all inspector details.
- Missing expected events remain visible after timeout.

## Milestone 3: Kafka core library

Implement Kafka behavior as plain Go packages with no Wails dependencies.

Suggested packages as they become necessary:

```text
internal/kafka
internal/correlation
internal/run
```

Deliverables:

- Add franz-go.
- Define connection and message models.
- Connect to the demo broker and verify metadata access.
- Read current end offsets for watched topic partitions.
- Publish a JSON record with headers.
- Capture records without joining or committing offsets to an application consumer group.
- Filter records by the configured correlation header.
- Support context cancellation and capture timeout.

Done when:

- Go tests cover correlation matching and run-state behavior.
- An integration test or small temporary command can publish and capture one correlated event against the demo environment.
- Kafka packages do not import Wails.

## Milestone 4: first live vertical slice

Connect the desktop app to one hardcoded live order scenario.

Run sequence:

1. Resolve watched topic partitions.
2. Record their current end offsets.
3. Start all readers from those offsets.
4. Confirm the run is ready.
5. Generate a new correlation ID.
6. Publish `order.created`.
7. Stream matching records to the frontend.
8. Stop on timeout, cancellation, or completion.

Deliverables:

- Add a Go run coordinator.
- Expose the minimum Wails methods for connect, start, and stop.
- Emit `run:ready`, `run:message`, `run:timeout`, `run:error`, and `run:completed` events.
- Replace the simulated event source without rewriting the UI state model.
- Clearly display the active Kafka connection and environment.

Done when:

- Clicking publish starts readers before sending the root event.
- Live correlated events appear in the desktop UI.
- Unrelated records are ignored.
- Stopping or timing out cleans up every reader.

## Milestone 5: complete timeline, flow map, and inspection

Turn the live vertical slice into the primary debugging experience.

Deliverables:

- Order the observed timeline by local observation time.
- Light up configured flow-map nodes as events arrive.
- Distinguish observed, waiting, missing, and failed states.
- Show Kafka and local timestamps without implying proven causality.
- Complete payload, header, key, partition, and offset inspection.
- Add JSON formatting and copy actions.
- Preserve keyboard focus and reduced-motion behavior.

Done when:

- The same live run is understandable from either timeline or flow-map view.
- A developer can inspect every Kafka detail listed in the product brief.
- Timeout behavior clearly identifies missing expected events.

## Milestone 6: edit and replay

Deliverables:

- Add a root JSON payload editor and validation.
- Allow replay only from the root-event configuration.
- Generate a new correlation ID for every replay.
- Keep separate run state so records from two runs cannot mix.
- Never offer to republish captured downstream records.

Done when:

- Changing the fixture’s failure field and replaying produces the alternate branch.
- The previous and current correlation IDs are distinct.
- Invalid JSON cannot be published.

## Milestone 7: local YAML scenarios

Add reusable configuration only after the hardcoded vertical slice works.

Suggested package:

```text
internal/scenario
```

Deliverables:

- Define the scenario model and validation rules.
- Load and save human-readable YAML.
- Add native open and save dialogs through Wails.
- Support root topic, watched topics, correlation header, payload, timeout, and expected topology.
- Ensure credentials and captured run data are never serialized into scenarios.

Done when:

- The included order scenario opens, runs, edits, replays, and saves.
- A saved scenario has a clean, reviewable Git diff.
- Malformed scenarios produce useful validation errors.

## Milestone 8: general configuration

Replace remaining hardcoded demo assumptions without expanding beyond MVP scope.

Deliverables:

- Configure one Kafka connection.
- Select a root topic and watched topics.
- Configure the correlation-header name and capture timeout.
- Render any scenario-defined fixed topology using plain SVG.
- Handle unavailable brokers, missing topics, authorization errors, and partial captures.
- Keep credentials in environment variables during the early MVP.

Done when:

- A developer can point Orson at a non-demo local or staging Kafka environment.
- No order-specific topic name remains in runtime code.
- Connection and capture failures are actionable and do not lose the current scenario edits.

## Milestone 9: MVP hardening and validation

Deliverables:

- Test the complete successful and failed demo paths repeatedly.
- Audit reader cleanup, offset behavior, and correlation isolation.
- Review payload handling for accidental persistence or logging.
- Finish empty, loading, failure, and timeout states.
- Add the Orson application icon and packaging metadata.
- Document local setup and the demo flow.
- Put the app in front of Kafka developers and record where the workflow is confusing.

Done when:

- A new developer can run the documented demo without help.
- The full MVP success condition in `PROJECT.md` works reliably.
- Feedback confirms that Orson answers “what happened after I published this event?” faster than topic-by-topic inspection.

## After the MVP

Consider these only after real-user validation:

- SQLite run history
- run comparison and diffing
- Kafka keys or JSON paths as correlation methods
- Schema Registry, Avro, or Protobuf
- OpenTelemetry context
- editable or dynamic graphs
- assertions and CI use cases
- additional brokers

## Recommended issue order

Create issues in this order and keep each one independently reviewable:

1. Define demo event contracts and resolve the failure topology.
2. Add the successful and failed scenario fixtures.
3. Add Kafka Compose infrastructure and topic initialization.
4. Add the demo services and manual verification command.
5. Build the simulated desktop shell and run-state model.
6. Add the simulated timeline and event inspector.
7. Add the fixed simulated flow map and timeout states.
8. Implement the independent Go Kafka client, producer, and capture reader.
9. Add the live run coordinator and Wails event bridge.
10. Replace simulated events with the live demo flow.
11. Add root-payload editing and replay.
12. Add YAML scenario loading and saving.
13. Generalize connection, topic, header, timeout, and topology configuration.
14. Harden, package, document, and validate the MVP.
