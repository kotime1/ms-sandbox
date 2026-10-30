// Kept in its own module so engine files (automation.js ...) can throw it without importing world.js (which would be circular).
export class SimError extends Error {
  constructor(message, code = 'BadRequest') {
    super(message);
    this.name = 'SimError';
    this.code = code;
  }
}
