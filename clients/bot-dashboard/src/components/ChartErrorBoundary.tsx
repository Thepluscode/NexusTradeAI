import React from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * ErrorBoundary that catches Recharts invariant errors.
 * Also provides SafeResponsiveContainer that prevents zero-dimension rendering.
 */
export class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    // Silence invariant errors from Recharts
    if (error?.message?.includes?.('Invariant')) return;
    console.error('ChartErrorBoundary caught:', error);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/**
 * A safe wrapper around ResponsiveContainer that:
 * 1. Wraps in an ErrorBoundary
 * 2. Ensures minWidth/minHeight to prevent zero-dimension invariant crashes
 * 3. Only renders children when data is non-empty
 */
export function SafeResponsiveContainer({
  children,
  width = '100%',
  height = 200,
  data,
}: {
  children: React.ReactElement;
  width?: string | number;
  height?: string | number;
  data?: unknown[] | null;
}) {
  // Don't render chart at all if data is empty/null
  if (data !== undefined && (!data || data.length === 0)) {
    return null;
  }

  return (
    <ChartErrorBoundary>
      <div style={{ minWidth: 50, minHeight: typeof height === 'number' ? height : 50 }}>
        <ResponsiveContainer width={width} height={height}>
          {children}
        </ResponsiveContainer>
      </div>
    </ChartErrorBoundary>
  );
}
