import { useState } from "react";
import { useCost, estimateCost } from "../../store/costStore";
import { PROVIDER_META } from "../../store/providerStore";
import type { CostEntry } from "@wren/shared";
import styles from "./CostDashboard.module.css";

interface Props {
  onClose: () => void;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

interface AggregatedRow {
  projectId: string;
  projectName: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

function aggregateEntries(entries: CostEntry[]): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const e of entries) {
    const key = `${e.projectId}::${e.providerId}`;
    const existing = map.get(key);
    const cost = estimateCost(e.providerId as never, e.inputTokens, e.outputTokens);
    if (existing) {
      existing.inputTokens += e.inputTokens;
      existing.outputTokens += e.outputTokens;
      existing.cost += cost;
    } else {
      map.set(key, {
        projectId: e.projectId,
        projectName: e.projectName,
        providerId: e.providerId,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cost,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export function CostDashboard({ onClose }: Props) {
  const { entries, todayEntries, resetToday } = useCost();
  const [view, setView] = useState<"today" | "all">("today");

  const displayEntries = view === "today" ? todayEntries : entries;
  const rows = aggregateEntries(displayEntries);

  const totalInput = rows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutput = rows.reduce((s, r) => s + r.outputTokens, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Cost Dashboard</span>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${view === "today" ? styles.toggleActive : ""}`}
              onClick={() => setView("today")}
            >
              Today
            </button>
            <button
              className={`${styles.toggleBtn} ${view === "all" ? styles.toggleActive : ""}`}
              onClick={() => setView("all")}
            >
              All (90d)
            </button>
          </div>
          <button className={styles.resetBtn} onClick={resetToday} title="Reset today's counters">
            Reset today
          </button>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Summary cards */}
        <div className={styles.summary}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Input tokens</span>
            <span className={styles.cardValue}>{formatTokens(totalInput)}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Output tokens</span>
            <span className={styles.cardValue}>{formatTokens(totalOutput)}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Est. cost</span>
            <span className={`${styles.cardValue} ${styles.cardValueAccent}`}>
              {formatCost(totalCost)}
            </span>
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className={styles.empty}>
            No usage recorded yet.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Provider</th>
                  <th>In tokens</th>
                  <th>Out tokens</th>
                  <th>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = PROVIDER_META[row.providerId as keyof typeof PROVIDER_META];
                  return (
                    <tr key={`${row.projectId}::${row.providerId}`}>
                      <td>{row.projectName}</td>
                      <td>
                        <span className={styles.providerCell}>
                          <span
                            className={styles.providerDot}
                            style={{ background: meta?.color ?? "#666" }}
                          />
                          {meta?.name ?? row.providerId}
                        </span>
                      </td>
                      <td>{formatTokens(row.inputTokens)}</td>
                      <td>{formatTokens(row.outputTokens)}</td>
                      <td className={styles.costCell}>{formatCost(row.cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={2}>Total</td>
                  <td>{formatTokens(totalInput)}</td>
                  <td>{formatTokens(totalOutput)}</td>
                  <td className={styles.costCell}>{formatCost(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className={styles.disclaimer}>
          Cost estimates are approximate and based on public pricing. Actual billing may differ.
        </p>
      </div>
    </div>
  );
}
