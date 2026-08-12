import { useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ProgressBar({ taskId, onComplete, onFailure }) {
  const { progress, stage, status, error } = useWebSocket(taskId);

  useEffect(() => {
    if (status === 'complete' && onComplete) onComplete();
    if (status === 'failed' && onFailure) onFailure();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-ink-primary mb-1.5">
        <span className="text-ink-primary">{stage || 'Connecting to forensic engine...'}</span>
        <span className="font-mono font-bold text-accent">{progress}%</span>
      </div>
      <div className="w-full bg-surface-sunken rounded-full h-2.5 overflow-hidden border border-border">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ${status === 'failed' ? 'bg-risk-high' : 'bg-accent'}`}
          style={{ width: `${Math.max(progress, 2)}%` }} 
        />
      </div>
      {status === 'disconnected' && <div className="text-xs text-amber-500 mt-1.5 font-bold">⚠️ Reconnecting to backend...</div>}
      {status === 'failed' && <div className="text-xs text-red-500 mt-1.5 font-bold">❌ {error || 'Analysis failed'}</div>}
    </div>
  );
}
