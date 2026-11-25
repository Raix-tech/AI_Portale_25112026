import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createCompletedWorkspaceRead, type PreviewActionParser } from './completedWorkspaceRead';
import {
  getWorkspaceReadPreviewScope,
  readWorkspaceLocalPreviews,
  subscribeWorkspaceReadPreviewScope,
  type WorkspaceReadPreviewFile,
} from './localWorkspace';

export type LocalReadPreview = readonly WorkspaceReadPreviewFile[] | null;

export function useWorkspaceReadPreview(activeSessionId: string | null, workspaceConnected: boolean) {
  const [result, setResult] = useState<{
    sessionId: string;
    messageId: string;
    actionId: string;
    preview: LocalReadPreview;
  } | null>(null);
  const turnRef = useRef<{ sessionId: string } | null>(null);
  const activeSessionRef = useRef(activeSessionId);

  const clear = useCallback(() => {
    turnRef.current = null;
    setResult(null);
  }, []);

  useLayoutEffect(() => {
    const unsubscribe = subscribeWorkspaceReadPreviewScope(clear);
    return () => {
      turnRef.current = null;
      unsubscribe();
    };
  }, [clear]);

  useLayoutEffect(() => {
    activeSessionRef.current = activeSessionId;
    if (!workspaceConnected || turnRef.current?.sessionId !== activeSessionId) clear();
  }, [activeSessionId, workspaceConnected, clear]);

  function begin(sessionId: string, messageId: string, parse: PreviewActionParser) {
    clear();
    const scope = workspaceConnected ? getWorkspaceReadPreviewScope() : null;
    if (!scope) return;
    const turn = { sessionId };
    turnRef.current = turn;
    const completion = createCompletedWorkspaceRead(messageId, parse);

    return {
      done: completion.done,
      fail: completion.fail,
      async finish(signal: AbortSignal) {
        const isCurrent = () => !signal.aborted && turnRef.current === turn &&
          activeSessionRef.current === sessionId && getWorkspaceReadPreviewScope() === scope;
        if (!isCurrent()) return;
        const action = completion.take(signal);
        if (!action) return;
        const preview = await readWorkspaceLocalPreviews(scope, action.paths, isCurrent);
        if (isCurrent()) setResult({ sessionId, messageId, actionId: action.id, preview });
      },
    };
  }

  function forAction(messageId: string, actionId: string): LocalReadPreview | undefined {
    if (workspaceConnected && result && result.sessionId === activeSessionId &&
        result.messageId === messageId && result.actionId === actionId && getWorkspaceReadPreviewScope()) {
      return result.preview;
    }
  }

  return { begin, clear, forAction };
}
