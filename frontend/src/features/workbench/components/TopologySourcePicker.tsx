import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, NavArrowDown } from 'iconoir-react';
import { createPortal } from 'react-dom';

interface TopologySourceOption {
  value: string;
  label: string;
}

interface TopologySourcePickerProps {
  topicLabel: string;
  value: string;
  options: TopologySourceOption[];
  onChange: (value: string) => void;
}

export function TopologySourcePicker({
  topicLabel,
  value,
  options,
  onChange,
}: TopologySourcePickerProps) {
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
  const menuItems = [{ value: '', label: 'Not connected' }, ...options];
  const selected = menuItems.find((item) => item.value === value) ?? menuItems[0];

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
      const estimatedHeight = Math.min(menuItems.length * 29 + 8, window.innerHeight - 16);
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
  }, [menuItems.length, open]);

  const focusOption = (optionValue: string) => {
    window.requestAnimationFrame(() => {
      (optionRefs.current.get(optionValue) ?? optionRefs.current.get(''))?.focus();
    });
  };

  const openMenu = () => {
    setMenuPosition(null);
    setOpen(true);
    focusOption(value);
  };

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setMenuPosition(null);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (currentValue: string, direction: number) => {
    const currentIndex = menuItems.findIndex((item) => item.value === currentValue);
    const nextIndex = Math.max(0, Math.min(menuItems.length - 1, currentIndex + direction));
    focusOption(menuItems[nextIndex]?.value ?? '');
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
      focusOption(menuItems[0]?.value ?? '');
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(menuItems[menuItems.length - 1]?.value ?? '');
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
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Connect ${topicLabel} from`}
        title="Choose the upstream topic for this watched topic"
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
        <span>{selected?.label ?? 'Not connected'}</span>
        <NavArrowDown width={13} height={13} aria-hidden="true" />
      </button>
      {open && menuPosition !== null
        ? createPortal(
            <div
              className="watched-topic-row__source-menu"
              ref={menuRef}
              role="menu"
              aria-label="Connect from"
              style={menuPosition}
            >
              {menuItems.map((item) => (
                <button
                  ref={(element) => {
                    if (element === null) optionRefs.current.delete(item.value);
                    else optionRefs.current.set(item.value, element);
                  }}
                  className={`watched-topic-row__source-option ${item.value === value ? 'watched-topic-row__source-option--selected' : ''}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item.value === value}
                  key={item.value || 'none'}
                  onClick={() => choose(item.value)}
                  onKeyDown={(event) => handleOptionKeyDown(event, item.value)}
                >
                  <span>{item.label}</span>
                  {item.value === value ? (
                    <Check width={13} height={13} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
