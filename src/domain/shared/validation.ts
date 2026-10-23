export function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to 0.`);
  }
  return value;
}

export function positive(value: number, name: string): number {
  nonNegative(value, name);
  if (value === 0) throw new RangeError(`${name} must be greater than 0.`);
  return value;
}

export function integer(value: number, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${minimum}.`);
  }
  return value;
}

export function assertNever(value: never): never {
  throw new RangeError(`Unsupported domain value: ${String(value)}`);
}
