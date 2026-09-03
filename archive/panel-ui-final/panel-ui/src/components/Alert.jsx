import { AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({ type = "error", children }) {
  const Icon = icons[type] || AlertCircle;
  return (
    <div className={`alert alert--${type}`}>
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
