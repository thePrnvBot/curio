import { ChatAttachment } from "@curio/ui/components/ai-elements/attachments";
import type { ChatAttachmentData } from "@curio/ui/components/ai-elements/attachments";
import { Option } from "effect";

/**
 * Renders a file part the Director sent inline in the transcript. Unknown-or
 * unplayable media (no URL, unrecognized type) degrade to the generic
 * attachment chip instead of an inline player.
 */

type InlineMediaPlan =
  | { readonly kind: "audio"; readonly url: string }
  | { readonly kind: "document" }
  | { readonly kind: "image"; readonly label: string; readonly url: string }
  | { readonly kind: "video"; readonly url: string };

/** Classifies one playable media type into its inline render plan. */
function toPlayableMediaPlan({
  filename,
  mediaType,
  playableUrl,
}: {
  readonly filename: Option.Option<string>;
  readonly mediaType: string;
  readonly playableUrl: string;
}): Option.Option<InlineMediaPlan> {
  if (mediaType.startsWith("image/")) {
    return Option.some({
      kind: "image",
      label: Option.getOrElse(filename, () => "Image attachment"),
      url: playableUrl,
    });
  }
  if (mediaType.startsWith("video/")) {
    return Option.some({ kind: "video", url: playableUrl });
  }
  if (mediaType.startsWith("audio/")) {
    return Option.some({ kind: "audio", url: playableUrl });
  }
  return Option.none();
}

/** Single classification point for playable inline media. */
function toInlineMediaPlan(fileEntry: ChatAttachmentData): InlineMediaPlan {
  const classifiedPlan = Option.fromNullishOr(fileEntry.url).pipe(
    Option.flatMap((playableUrl) =>
      Option.fromNullishOr(fileEntry.mediaType).pipe(
        Option.flatMap((mediaType) =>
          toPlayableMediaPlan({
            filename: Option.fromNullishOr(fileEntry.filename),
            mediaType,
            playableUrl,
          })
        )
      )
    )
  );
  return Option.getOrElse(classifiedPlan, (): InlineMediaPlan => ({
    kind: "document",
  }));
}

export function InlineFilePartView({
  fileEntry,
}: {
  fileEntry: ChatAttachmentData;
}) {
  const mediaPlan = toInlineMediaPlan(fileEntry);

  switch (mediaPlan.kind) {
    case "image": {
      return (
        <img
          alt={mediaPlan.label}
          className="max-h-80 w-auto max-w-md rounded-lg border"
          src={mediaPlan.url}
        />
      );
    }
    case "video": {
      return (
        <video
          className="max-h-80 w-full max-w-md rounded-lg border"
          controls
          src={mediaPlan.url}
        >
          <track kind="captions" />
        </video>
      );
    }
    case "audio": {
      return (
        <audio className="w-full max-w-md" controls>
          <track kind="captions" />
          <source src={mediaPlan.url} />
        </audio>
      );
    }
    // The document plan is the classification fallback for media without a
    // playable URL or with an unrecognized type, so it is the default arm.
    default: {
      return <ChatAttachment attachment={fileEntry} />;
    }
  }
}
