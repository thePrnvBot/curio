/** Internal state machine for the complete-and-continue action. */
export type CompletionState =
  | { readonly kind: "idle" }
  | { readonly kind: "completing" }
  | { readonly kind: "completed"; readonly badgeLabel: string | null }
  | { readonly kind: "error" };

export type CompletionAction =
  | { readonly type: "start" }
  | { readonly type: "success"; readonly badgeLabel: string | null }
  | { readonly type: "error" }
  | { readonly type: "reset" };

export function completionReducer(
  state: CompletionState,
  action: CompletionAction
): CompletionState {
  switch (state.kind) {
    case "idle": {
      if (action.type === "start") {
        return { kind: "completing" };
      }
      break;
    }
    case "completing": {
      if (action.type === "success") {
        return { kind: "completed", badgeLabel: action.badgeLabel };
      }
      if (action.type === "error") {
        return { kind: "error" };
      }
      break;
    }
    case "completed":
    case "error": {
      if (action.type === "reset") {
        return { kind: "idle" };
      }
      break;
    }
    default: {
      return state;
    }
  }
  return state;
}
