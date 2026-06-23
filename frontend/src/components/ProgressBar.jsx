import { useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ProgressBar({ taskId, onComplete }) {
  const { progress, stage, status, error } = useWebSocket(taskId);

  useEffect(() => {
    if (status === 'complete' && onComplete) onComplete();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="text-xs font-medium space-y-2">
      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{stage || 'Initializing connection...'}</span>
        <span className="font-mono">{progress}%</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${status === 'failed' ? 'bg-danger' : 'bg-accent animate-pulse'}`}
          style={{ width: `${Math.max(progress, 2)}%` }} 
        />
      </div>
      {status === 'disconnected' && <div className="text-[10px] text-warning font-semibold animate-pulse">Reconnecting to server...</div>}
      {status === 'failed' && <div className="text-[10px] text-danger font-semibold">{error || 'Pipeline execution failed'}</div>}
    </div>
  );
}
