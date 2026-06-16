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
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-700 mb-3">Transaction Volume Over Time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
          <Line type="monotone" dataKey="amount" stroke="#0f172a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
