import { useEffect, useState } from 'react';

export default function LlmModeBadge() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    fetch('/health/full')
      .then(r => r.json())
      .then(d => setMode(d.llm))
      .catch(() => setMode('unknown'));
  }, []);

  if (!mode) return null;
  const isTemplate = mode.includes('template');
  return (
    <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border tracking-wide uppercase
      ${isTemplate 
        ? 'bg-warning/10 text-warning border-warning/25 dark:bg-warning/5' 
        : 'bg-success/10 text-success border-success/25 dark:bg-success/5'
      }`}
    >
      {isTemplate ? 'LLM: Template mode (offline)' : 'LLM: Cloud AI active'}
    </span>
  );
}
