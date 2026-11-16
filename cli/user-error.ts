/**
 * A problem the person running `food` can act on (a bad input file, a vault note to fix, AH or the Pi out of reach).
 * `food` prints its message without a stack trace; anything else is a bug and gets one.
 */
export class UserError extends Error {}
