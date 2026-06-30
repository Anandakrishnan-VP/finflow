/**
 * Single source of truth for risk severity styling across the app.
 * RULE 3: shape + color together, never color alone.
 */
const TIERS = {
  high: {
    label: 'High',
    className: 'bg-risk-high-bg text-risk-high',
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <polygon points="5,0 9.33,2.5 9.33,7.5 5,10 0.67,7.5 0.67,2.5" />
      </svg>
    ),
  },
  medium: {
    label: 'Medium',
    className: 'bg-risk-medium-bg text-risk-medium',
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <polygon points="5,0 10,5 5,10 0,5" />
      </svg>
    ),
  },
  low: {
    label: 'Low',
    className: 'bg-risk-low-bg text-risk-low',
    icon: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <circle cx="5" cy="5" r="5" />
      </svg>
    ),
  },
};

export function riskTierFromScore(score) {
  if (score >= 65) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export default function RiskBadge({ tier, label }) {
  const config = TIERS[tier] || TIERS.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md font-medium ${config.className}`}>
      {config.icon}
      {label || config.label}
    </span>
  );
}

export { TIERS as RISK_TIER_STYLES };
