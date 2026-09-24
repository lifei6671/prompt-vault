import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

export function Select({ options, value, defaultValue = "", onValueChange, name, placeholder,
  disabled = false, required = false, ariaLabel, triggerId }: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel: string;
  triggerId?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => setInternal(defaultValue), [defaultValue]);
  const current = value ?? internal;
  const selected = options.find((option) => option.value === current);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === current));

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menu.current?.offsetHeight ?? Math.min(320, window.innerHeight / 2);
      const below = window.innerHeight - rect.bottom;
      const top = below >= height || below >= rect.top
        ? rect.bottom + 4 : rect.top - height - 4;
      setPosition({
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8)),
        width: Math.min(Math.max(rect.width, 180), window.innerWidth - 16),
      });
    };
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    place();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    const frame = requestAnimationFrame(() => menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[selectedIndex]?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, selectedIndex]);

  function choose(next: string) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
  }

  return <div className="pv-select">
    {name && <input type="hidden" name={name} value={current} disabled={disabled} />}
    <button ref={trigger} id={triggerId} className="pv-select-trigger" type="button" disabled={disabled}
      aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? id : undefined} aria-required={required || undefined}
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      }}>
      <span className={selected ? "" : "pv-select-placeholder"}>{selected?.label ?? placeholder ?? ""}</span>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    {open && createPortal(<div ref={menu} id={id} className="pv-select-menu" role="listbox"
      aria-label={ariaLabel} style={position}>
      {options.map((option, index) => <button key={option.value} type="button" role="option"
        tabIndex={-1} aria-selected={option.value === current}
        onClick={() => choose(option.value)} onKeyDown={(event) => navigate(event, index)}>
        {option.label}
      </button>)}
    </div>, document.body)}
  </div>;
}
