import React from 'react';
import { act } from 'react';
import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import {
  isRoundActiveAtom,
  activeAiTurnIdAtom,
  isLoadingAtom,
  activeSplitPanelAtom,
  splitPaneRatioAtom,
  hasAutoOpenedPaneAtom,
  hasAutoWidenedForSynthesisAtom,
} from '../state/atoms';
import { usePortMessageHandler } from '../hooks/usePortMessageHandler';

// Mock extension API to capture the port handler registered by the hook
let capturedHandler: ((message: any) => void) | null = null;
jest.mock('../services/extension-api', () => ({
  __esModule: true,
  default: {
    setPortMessageHandler: (handler: ((message: any) => void) | null) => {
      capturedHandler = handler;
    },
  },
}));

function HookRunner() {
  usePortMessageHandler();
  return null;
}

describe('Streaming UX integration', () => {
  test('isRoundActiveAtom derives correctly', () => {
    const store = createStore();
    store.set(activeAiTurnIdAtom, null);
    store.set(isLoadingAtom, false);
    expect(store.get(isRoundActiveAtom)).toBe(false);
    store.set(activeAiTurnIdAtom, 'turn-1');
    store.set(isLoadingAtom, true);
    expect(store.get(isRoundActiveAtom)).toBe(true);
  });

  test('auto-open split pane on first streaming provider and auto-widen on synthesis, then reset', async () => {
    const store = createStore();

    render(
      <Provider store={store}>
        <HookRunner />
      </Provider>
    );

    await act(async () => {
      store.set(activeAiTurnIdAtom, 'turn-1');
      store.set(isLoadingAtom, true);
    });

    await act(async () => {
      capturedHandler?.({
        type: 'WORKFLOW_PROGRESS',
        phase: 'batch',
        providerStatuses: [
          { providerId: 'gemini', status: 'streaming' },
          { providerId: 'claude', status: 'queued' },
        ],
      });
    });

    // Pane should auto-open for first streaming provider
    const splitPanel = store.get(activeSplitPanelAtom);
    expect(splitPanel).toEqual({ turnId: 'turn-1', providerId: 'gemini' });
    expect(store.get(splitPaneRatioAtom)).toBe(70);
    expect(store.get(hasAutoOpenedPaneAtom)).toBe('turn-1');

    await act(async () => {
      capturedHandler?.({ type: 'WORKFLOW_PROGRESS', phase: 'synthesis', providerStatuses: [] });
    });
    expect(store.get(splitPaneRatioAtom)).toBe(75);
    expect(store.get(hasAutoWidenedForSynthesisAtom)).toBe('turn-1');

    await act(async () => {
      capturedHandler?.({ type: 'WORKFLOW_COMPLETE' });
    });
    expect(store.get(hasAutoOpenedPaneAtom)).toBeNull();
    expect(store.get(hasAutoWidenedForSynthesisAtom)).toBeNull();

    await act(async () => {
      capturedHandler?.({ type: 'TURN_FINALIZED', aiTurnId: 'turn-1', userTurnId: 'user-1', turn: {} });
    });
    expect(store.get(activeAiTurnIdAtom)).toBeNull();
    // isRoundActive should now be false after finalize and loading cleared by handler
    expect(store.get(isRoundActiveAtom)).toBe(false);
  });
});
