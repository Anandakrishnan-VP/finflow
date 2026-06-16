import { useEffect, useState } from 'react';

export default function LlmModeBadge() {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    fetch('/health/full').then(r => r.json()).then(d => setMode(d.llm)).catch(() => setMode('unknown'));
  }, []);

  if (!mode) return null;
  const isTemplate = mode.includes('template');
  return (
    <span className={`text-xs px-2 py-1 rounded ${isTemplate ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {isTemplate ? 'LLM: Offline template mode' : 'LLM: Groq connected'}
    </span>
  );
}
