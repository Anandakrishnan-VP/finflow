import { useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ProgressBar({ taskId, onComplete }) {
  const { progress, stage, status, error } = useWebSocket(taskId);

  useEffect(() => {
    if (status === 'complete' && onComplete) onComplete();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex justify-between text-xs text-ink-secondary mb-1">
        <span>{stage || 'Connecting...'}</span>
        <span className="font-data font-semibold">{progress}%</span>
      </div>
      <div className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden border border-border-hairline">
        <div className={`h-2 rounded-full transition-all ${status === 'failed' ? 'bg-risk-high' : 'bg-accent'}`}
             style={{ width: `${Math.max(progress, 2)}%` }} />
      </div>
      {status === 'disconnected' && <div className="text-xs text-risk-medium mt-1 font-semibold">Reconnecting...</div>}
      {status === 'failed' && <div className="text-xs text-risk-high mt-1 font-semibold">{error || 'Analysis failed'}</div>}
    </div>
  );
}
