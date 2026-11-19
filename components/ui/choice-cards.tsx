"use client";

import { useId } from "react";

export type Choice<Value extends string> = {
  value: Value;
  title: string;
  hint: string;
};

type ChoiceCardsProps<Value extends string> = {
  legend: string;
  name: string;
  options: readonly Choice<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  disabled?: boolean;
};

/**
 * A radio group drawn as cards. The group is a div, not a label: each card is the label of its
 * own radio, so a press on a card selects that card only.
 */
export function ChoiceCards<Value extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: ChoiceCardsProps<Value>) {
  const legendId = useId();

  return (
    <div className="choices" role="radiogroup" aria-labelledby={legendId}>
      <span className="choices__legend" id={legendId}>
        {legend}
      </span>
      <div className="choices__list">
        {options.map((option) => (
          <label className="choice" key={option.value}>
            <input
              className="choice__input"
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="choice__title">{option.title}</span>
            <span className="choice__hint">{option.hint}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
