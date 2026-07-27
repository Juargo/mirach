// Conventional Commits enforcement (ADR-020). Deliberately NO scope-enum:
// release-please groups changes by file path, not by commit scope
// (design DD7), existing history already uses scopes beyond the 4
// workspaces, and a strict enum would reject legitimate history for zero
// versioning benefit.
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
