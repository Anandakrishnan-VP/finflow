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

  let label, colorClass;

  if (mode.startsWith('ollama_reachable')) {
    const model = mode.split(':')[1] || 'local';
    label = `🧠 Local AI: ${model}`;
    colorClass = 'bg-emerald-950 text-emerald-300 border-emerald-700';
  } else if (mode.startsWith('ollama_unreachable')) {
    const model = mode.split(':')[1] || 'local';
    label = `⚠️ Local AI offline (${model})`;
    colorClass = 'bg-amber-950 text-amber-400 border-amber-700';
  } else if (mode === 'groq_reachable') {
    label = '☁️ Groq AI: online';
    colorClass = 'bg-accent-subtle text-accent border-accent/20';
  } else if (mode.includes('groq_unreachable')) {
    label = '⚠️ Groq: unreachable';
    colorClass = 'bg-amber-950 text-amber-400 border-amber-700';
  } else if (mode.includes('template')) {
    label = '📋 AI: Offline template';
    colorClass = 'bg-risk-medium-bg text-risk-medium border-risk-medium/15';
  } else {
    label = `AI: ${mode}`;
    colorClass = 'bg-surface-3 text-text-2 border-border';
  }

  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded border inline-block ${colorClass}`}>
      {label}
    </span>
  );
}
