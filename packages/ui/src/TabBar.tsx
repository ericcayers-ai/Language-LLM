import type { HTMLAttributes, KeyboardEvent } from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  /** Optional hint for assistive tech / title. */
  description?: string;
}

export interface TabBarProps<T extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}

/** Compact segmented control for product surfaces (side panel, settings). */
export function TabBar<T extends string = string>({
  items,
  value,
  onChange,
  label = "Sections",
  className,
  ...rest
}: TabBarProps<T>) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex((i) => i.id === value);
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = items[(idx + 1) % items.length];
      if (next) onChange(next.id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = items[(idx - 1 + items.length) % items.length];
      if (prev) onChange(prev.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = items[0];
      if (first) onChange(first.id);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = items[items.length - 1];
      if (last) onChange(last.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={["llm-tabs", className].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={item.description}
            className="llm-tabs__tab llm-focus-ring llm-motion-safe"
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
