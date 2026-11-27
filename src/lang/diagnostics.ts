/** An explicitly identified limitation, not a claim that the C is invalid. */
export class UnsupportedC extends Error {
  constructor(public readonly line: number, explanation: string) {
    super(`line ${line}: ${explanation}`);
  }
}

/** A definite source error, as opposed to a token this parser cannot classify. */
export class InvalidC extends Error {
  constructor(public readonly line: number, explanation: string) {
    super(`line ${line}: ${explanation}`);
  }
}
