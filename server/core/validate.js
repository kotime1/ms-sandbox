// Tiny declarative input validator. Every value that reaches simulator code has passed
// through this: unknown keys are dropped, types and lengths are enforced, and the result is a
// fresh null-prototype object, so request bodies cannot smuggle `__proto__`/`constructor` keys.
//
// Spec shapes:
//   { type: 'string', max: 200, min: 1, pattern: /.../, optional: true }
//   { type: 'boolean' }  { type: 'int', min, max }
//   { type: 'enum', values: [...] }
//   { type: 'array', of: <spec>, max: 20 }

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const hasControl = (s) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);

export function validateValue(spec, value, path) {
  if (value === undefined || value === null) {
    if (spec.optional) return spec.default;
    throw new ValidationError(`${path} is required`);
  }
  switch (spec.type) {
    case 'string': {
      if (typeof value !== 'string') throw new ValidationError(`${path} must be a string`);
      const max = spec.max ?? 200;
      if (value.length > max) throw new ValidationError(`${path} is too long (max ${max})`);
      if (value.length < (spec.min ?? 0)) throw new ValidationError(`${path} is too short`);
      if (hasControl(value)) throw new ValidationError(`${path} contains control characters`);
      if (spec.pattern && !spec.pattern.test(value)) throw new ValidationError(`${path} has an invalid format`);
      return value;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw new ValidationError(`${path} must be true or false`);
      return value;
    case 'int':
      if (!Number.isInteger(value)) throw new ValidationError(`${path} must be a whole number`);
      if (value < (spec.min ?? -1e9) || value > (spec.max ?? 1e9)) throw new ValidationError(`${path} is out of range`);
      return value;
    case 'enum':
      if (!spec.values.includes(value)) throw new ValidationError(`${path} must be one of: ${spec.values.join(', ')}`);
      return value;
    case 'array': {
      if (!Array.isArray(value)) throw new ValidationError(`${path} must be a list`);
      if (value.length > (spec.max ?? 50)) throw new ValidationError(`${path} has too many items`);
      return value.map((v, i) => validateValue(spec.of, v, `${path}[${i}]`));
    }
    default:
      throw new Error(`bad spec type ${spec.type}`);
  }
}

export function validateObject(shape, input, path = 'params') {
  if (input === undefined || input === null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new ValidationError(`${path} must be an object`);
  const out = Object.create(null);
  for (const key of Object.keys(shape)) {
    const v = validateValue(shape[key], Object.hasOwn(input, key) ? input[key] : undefined, `${path}.${key}`);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Ids used across the simulator: short, lowercase, URL/DOM safe. */
export const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const idSpec = (extra = {}) => ({ type: 'string', max: 64, min: 1, pattern: ID, ...extra });
