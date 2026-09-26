import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Typography roles (`text-label-14`, `text-copy-14`, …) are font sizes.
 * Without this, tailwind-merge treats them as text colors and drops them
 * when a `text-sio-*` color is in the same class list.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "label-12",
            "label-13",
            "label-14",
            "copy-14",
            "copy-16",
            "heading-16",
            "heading-20",
            "heading-24",
            "heading-32",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
