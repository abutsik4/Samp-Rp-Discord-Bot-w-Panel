const map = {
  online:   { variant: "badge--success", label: "Online" },
  offline:  { variant: "badge",          label: "Offline" },
  enabled:  { variant: "badge--success", label: "Enabled" },
  disabled: { variant: "badge",          label: "Disabled" },
  sent:     { variant: "badge--success", label: "Sent" },
  draft:    { variant: "badge",          label: "Draft" },
  active:   { variant: "badge--success", label: "Active" },
  inactive: { variant: "badge",          label: "Inactive" },
  banned:   { variant: "badge--danger",  label: "Banned" },
  pending:  { variant: "badge--warning", label: "Pending" },
};

export function StatusBadge({ status }) {
  const { variant, label } = map[status?.toLowerCase()] || { variant: "badge", label: status || "Unknown" };
  return <span className={`badge ${variant}`}>{label}</span>;
}
