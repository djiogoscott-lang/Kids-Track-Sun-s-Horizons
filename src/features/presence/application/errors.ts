export class PresenceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresenceCommandError";
  }
}
