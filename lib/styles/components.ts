/**
 * Centralized component style utilities
 * Provides reusable class combinations for common UI components
 */

/**
 * Button style variants
 */
export const buttonStyles = {
  primary: "px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary: "px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-black bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed",
  danger: "px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed",
  link: "text-black hover:underline focus:outline-none",
  ghost: "px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

/**
 * Form input styles
 */
export const inputStyles = {
  base: "block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-black",
  error: "block w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-black",
} as const;

/**
 * Form label styles
 */
export const labelStyles = {
  base: "block text-sm font-medium text-black mb-1",
  required: "block text-sm font-medium text-black mb-1",
  optional: "block text-sm font-medium text-gray-600 mb-1",
} as const;

/**
 * Card/container styles
 */
export const cardStyles = {
  base: "p-4 bg-white rounded-md border border-gray-200",
  elevated: "p-4 bg-white rounded-md border border-gray-200 shadow-sm",
  filled: "p-4 bg-gray-50 rounded-md border border-gray-200",
} as const;

/**
 * Badge styles
 */
export const badgeStyles = {
  base: "px-2 py-0.5 text-xs font-medium rounded flex-shrink-0",
  compact: "px-1.5 py-0.5 text-xs font-medium rounded flex-shrink-0",
} as const;

/**
 * Alert/message styles
 */
export const alertStyles = {
  success: "rounded-md p-4 bg-green-50 text-green-800",
  error: "rounded-md p-4 bg-red-50 text-red-800",
  warning: "rounded-md p-4 bg-yellow-50 text-yellow-800",
  info: "rounded-md p-4 bg-blue-50 text-blue-800",
} as const;

export type AlertVariant = keyof typeof alertStyles;

/**
 * Helper function to combine class names (similar to clsx/classnames)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

