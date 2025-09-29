import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * This ensures that conflicting Tailwind classes are properly merged
 * 
 * @param inputs - Class values to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Utility function to conditionally apply classes
 * 
 * @param condition - Boolean condition
 * @param trueClasses - Classes to apply when condition is true
 * @param falseClasses - Classes to apply when condition is false
 * @returns Conditional class string
 */
export function conditionalClass(
  condition: boolean,
  trueClasses: string,
  falseClasses: string = ''
) {
  return condition ? trueClasses : falseClasses;
}

/**
 * Utility function to create variant-based class names
 * Useful for component variants
 * 
 * @param base - Base classes
 * @param variants - Variant classes object
 * @param selectedVariant - Selected variant key
 * @returns Combined class string
 */
export function variantClass<T extends string>(
  base: string,
  variants: Record<T, string>,
  selectedVariant: T
) {
  return cn(base, variants[selectedVariant]);
}

/**
 * Utility function to create size-based class names
 * 
 * @param sizes - Size classes object
 * @param selectedSize - Selected size key
 * @returns Size class string
 */
export function sizeClass<T extends string>(
  sizes: Record<T, string>,
  selectedSize: T
) {
  return sizes[selectedSize];
}

/**
 * Utility function for responsive class names
 * 
 * @param mobile - Mobile classes
 * @param tablet - Tablet classes (optional)
 * @param desktop - Desktop classes (optional)
 * @returns Responsive class string
 */
export function responsiveClass(
  mobile: string,
  tablet?: string,
  desktop?: string
) {
  return cn(
    mobile,
    tablet && `md:${tablet}`,
    desktop && `lg:${desktop}`
  );
}

/**
 * Utility function for state-based classes
 * Common for interactive elements
 * 
 * @param base - Base classes
 * @param states - State classes object
 * @returns State class string
 */
export function stateClass(
  base: string,
  states: {
    hover?: string;
    focus?: string;
    active?: string;
    disabled?: string;
  }
) {
  return cn(
    base,
    states.hover && `hover:${states.hover}`,
    states.focus && `focus:${states.focus}`,
    states.active && `active:${states.active}`,
    states.disabled && `disabled:${states.disabled}`
  );
}
