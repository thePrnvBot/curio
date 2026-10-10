import type { Session } from "@curio/auth";
import type { Database } from "@curio/db";

export interface Context {
  session: Session | null;
  db: Database;
}
