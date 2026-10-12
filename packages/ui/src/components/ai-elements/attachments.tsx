"use client";

import {
  Attachment,
  AttachmentActions,
  AttachmentAction,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@curio/ui/components/attachment";
import { cn } from "@curio/ui/lib/utils";
import { FileTextIcon, XIcon } from "lucide-react";

export interface ChatAttachmentData {
  readonly id?: string;
  readonly filename?: string;
  readonly mediaType?: string;
  readonly url?: string;
}

export type AttachmentsProps = React.ComponentProps<"div">;

export const Attachments = ({ className, ...props }: AttachmentsProps) => (
  <div
    data-slot="chat-attachments"
    className={cn("flex flex-wrap items-center gap-2", className)}
    {...props}
  />
);

export type ChatAttachmentProps = React.ComponentProps<typeof Attachment> & {
  attachment: ChatAttachmentData;
  onRemove?: (id: string) => void;
};

export const ChatAttachment = ({
  attachment,
  onRemove,
  className,
  children,
  ...props
}: ChatAttachmentProps) => {
  const isImage = attachment.mediaType?.startsWith("image/");
  const attachmentId = attachment.id ?? attachment.filename ?? "attachment";

  return (
    <Attachment className={cn("relative", className)} {...props}>
      {children ?? (
        <>
          <AttachmentMedia variant={isImage ? "image" : "icon"}>
            {isImage && attachment.url ? (
              <img
                alt={attachment.filename ?? "Attachment"}
                src={attachment.url}
                className="size-full object-cover"
              />
            ) : (
              <FileTextIcon />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>
              {attachment.filename ?? "Attachment"}
            </AttachmentTitle>
          </AttachmentContent>
          {onRemove && (
            <AttachmentActions>
              <AttachmentAction
                aria-label={`Remove ${attachment.filename ?? "attachment"}`}
                onClick={() => onRemove(attachmentId)}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          )}
        </>
      )}
    </Attachment>
  );
};
