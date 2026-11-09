export interface PublicSessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image?: string | null;
}

export interface PublicSession {
  readonly user: PublicSessionUser;
}

export function toPublicSession<T extends { user: PublicSessionUser }>(
  session: T | null
): PublicSession | null {
  if (session === null) {
    return null;
  }
  const { id, name, email, image } = session.user;
  return { user: { id, name, email, image } };
}
