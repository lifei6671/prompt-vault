import { useEffect, useRef } from "react";
import { exploreHref } from "~/lib/explore";

export type FilterOption = { value: string; label: string };

export function FilterDropdown({ name, label, value, options, url, open, onToggle, onClose }: {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
  url: URL;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = "explore-filter-" + name;
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="filter-dropdown" ref={root}>
      <button ref={trigger} className="filter-chip" type="button" aria-label={label + ": " + selected.label}
        aria-expanded={open} aria-controls={menuId} onClick={onToggle}>
        <span>{label}:</span>
        <strong>{selected.label}</strong>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={menuId} className="filter-menu" hidden={!open}>
        {options.map((option) => (
          <a key={option.value} href={exploreHref(url, name, option.value)}
            aria-current={option.value === value ? "true" : undefined}>
            {option.label}
          </a>
        ))}
      </div>
    </div>
  );
}
