import { useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ProgressBar({ taskId, onComplete }) {
  const { progress, stage, status, error } = useWebSocket(taskId);

  useEffect(() => {
    if (status === 'complete' && onComplete) onComplete();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{stage || 'Connecting...'}</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${status === 'failed' ? 'bg-red-500' : 'bg-slate-900'}`}
             style={{ width: `${Math.max(progress, 2)}%` }} />
      </div>
      {status === 'disconnected' && <div className="text-xs text-amber-600 mt-1">Reconnecting...</div>}
      {status === 'failed' && <div className="text-xs text-red-600 mt-1">{error || 'Analysis failed'}</div>}
    </div>
  );
}
