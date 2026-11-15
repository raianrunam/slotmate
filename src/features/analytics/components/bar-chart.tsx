"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// One small bar chart. It receives ONLY plain numbers and labels (no database, no plan data), and it is always
// shown next to a text table (see DataTable), so the chart itself is a visual extra, not the only way to read it.
// Colours come from the design tokens (globals.css); the meaning is carried by the labels and the table, not by colour.

export interface BarDatum {
  label: string;
  value: number;
}

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

export function CountBarChart({
  data,
  ariaLabel,
  valueName,
  horizontal = false,
}: {
  data: BarDatum[];
  ariaLabel: string;
  /** What one bar counts, e.g. "Requests". Shown in the tooltip. */
  valueName: string;
  /** Horizontal bars (names on the left): for lists such as resources and statuses. */
  horizontal?: boolean;
}) {
  const height = horizontal ? Math.max(160, data.length * 40 + 30) : 240;
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={TICK} stroke="var(--border)" />
              <YAxis type="category" dataKey="label" width={96} tick={TICK} stroke="var(--border)" interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={TICK} stroke="var(--border)" interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} width={32} tick={TICK} stroke="var(--border)" />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => [String(value), valueName]}
            contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" name={valueName} fill="var(--chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
