import { useId, useState, type FormEvent } from 'react';
import { Modal, ModalActions, ModalButton } from '../../../components/Modal';

export type TopologyTopicDialogMode = 'add-root' | 'add-watched' | 'rename-root' | 'rename-watched';

interface TopologyTopicDialogProps {
  mode: TopologyTopicDialogMode;
  initialValue?: string;
  onClose: () => void;
  onSubmit: (name: string) => string | null;
}

const dialogCopy: Record<
  TopologyTopicDialogMode,
  { title: string; description: string; submitLabel: string }
> = {
  'add-root': {
    title: 'Add root topic',
    description: 'The root topic is where Orson publishes the starting event.',
    submitLabel: 'Add root topic',
  },
  'add-watched': {
    title: 'Add watched topic',
    description: 'Add a downstream topic now, then connect it in the graph.',
    submitLabel: 'Add topic',
  },
  'rename-root': {
    title: 'Rename root topic',
    description: 'Every topology connection using this topic will be updated.',
    submitLabel: 'Rename topic',
  },
  'rename-watched': {
    title: 'Rename watched topic',
    description: 'Every topology connection using this topic will be updated.',
    submitLabel: 'Rename topic',
  },
};

export function TopologyTopicDialog({
  mode,
  initialValue = '',
  onClose,
  onSubmit,
}: TopologyTopicDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const errorId = useId();
  const copy = dialogCopy[mode];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = onSubmit(value);
    if (nextError === null) onClose();
    else setError(nextError);
  };

  return (
    <Modal
      open
      title={copy.title}
      description={copy.description}
      onClose={onClose}
      footer={
        <ModalActions>
          <ModalButton type="button" onClick={onClose}>
            Cancel
          </ModalButton>
          <ModalButton type="submit" form="topology-topic-form" tone="primary">
            {copy.submitLabel}
          </ModalButton>
        </ModalActions>
      }
    >
      <form className="topology-topic-dialog" id="topology-topic-form" onSubmit={submit}>
        <label>
          <span>Topic name</span>
          <input
            autoFocus
            value={value}
            aria-invalid={error !== ''}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
          />
        </label>
        {error ? (
          <p id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
