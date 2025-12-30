/**
 * Utility Functions
 * General-purpose helper functions used across the codebase
 */

/**
 * Deep clone an object using structuredClone if available, otherwise falls back to JSON method
 * Prefer structuredClone as it's more efficient and handles more cases correctly
 */
export function deepClone<T>(obj: T): T {
  // Use structuredClone if available (Node.js 17+, modern browsers)
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj)
    } catch (error) {
      // If structuredClone fails (e.g., with functions or symbols), fall back to JSON method
      // Note: This will lose functions, undefined values, and symbols
    }
  }
  
  // Fallback to JSON method (slower but more compatible)
  // Note: This doesn't handle functions, undefined, or circular references
  return JSON.parse(JSON.stringify(obj)) as T
}

