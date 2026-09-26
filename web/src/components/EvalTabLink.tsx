"use client"

import Link from "next/link"
import {
  useEffect,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react"

type EvalTabLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string
  children: ReactNode
}

/**
 * Tab trigger rendered as a link. Radix cancels non-primary mousedown, which
 * blocks middle-click and Ctrl/Cmd-click. Stop those events before they reach
 * the React root so the browser can open the href.
 */
export function EvalTabLink({
  href,
  children,
  onKeyDown,
  ref,
  ...props
}: EvalTabLinkProps & { ref?: Ref<HTMLAnchorElement> }) {
  const innerRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey) {
        event.stopPropagation()
      }
    }
    el.addEventListener("mousedown", onMouseDown)
    return () => el.removeEventListener("mousedown", onMouseDown)
  }, [])

  return (
    <Link
      {...props}
      ref={(node: HTMLAnchorElement | null) => {
        innerRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      href={href}
      scroll={false}
      onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => {
        onKeyDown?.(event)
        if (
          event.defaultPrevented ||
          event.key !== " " ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return
        }
        event.preventDefault()
        event.currentTarget.click()
      }}
    >
      {children}
    </Link>
  )
}
