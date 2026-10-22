import {
  Attachments,
  ChatAttachment,
} from "@curio/ui/components/ai-elements/attachments";
import type { ChatAttachmentData } from "@curio/ui/components/ai-elements/attachments";
import {
  PromptInputHeader,
  usePromptInputAttachments,
} from "@curio/ui/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@curio/ui/components/ai-elements/prompt-input";

/** Adapts a staged prompt-input file to the chip-render attachment shape. */
function toChatAttachmentData(
  stagedFile: PromptInputMessage["files"][number]
): ChatAttachmentData {
  return {
    filename: stagedFile.filename,
    mediaType: stagedFile.mediaType,
    url: stagedFile.url,
  };
}

/**
 * Attachment strip above the prompt textarea. Only mounts the header addon
 * when attachments exist — an always-on header leaves a phantom padded strip
 * between the top border and the textarea.
 */
export function PromptInputAttachmentsDisplay() {
  const stagedAttachments = usePromptInputAttachments();

  if (stagedAttachments.files.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader>
      <Attachments className="px-2 pt-1">
        {stagedAttachments.files.map((stagedFile) => (
          <ChatAttachment
            attachment={toChatAttachmentData(stagedFile)}
            key={stagedFile.id}
            onRemove={(attachmentId) => {
              stagedAttachments.remove(attachmentId);
            }}
          />
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}
