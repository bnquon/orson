# Orson roadmap

This is a directional roadmap, not a strict plan or commitment. Priorities may
change as Orson is used with real Kafka workflows and we learn which parts of
the debugging experience need the most attention.

## Now

- Make local scenario authoring, importing, validation, and saving dependable.
- Make live runs and historical runs easy to understand from the timeline,
  flow graph, and event inspector.
- Improve connection, capture, timeout, and partial-result feedback.
- Keep the local-first workflow safe for payloads, headers, credentials, and
  captured run data.

## Next

- Improve replay and investigation workflows for common Kafka debugging tasks.
- Make topology configuration easier to edit and explain when topics are
  disconnected or ambiguous.
- Expand Kafka connection configuration beyond the current local-development
  setup, including TLS and SASL where they are needed.
- Continue testing against realistic event flows and staging environments.

## Later

- Compare runs and inspect meaningful differences between captures.
- Support more flexible correlation strategies, such as Kafka keys or JSON
  paths.
- Revisit dynamic graph layout and richer graph interaction once real scenarios
  require it.
- Consider additional workspace organization and collaboration features after
  the core debugging loop is validated.

The order is intentionally flexible. Small reliability and usability work can
move ahead of a larger item whenever it improves the core question Orson is
meant to answer: “What happened after I published this event?”
