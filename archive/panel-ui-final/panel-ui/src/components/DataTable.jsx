import { useState, useMemo, useCallback } from "react";
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";

/**
 * DataTable — sortable, paginated table with responsive column hiding.
 *
 * Props:
 *  - columns: Array<{
 *      key: string,
 *      label: string,
 *      sortable?: bool,
 *      align?: 'left'|'right'|'center',
 *      hideMobile?: bool,   // hide this column on screens < 600px
 *      render?: (row, col) => ReactNode
 *    }>
 *  - data: Array<Object>
 *  - rowKey?: string | (row) => string — defaults to index
 *  - pageSize?: number — default 25
 *  - pageSizes?: number[] — options for page size selector, default [10, 25, 50, 100]
 *  - initialSort?: { key: string, dir: 'asc'|'desc' }
 *  - onRowClick?: (row) => void
 *  - rowClassName?: (row) => string — e.g. 'row-danger'
 *  - emptyMessage?: string
 *  - compact?: bool — smaller padding
 */
export function DataTable({
  columns,
  data,
  rowKey,
  pageSize: defaultPageSize = 25,
  pageSizes = [10, 25, 50, 100],
  initialSort,
  onRowClick,
  rowClassName,
  emptyMessage = "No data to display",
  compact = false,
}) {
  const [sortKey, setSortKey] = useState(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState(initialSort?.dir ?? "asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const pageData = sorted.slice(start, start + pageSize);

  const toggleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
    setPage(1);
  }, []);

  const getRowKey = useCallback(
    (row, i) => {
      if (rowKey) return typeof rowKey === "function" ? rowKey(row) : row[rowKey];
      return i;
    },
    [rowKey]
  );

  return (
    <div>
      <div className="table-wrap">
        <table className={`data-table${compact ? " data-table--compact" : ""}`}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.sortable ? "sortable" : ""}${
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? " sort-asc"
                        : " sort-desc"
                      : ""
                  }${col.align === "right" ? " col-num" : ""}${
                    col.align === "center" ? " text-center" : ""
                  }${col.hideMobile ? " col-hide-mobile" : ""}`}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted" style={{ padding: "var(--space-8)" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={getRowKey(row, i)}
                  className={rowClassName?.(row) ?? ""}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${col.align === "right" ? "col-num" : ""}${
                        col.align === "center" ? " text-center" : ""
                      }${col.hideMobile ? " col-hide-mobile" : ""}`}
                    >
                      {col.render ? col.render(row, col) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="table-meta">
          <span>
            Showing {start + 1}–{Math.min(start + pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="table-pagination">
            {/* Page size selector */}
            {pageSizes.length > 1 && (
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text-secondary)",
                  padding: "4px 8px",
                  fontSize: "var(--text-sm)",
                  marginRight: "var(--space-2)",
                }}
              >
                {pageSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}/page
                  </option>
                ))}
              </select>
            )}

            <button
              disabled={clampedPage <= 1}
              onClick={() => setPage(clampedPage - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="table-page-info">
              {clampedPage} / {totalPages}
            </span>
            <button
              disabled={clampedPage >= totalPages}
              onClick={() => setPage(clampedPage + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}