export class AttendanceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceCommandError";
  }
}
