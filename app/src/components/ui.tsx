import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { statusTone } from "../services/operations";

type TableRow =
  | ReactNode[]
  | {
      key?: string;
      cells: ReactNode[];
      selected?: boolean;
      onClick?: () => void;
      label?: string;
    };

export function Badge({ value, tone }: { value: ReactNode; tone?: string }) {
  const text = String(value);
  return <span className={`badge ${tone || statusTone(text)}`}>{value}</span>;
}

export function Section({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="band">
      <div className="band-header">
        <div>
          <h3 className="band-title">{title}</h3>
          {meta ? <p className="band-meta">{meta}</p> : null}
        </div>
        {action}
      </div>
      <div className="band-body">{children}</div>
    </section>
  );
}

export function KpiTile({ title, value, foot }: { title: string; value: ReactNode; foot: ReactNode }) {
  return (
    <div className="tile soft">
      <p className="tile-title">{title}</p>
      <p className="tile-value">{value}</p>
      <p className="tile-foot">{foot}</p>
    </div>
  );
}

export function DataTable({ headers, rows }: { headers: string[]; rows: TableRow[] }) {
  return (
    <div className={`table-wrap table-cols-${headers.length}`}>
      <table>
        <thead>
          <tr>{headers.map((head) => <th key={head}>{head}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const record = Array.isArray(row) ? { cells: row } : row;
            return (
            <tr
              key={record.key || rowIndex}
              className={`${record.onClick ? "interactive-row" : ""} ${record.selected ? "selected" : ""}`}
              onClick={record.onClick}
              tabIndex={record.onClick ? 0 : undefined}
              role={record.onClick ? "button" : undefined}
              aria-label={record.label}
              aria-current={record.selected ? "true" : undefined}
              onKeyDown={(event) => {
                if (!record.onClick) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  record.onClick();
                }
              }}
            >
              {record.cells.map((cell, cellIndex) => <td key={cellIndex} data-label={headers[cellIndex]}>{cell}</td>)}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function NameCell({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <span className="name-cell">
      <span className="primary">{primary}</span>
      <span className="secondary">{secondary}</span>
    </span>
  );
}

export function DefinitionList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="definition-list">
      {rows.map(([term, detail]) => (
        <ReactFragment key={term}>
          <dt>{term}</dt>
          <dd>{detail}</dd>
        </ReactFragment>
      ))}
    </dl>
  );
}

function ReactFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function MetricBars({ rows }: { rows: Array<{ label: string; value: number; tone?: string }> }) {
  return (
    <div className="metric-bars">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <span className="bar-track">
            <span className={`bar-fill ${row.tone || ""}`} style={{ width: `${row.value}%` }} />
          </span>
          <span>{row.value}%</span>
        </div>
      ))}
    </div>
  );
}

export function RecordList({ records }: { records: Array<{ id: string; action: string; time: string; note: string; operator: string }> }) {
  if (!records.length) return <EmptyState>暂无处理记录</EmptyState>;
  return (
    <div className="record-list">
      {records.map((record) => (
        <div className="record-item" key={record.id}>
          <div className="record-head">
            <strong>{record.action}</strong>
            <span>{record.time}</span>
          </div>
          <p>{record.note}</p>
          <span className="secondary">{record.operator}</span>
        </div>
      ))}
    </div>
  );
}

export function ReadonlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="readonly-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function IconButton({ title, onClick, children, disabled }: { title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button className="icon-button" type="button" title={title} aria-label={title} disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick(); }}>
      {children}
    </button>
  );
}

export function DetailLink({ to, title = "打开详情" }: { to: string; title?: string }) {
  return (
    <Link className="icon-button" title={title} aria-label={title} to={to} onClick={(event) => event.stopPropagation()}>
      <ExternalLink className="lucide-icon" />
    </Link>
  );
}
