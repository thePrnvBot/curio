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
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { playInteractionCue } from "@/utils/sound";

export default function UserMenu({
  compact = false,
}: {
  /** Mobile-dock variant: a fixed-width pill so the dock's total width is
   * constant and the pending skeleton never shifts the layout. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return compact ? (
      <Skeleton className="h-7 w-32 rounded-full" />
    ) : (
      <Skeleton className="h-7 w-24 rounded-full" />
    );
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline" className="rounded-full">
          Sign In
        </Button>
      </Link>
    );
  }

  const triggerClassName = compact
    // Fixed width: the dropdown panel matches the trigger anchor, so the
    // pill must hold a constant width for the dock/menu relationship to
    // stay pixel-stable. w-32 (8rem) is exactly the account dropdown's own
    // 8rem floor, so that menu and its pill are the same width too.
    ? "w-32"
    : "hover:-translate-y-0.5 min-w-32 max-w-40";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={`truncate rounded-full hover:shadow-sm ${triggerClassName}`}
            variant="outline"
          />
        }
      >
        {session.user.name}
      </DropdownMenuTrigger>
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
    </DropdownMenu>
  );
}
