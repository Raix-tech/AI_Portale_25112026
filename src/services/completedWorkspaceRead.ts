const MAX_PREVIEW_RESPONSE_CHARS = 64 * 1024;

export interface PreviewCandidate {
  type: string;
  id?: string;
  paths?: readonly string[];
}

export type PreviewActionParser = (messageId: string, content: string) => readonly PreviewCandidate[];

export function createCompletedWorkspaceRead(messageId: string, parse: PreviewActionParser) {
  let terminalEvents = 0;
  let content: string | null = null;
  let consumed = false;

  return {
    done(text: string) {
      terminalEvents += 1;
      if (terminalEvents === 1) content = text;
    },
    fail() {
      terminalEvents += 1;
      content = null;
    },
    take(signal: AbortSignal) {
      if (consumed || terminalEvents !== 1 || signal.aborted ||
          typeof content !== 'string' || !content || content.length > MAX_PREVIEW_RESPONSE_CHARS) return null;
      consumed = true;
      try {
        const actions = parse(messageId, content).filter(({ type }) => type !== 'markdown');
        const [action] = actions;
        if (actions.length !== 1 || action.type !== 'read' || !action.id || !action.paths) return null;
        return { id: action.id, paths: action.paths };
      } catch {
        return null;
      }
    },
  };
}
