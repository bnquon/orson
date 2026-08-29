# Scenario examples

These files are bundled examples for Orson and are also useful as starting
points for files imported through the workbench.

## Start here

[`order-flow.yaml`](order-flow.yaml) is the canonical complete example. It
shows a root topic, publish payload, watched topics, correlation settings,
capture timeout, and a branching topology:

```text
order.created
├── payment.charged
│   ├── inventory.reserved
│   └── notification.sent
└── order.cancelled
```

The scenario format and validation rules are documented in
[`docs/scenario-format.md`](../docs/scenario-format.md). The behavior of the
corresponding local Kafka demo is documented in [`demo/EVENTS.md`](../demo/EVENTS.md).

## Checkout examples

The [`checkout/`](checkout) directory contains smaller branch-focused fixtures:

- [`successful-order.yaml`](checkout/successful-order.yaml) watches the payment,
  inventory, and notification path.
- [`failed-order.yaml`](checkout/failed-order.yaml) watches the cancellation
  path.

The demo payment service chooses the branch from the order total: totals up to
`500` produce `payment.charged`, while totals above `500` produce
`order.cancelled`. See [`demo/README.md`](../demo/README.md) for starting the
pipeline and publishing the matching fixtures.

## Creating your own

Copy the structure of `order-flow.yaml`, then change the scenario name, root
topic, payload, watched topics, and topology edges for your event flow. Every
watched topic should be connected by a valid topology edge so it can appear in
the graph without a disconnected-topic warning.

Scenario files should contain reusable configuration only. Keep credentials,
tokens, and captured run data out of them.
