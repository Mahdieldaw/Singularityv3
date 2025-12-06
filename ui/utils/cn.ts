/**
 * A simple utility to merge class names.
 * This is a lightweight replacement for clsx + tailwind-merge since those dependencies are not installed.
 */
export function cn(...classes: (string | undefined | null | false | 0)[]) {
    return classes.filter(Boolean).join(" ");
}
