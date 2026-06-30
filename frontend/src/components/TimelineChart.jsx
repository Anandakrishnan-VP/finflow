import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiClient } from '../api/client';

export default function TimelineChart({ caseId }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    apiClient.get(`/cases/${caseId}/transactions`, { params: { size: 500 } }).then(({ data: txns }) => {
      const byDate = {};
      txns.forEach(t => {
        const day = String(t.txn_date).slice(0, 10);
        byDate[day] = (byDate[day] || 0) + Number(t.amount);
      });
      const series = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount }));
      setData(series);
    });
  }, [caseId]);

  if (data.length === 0) return null;

  return (
    <div className="bg-surface-raised border border-border-hairline rounded-lg p-4 shadow-card">
      <h3 className="text-sm font-semibold text-ink-primary mb-3">Transaction Volume Over Time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-default))" opacity={0.6} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'rgb(var(--ink-secondary))', fontFamily: 'var(--font-mono)' }}
            stroke="rgb(var(--border-default))"
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'rgb(var(--ink-secondary))', fontFamily: 'var(--font-mono)' }}
            stroke="rgb(var(--border-default))"
            tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : v}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgb(var(--surface-raised))',
              borderColor: 'rgb(var(--border-default))',
              borderRadius: '8px',
            }}
            labelStyle={{ color: 'rgb(var(--ink-primary))', fontWeight: 'bold', fontSize: 11 }}
            itemStyle={{ color: 'rgb(var(--accent))', fontSize: 11 }}
            formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Volume']}
          />
          <Line type="monotone" dataKey="amount" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
