import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HealthFactorChart,
  healthBand,
  healthBandLabel,
  deriveHealthFactor,
  buildHealthHistory,
} from './HealthFactorChart';

describe('healthBand helpers', () => {
  it('classifies safe / caution / risk thresholds', () => {
    expect(healthBand(2.5)).toBe('safe');
    expect(healthBand(1.5)).toBe('caution');
    expect(healthBand(1.0)).toBe('risk');
  });

  it('labels bands for accessible text', () => {
    expect(healthBandLabel('safe')).toBe('Safe');
    expect(healthBandLabel('caution')).toBe('Caution');
    expect(healthBandLabel('risk')).toBe('At risk');
  });
});

describe('deriveHealthFactor', () => {
  it('returns 3 when nothing is utilized', () => {
    expect(deriveHealthFactor(10000, 0)).toBe(3);
  });

  it('is limit / utilized when drawn', () => {
    expect(deriveHealthFactor(10000, 5000)).toBe(2);
  });

  it('floors near zero for overdrawn / empty limit', () => {
    expect(deriveHealthFactor(0, 100)).toBe(0.5);
  });
});

describe('buildHealthHistory', () => {
  it('ends with the current value', () => {
    const series = buildHealthHistory(1.8, 8);
    expect(series).toHaveLength(8);
    expect(series[series.length - 1].value).toBe(1.8);
  });

  it('is deterministic for the same inputs', () => {
    expect(buildHealthHistory(2.0, 5)).toEqual(buildHealthHistory(2.0, 5));
  });
});

describe('HealthFactorChart', () => {
  const data = [
    { date: '2026-01-01', value: 2.4 },
    { date: '2026-01-08', value: 2.1 },
    { date: '2026-01-15', value: 1.8 },
  ];

  it('renders the current badge and accessible SVG', () => {
    render(
      <HealthFactorChart data={data} current={1.8} lineName="Builder line" />,
    );

    expect(screen.getByText(/1\.80 · Caution/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /health factor trend for builder line/i }),
    ).toBeInTheDocument();
  });

  it('exposes an SR-only history table', () => {
    render(
      <HealthFactorChart data={data} current={1.8} lineName="Builder line" />,
    );

    expect(
      screen.getByRole('table', {
        name: /health factor history for builder line/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
  });

  it('shows empty state when there is no data', () => {
    render(
      <HealthFactorChart data={[]} current={2} lineName="Empty line" />,
    );
    expect(
      screen.getByText(/no health-factor history yet for empty line/i),
    ).toBeInTheDocument();
  });

  it('includes band text (not color alone) and keyboard-focusable SVG', () => {
    render(
      <HealthFactorChart data={data} current={1.0} lineName="Risk line" />,
    );
    const badge = screen.getByTestId('hf-band-badge');
    expect(badge).toHaveAttribute('data-band', 'risk');
    expect(badge).toHaveTextContent(/At risk/i);
    const svg = screen.getByTestId('hf-chart-svg');
    expect(svg).toHaveAttribute('tabindex', '0');
  });

  it('SR history table includes a Band column for every sample', () => {
    render(
      <HealthFactorChart data={data} current={1.8} lineName="Builder line" />,
    );
    expect(screen.getByRole('columnheader', { name: /^band$/i })).toBeInTheDocument();
    expect(screen.getAllByText('Safe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Caution').length).toBeGreaterThan(0);
  });

  it.each([
    [2.5, 'safe', /Safe/i],
    [1.5, 'caution', /Caution/i],
    [1.0, 'risk', /At risk/i],
  ] as const)('boundary current=%s maps to band %s', (current, band, label) => {
    render(
      <HealthFactorChart
        data={[{ date: '2026-01-01', value: current }]}
        current={current}
        lineName="Boundary"
      />,
    );
    expect(screen.getByTestId('hf-band-badge')).toHaveAttribute('data-band', band);
    expect(screen.getByTestId('hf-band-badge')).toHaveTextContent(label);
  });
});
