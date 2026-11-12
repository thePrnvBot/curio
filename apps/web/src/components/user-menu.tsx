import { Button } from "@curio/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@curio/ui/components/dropdown-menu";
import { Skeleton } from "@curio/ui/components/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogInIcon } from "lucide-react";
import type { ReactElement } from "react";

import { authClient } from "@/lib/auth-client";
import { resetChatRuntime } from "@/utils/chat-runtime";
import { playInteractionCue } from "@/utils/sound";

function AccountMenuContent({
  session,
}: {
  session: { user: { email: string } };
}): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <DropdownMenuContent className="bg-card">
      <DropdownMenuGroup>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>{session.user.email}</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            playInteractionCue("close", { emphasis: "subtle" });
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  resetChatRuntime();
                  queryClient.clear();
                  navigate({
                    to: "/",
                  });
                },
              },
            });
          }}
        >
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

export default function UserMenu({
  compact = false,
}: {
  /** Mobile-dock variant: a fixed-diameter circular trigger so the dock's
   * total width is constant, and the pending skeleton never shifts it. */
  compact?: boolean;
}) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return compact ? (
      <Skeleton className="size-7 rounded-full" />
    ) : (
      <Skeleton className="h-7 w-24 rounded-full" />
    );
  }

  if (!session) {
    if (compact) {
      // Fixed footprint (size-7) like every other dock element, so the
      // dock's width stays deterministic regardless of auth state.
      return (
        <Link to="/login">
          <Button
            aria-label="Sign in"
            className="rounded-full"
            size="icon"
            variant="outline"
          >
            <LogInIcon aria-hidden="true" />
          </Button>
        </Link>
      );
    }
    return (
      <Link to="/login">
        <Button variant="outline" className="rounded-full">
          Sign In
        </Button>
      </Link>
    );
  }

  if (compact) {
    // A 1.75rem circle with the name's initial: same fixed footprint as the
    // dock's other elements. Its dropdown is anchored to the circle and
    // keeps the library's own min-width floor for the email content.
    const initial = (session.user.name ?? "C").slice(0, 1).toUpperCase();
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Open account menu"
              className="rounded-full font-semibold"
              size="icon"
              variant="outline"
            >
              {initial}
            </Button>
          }
        />
        <AccountMenuContent session={session} />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="max-w-40 min-w-32 truncate rounded-full"
            variant="outline"
          />
        }
      >
        {session.user.name}
      </DropdownMenuTrigger>
      <AccountMenuContent session={session} />
    </DropdownMenu>
  );
}
