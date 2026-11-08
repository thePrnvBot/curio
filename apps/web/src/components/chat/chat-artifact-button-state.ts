import type { GeneratedArtifactResponseView } from "@/utils/chat-schemas";

/** Internal state machine for the artifact generation action. */
export type ArtifactButtonState =
  | { readonly kind: "idle" }
  | { readonly kind: "generating" }
  | { readonly kind: "published"; readonly artifact: GeneratedArtifactResponseView }
  | { readonly kind: "error"; readonly message: string };

export type ArtifactButtonAction =
  | { readonly type: "start" }
  | { readonly type: "published"; readonly artifact: GeneratedArtifactResponseView }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "reset" };

export function artifactButtonReducer(
  state: ArtifactButtonState,
  action: ArtifactButtonAction
): ArtifactButtonState {
  switch (state.kind) {
    case "idle": {
      if (action.type === "start") {
        return { kind: "generating" };
      }
      break;
    }
    case "generating": {
      if (action.type === "published") {
        return { kind: "published", artifact: action.artifact };
      }
      if (action.type === "error") {
        return { kind: "error", message: action.message };
      }
      break;
    }
    case "published":
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
