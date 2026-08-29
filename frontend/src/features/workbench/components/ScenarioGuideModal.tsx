import { useState } from 'react';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';

const SCENARIO_EXAMPLE = `name: order-flow
publish:
  topic: order.created
  payload:
    orderId: ord_123
    customerId: cus_123
watch:
  - payment.charged
  - notification.sent
correlation:
  header: x-correlation-id
capture:
  timeout: 10s
topology:
  - from: order.created
    to: payment.charged
  - from: payment.charged
    to: notification.sent`;

interface ScenarioGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function ScenarioGuideModal({ open, onClose }: ScenarioGuideModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(SCENARIO_EXAMPLE);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <Modal
      open={open}
      title="Scenario YAML guide"
      description="Use this structure when importing or saving a scenario as YAML."
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Close
          </ModalButton>
          <ModalButton
            aria-label="Copy scenario example"
            tone="primary"
            type="button"
            onClick={() => void copyExample()}
          >
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'failed'
                ? 'Copy failed'
                : 'Copy example'}
          </ModalButton>
        </ModalActions>
      }
    >
      <div className="scenario-guide">
        <section>
          <h3>Structure</h3>
          <p>
            A scenario publishes one root event, watches for downstream topics, and captures the
            matching records for a limited time.
          </p>
          <dl className="scenario-guide__fields">
            <div>
              <dt>publish</dt>
              <dd>Root topic and JSON payload to send.</dd>
            </div>
            <div>
              <dt>watch</dt>
              <dd>Topics whose records should be captured.</dd>
            </div>
            <div>
              <dt>correlation</dt>
              <dd>Header used to match related records.</dd>
            </div>
            <div>
              <dt>capture</dt>
              <dd>How long Orson waits for records.</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Topology</h3>
          <p>
            Add one edge for each watched topic. Every watched topic must be reachable from the
            publish topic through the configured <code>from</code> and <code>to</code> edges.
          </p>
        </section>
        <section>
          <h3>Valid example</h3>
          <pre className="scenario-guide__example">
            <code>{SCENARIO_EXAMPLE}</code>
          </pre>
        </section>
      </div>
    </Modal>
  );
}
