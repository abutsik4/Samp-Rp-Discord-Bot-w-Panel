import { forwardRef } from "react";

/**
 * Input — styled text input with optional icon, error state.
 * Props: standard input props + icon (ReactNode), error (bool), inputSize ('sm')
 */
export const Input = forwardRef(function Input(
  { icon, error, className = "", inputSize, ...props },
  ref
) {
  const cls = `${error ? "input--error" : ""}${inputSize === "sm" ? " input--sm" : ""}${
    className ? ` ${className}` : ""
  }`;

  if (icon) {
    return (
      <div className="input-group">
        {icon}
        <input ref={ref} className={cls} {...props} />
      </div>
    );
  }

  return <input ref={ref} className={cls} {...props} />;
});

/**
 * Select — styled select with optional error state.
 */
export const Select = forwardRef(function Select(
  { error, className = "", ...props },
  ref
) {
  const cls = `${error ? "input--error" : ""}${className ? ` ${className}` : ""}`;
  return <select ref={ref} className={cls} {...props} />;
});

/**
 * SearchInput — text input with search icon + clear button.
 * Props: value, onChange, placeholder, ...inputProps
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  ...props
}) {
  return (
    <div className="input-group">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`input--sm${className ? ` ${className}` : ""}`}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: "" } })}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Toggle — checkbox styled as a toggle switch.
 * Props: label, checked, onChange, ...inputProps
 */
export function Toggle({ label, checked, onChange, id, ...props }) {
  const inputId = id || `toggle-${label?.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label className="toggle-switch" htmlFor={inputId}>
      <input
        type="checkbox"
        id={inputId}
        checked={checked}
        onChange={onChange}
        {...props}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

/**
 * FieldError — small red error text for form fields.
 */
export function FieldError({ children }) {
  if (!children) return null;
  return <span className="form-error">{children}</span>;
}