/**
 * Utility functions for JSON serialization with BigInt support.
 */
export class JsonUtils {
  /**
   * JSON.stringify with BigInt support.
   * Converts BigInt values to strings automatically.
   *
   * @param value The value to stringify
   * @param space Optional spacing for formatting
   * @returns JSON string with BigInt values converted to strings
   */
  public static stringify(value: unknown, space?: string | number): string {
    return JSON.stringify(
      value,
      (key, val) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        return val;
      },
      space,
    );
  }

  /**
   * JSON.parse that can handle BigInt values that were stringified.
   * This is a basic parser - for complex BigInt restoration,
   * use the specific fromJSON methods of each class.
   *
   * @param text The JSON string to parse
   * @returns Parsed object
   */
  public static parse(text: string): unknown {
    return JSON.parse(text);
  }

  /**
   * Safe serialization for objects that might contain BigInt values.
   * First calls toJSON() if available, then applies BigInt-safe stringify.
   *
   * @param obj Object to serialize
   * @param space Optional spacing for formatting
   * @returns JSON string
   */
  public static safeStringify(obj: unknown, space?: string | number): string {
    // If object has toJSON method, use it first
    if (obj && typeof obj === 'object' && 'toJSON' in obj && typeof obj.toJSON === 'function') {
      const jsonObj = obj.toJSON();
      return JsonUtils.stringify(jsonObj, space);
    }

    // Otherwise use BigInt-safe stringify directly
    return JsonUtils.stringify(obj, space);
  }
}
