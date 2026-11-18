export const RISK_COLORS: Record<string, string> = {
  Low: "#2fe0a0",
  Moderate: "#ffd04d",
  High: "#ff9346",
  Severe: "#ff5f56",
  "No Travel": "#ff3b6b",
  Unknown: "#6c7f8a",
};

export const RISK_ORDER = ["Low", "Moderate", "High", "Severe", "No Travel", "Unknown"] as const;

export const RISK_KEYS = ["low", "moderate", "high", "severe", "no_travel", "unknown"] as const;

export const ROUTE_COLORS = ["#35d6ff", "#7f9cff", "#c792ff"];
