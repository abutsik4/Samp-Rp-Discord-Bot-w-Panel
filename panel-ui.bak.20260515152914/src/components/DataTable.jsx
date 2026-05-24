import { LoadingSkeleton } from "./LoadingSkeleton";
import { EmptyState } from "./EmptyState";

export function DataTable({ columns, rows, loading, emptyMessage = "No data found.", emptyIcon, skeletonRows = 5 }) {
  if (loading) {
    return <LoadingSkeleton type="table" rows={skeletonRows} />;
  }

  if (!rows || rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyMessage} />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className || ""}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className={row._rowClass || ""}>
              {columns.map((col) => (
                <td key={col.key} className={col.tdClassName || ""}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
