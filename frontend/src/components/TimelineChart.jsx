import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
    <div className="bg-surfaceContainerLow border border-outlineVariant rounded-m3-l p-5 text-xs text-onSurface">
      <div className="border-b border-outlineVariant pb-2.5 mb-4">
        <h3 className="text-sm font-bold text-onSurface">Transaction Flow History</h3>
        <p className="text-[10px] text-onSurfaceVariant mt-0.5">Scrutinized volume progression across statements.</p>
      </div>

      <div className="h-60 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAmountCase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-color-0)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--chart-color-0)" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--m3-outline-variant)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--m3-on-surface-variant)' }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--m3-on-surface-variant)' }} />
            <Tooltip 
              formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} 
              contentStyle={{
                backgroundColor: 'var(--m3-surface-container-high)',
                borderColor: 'var(--m3-outline-variant)',
                borderRadius: '8px',
                color: 'var(--m3-on-surface)',
                fontSize: '11px'
              }}
              itemStyle={{ color: 'var(--m3-primary)' }}
              labelStyle={{ color: 'var(--m3-on-surface-variant)' }}
            />
            <Area type="monotone" dataKey="amount" name="Flow Value" stroke="var(--chart-color-0)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAmountCase)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
