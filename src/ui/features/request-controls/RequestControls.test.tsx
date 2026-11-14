// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestControls } from './RequestControls';
import entry from './entry';

afterEach(() => {
  cleanup();
});

describe('TASK-006: Request Controls', () => {
  it('registers valid FeatureModule contract', () => {
    expect(entry.id).toBe('request-controls');
    expect(entry.slot).toBe('request-controls');
    expect(entry.Component).toBeDefined();
  });

  it('renders calculate button with data-testid="calculate"', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={true}
        isRunning={false}
        candidateCount={0}
      />,
    );

    const button = screen.getByTestId('calculate');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Calculate Traverse');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking calculate button triggers requestRoute when canRequest is true', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={true}
        isRunning={false}
        candidateCount={0}
      />,
    );

    const button = screen.getByTestId('calculate');
    fireEvent.click(button);
    expect(requestRoute).toHaveBeenCalledTimes(1);
  });

  it('disables calculate button and shows reason when canRequest is false', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={false}
        canReason="Set mission start and destination points before calculating."
        isRunning={false}
        candidateCount={0}
      />,
    );

    const button = screen.getByTestId('calculate') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    const reason = screen.getByTestId('cannot-request-reason');
    expect(reason.textContent).toContain('Set mission start and destination points');
  });

  it('shows cancel button and solving indicator while isRunning is true', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={true}
        isRunning={true}
        candidateCount={0}
      />,
    );

    const calcButton = screen.getByTestId('calculate') as HTMLButtonElement;
    expect(calcButton.disabled).toBe(true);
    expect(calcButton.textContent).toContain('Calculating...');

    const cancelButton = screen.getByTestId('cancel-request');
    expect(cancelButton).toBeTruthy();

    const progress = screen.getByTestId('solving-progress');
    expect(progress).toBeTruthy();
    expect(progress.getAttribute('role')).toBe('status');
  });

  it('clicking cancel button triggers cancelRoute', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={true}
        isRunning={true}
        candidateCount={0}
      />,
    );

    const cancelButton = screen.getByTestId('cancel-request');
    fireEvent.click(cancelButton);
    expect(cancelRoute).toHaveBeenCalledTimes(1);
  });

  it('shows recalculate text when candidates already exist', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={true}
        isRunning={false}
        candidateCount={2}
      />,
    );

    const button = screen.getByTestId('calculate');
    expect(button.textContent).toContain('Recalculate Traverse');
  });
});
