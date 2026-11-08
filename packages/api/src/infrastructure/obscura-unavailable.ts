import { Data } from "effect";

export class ObscuraUnavailable extends Data.TaggedError("ObscuraUnavailable")<{
  readonly message: string;
}> {}
