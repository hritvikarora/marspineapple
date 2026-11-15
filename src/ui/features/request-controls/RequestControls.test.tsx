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

  it('renders calculate button with data-testid="calculate" and omits cancel while idle', () => {
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

    expect(screen.getByTestId('request-controls-feature')).toBeTruthy();

    const button = screen.getByTestId('calculate');
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Calculate');
    expect(button.className).toContain('btn-primary');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('false');

    expect(screen.queryByTestId('cancel-request')).toBeNull();
    expect(screen.queryByTestId('solving-progress')).toBeNull();
    expect(screen.queryByTestId('cannot-request-reason')).toBeNull();
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

  it('disables calculate button, blocks requestRoute, and shows exact reason when canRequest is false', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();
    const engineReason = 'Choose a start point.';

    render(
      <RequestControls
        requestRoute={requestRoute}
        cancelRoute={cancelRoute}
        canRequest={false}
        canReason={engineReason}
        isRunning={false}
        candidateCount={0}
      />,
    );

    const button = screen.getByTestId('calculate') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(requestRoute).not.toHaveBeenCalled();

    const reason = screen.getByTestId('cannot-request-reason');
    expect(reason.textContent).toBe(engineReason);
    expect(screen.queryByTestId('cancel-request')).toBeNull();
  });

  it('omits cannot-request-reason when canRequest is false without a reason', () => {
    render(
      <RequestControls
        requestRoute={vi.fn()}
        cancelRoute={vi.fn()}
        canRequest={false}
        isRunning={false}
        candidateCount={0}
      />,
    );

    const button = screen.getByTestId('calculate') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByTestId('cannot-request-reason')).toBeNull();
  });

  it('shows cancel button, aria-busy, and honest calculating status while isRunning is true', () => {
    const requestRoute = vi.fn();
    const cancelRoute = vi.fn();

    const { container } = render(
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
    expect(calcButton.getAttribute('aria-busy')).toBe('true');
    expect(calcButton.textContent).toContain('Calculating...');
    fireEvent.click(calcButton);
    expect(requestRoute).not.toHaveBeenCalled();

    const cancelButton = screen.getByTestId('cancel-request');
    expect(cancelButton).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(cancelButton);

    const progress = screen.getByTestId('solving-progress');
    expect(progress).toBeTruthy();
    expect(progress.getAttribute('role')).toBe('status');
    expect(progress.getAttribute('aria-live')).toBe('polite');
    expect(progress.textContent).toBe('Calculating');
    expect(progress.textContent).not.toMatch(/\d/);
    expect(container.querySelector('progress')).toBeNull();
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

  it('shows Recalculate text when candidates already exist', () => {
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
    expect(button.textContent).toBe('Recalculate');
    expect(screen.queryByTestId('cancel-request')).toBeNull();
  });
});
