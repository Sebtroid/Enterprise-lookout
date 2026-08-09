type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedControlProps<T>) {
  function handleArrowKey(event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    const keyOffsets: Partial<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    };
    const offset = keyOffsets[event.key];
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : offset === undefined
          ? null
          : (optionIndex + offset + options.length) % options.length;

    if (nextIndex === null) return;

    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[nextIndex]?.focus();
    onChange(options[nextIndex].value);
  }

  return (
    <div aria-label={label} role="group" className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1">
      {options.map((option, optionIndex) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleArrowKey(event, optionIndex)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
