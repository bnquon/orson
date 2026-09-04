import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { NavArrowDown, Plus } from 'iconoir-react';
import { createPortal } from 'react-dom';

interface TopologySourceOption {
  value: string;
  label: string;
}

interface TopologySourcePickerProps {
  topicLabel: string;
  options: TopologySourceOption[];
  onSelect: (value: string) => void;
}

export function TopologySourcePicker({ topicLabel, options, onSelect }: TopologySourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pickerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuPosition(null);
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (trigger === null) return;
      const bounds = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(bounds.width, 180), window.innerWidth - 16);
      const estimatedHeight = Math.min(options.length * 29 + 8, window.innerHeight - 16);
      const spaceBelow = window.innerHeight - bounds.bottom;
      const top =
        spaceBelow < estimatedHeight + 8 && bounds.top > estimatedHeight + 8
          ? bounds.top - estimatedHeight - 3
          : bounds.bottom + 3;
      const left = Math.min(bounds.left, window.innerWidth - width - 8);
      setMenuPosition({ top, left: Math.max(8, left), width });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, options.length]);

  const focusOption = (optionValue: string) => {
    window.requestAnimationFrame(() => {
      optionRefs.current.get(optionValue)?.focus();
    });
  };

  const openMenu = () => {
    setMenuPosition(null);
    setOpen(true);
    const firstOption = options[0];
    if (firstOption !== undefined) focusOption(firstOption.value);
  };

  const choose = (nextValue: string) => {
    onSelect(nextValue);
    setMenuPosition(null);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (currentValue: string, direction: number) => {
    const currentIndex = options.findIndex((item) => item.value === currentValue);
    const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + direction));
    const nextOption = options[nextIndex];
    if (nextOption !== undefined) focusOption(nextOption.value);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setMenuPosition(null);
      setOpen(false);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, optionValue: string) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(optionValue, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(optionValue, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const firstOption = options[0];
      if (firstOption !== undefined) focusOption(firstOption.value);
    } else if (event.key === 'End') {
      event.preventDefault();
      const lastOption = options[options.length - 1];
      if (lastOption !== undefined) focusOption(lastOption.value);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(optionValue);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMenuPosition(null);
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="watched-topic-row__source-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        className="watched-topic-row__source"
        type="button"
        disabled={options.length === 0}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Add source to ${topicLabel}`}
        title={
          options.length === 0
            ? 'No additional source topics are available'
            : 'Add another source topic'
        }
        onClick={() => {
          if (open) {
            setMenuPosition(null);
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <Plus width={13} height={13} aria-hidden="true" />
        <span>Add source</span>
        <NavArrowDown width={13} height={13} aria-hidden="true" />
      </button>
      {open && menuPosition !== null
        ? createPortal(
            <div
              className="watched-topic-row__source-menu"
              ref={menuRef}
              role="menu"
              aria-label={`Choose source for ${topicLabel}`}
              style={menuPosition}
            >
              {options.map((item) => (
                <button
                  ref={(element) => {
                    if (element === null) optionRefs.current.delete(item.value);
                    else optionRefs.current.set(item.value, element);
                  }}
                  className="watched-topic-row__source-option"
                  type="button"
                  role="menuitem"
                  key={item.value}
                  onClick={() => choose(item.value)}
                  onKeyDown={(event) => handleOptionKeyDown(event, item.value)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
