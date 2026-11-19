import { useId, type InputHTMLAttributes } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className" | "aria-invalid" | "aria-describedby"> & {
  label: string;
  hint?: string;
  /** Takes the place of the hint while the value is wrong. */
  error?: string;
};

/** A label, one text input and one help line. The help line keeps its height, so an error moves nothing. */
export function Field({ label, hint, error, ...input }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
      />
      <p className="field__help" id={helpId} data-error={error ? "" : undefined}>
        {error ?? hint}
      </p>
    </div>
  );
}
