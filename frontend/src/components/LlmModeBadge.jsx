import { useEffect, useState } from 'react';

export default function LlmModeBadge() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    fetch('/health/full').then(r => r.json()).then(d => setMode(d.llm)).catch(() => setMode('unknown'));
  }, []);

  if (!mode) return null;
  const isTemplate = mode.includes('template');
  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded border inline-block ${
      isTemplate 
        ? 'bg-risk-medium-bg text-risk-medium border-risk-medium/15' 
        : 'bg-accent-subtle text-accent border-accent/20'
    }`}>
      {isTemplate ? 'LLM: Offline template mode' : 'LLM: Groq connected'}
    </span>
  );
}
