/** Internal state machine for the settings sound toggle. */
export type SoundToggleState =
  | { readonly kind: "uninitialized" }
  | { readonly kind: "disabled" }
  | { readonly kind: "enabling" }
  | { readonly kind: "enabled" }
  | { readonly kind: "unavailable" };

export type SoundToggleAction =
  | { readonly type: "hydrate"; readonly enabled: boolean }
  | { readonly type: "request-enable" }
  | { readonly type: "request-disable" }
  | { readonly type: "enable-succeeded" }
  | { readonly type: "enable-failed" };

export function soundToggleReducer(
  state: SoundToggleState,
  action: SoundToggleAction
): SoundToggleState {
  switch (state.kind) {
    case "uninitialized": {
      if (action.type === "hydrate") {
        return action.enabled ? { kind: "enabled" } : { kind: "disabled" };
      }
      break;
    }
    case "disabled":
    case "unavailable": {
      if (action.type === "request-enable") {
        return { kind: "enabling" };
      }
      break;
    }
    case "enabling": {
      if (action.type === "enable-succeeded") {
        return { kind: "enabled" };
      }
      if (action.type === "enable-failed") {
        return { kind: "unavailable" };
      }
      break;
    }
    case "enabled": {
      if (action.type === "request-disable") {
        return { kind: "disabled" };
      }
      break;
    }
    default: {
      return state;
    }
  }
  return state;
}
