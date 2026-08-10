import { CircleNotch } from "@phosphor-icons/react/ssr";

/** Spinner for loading buttons — keep the original label beside this. */
export function ButtonSpinner({ className = "btn-spinner" }: { className?: string }) {
  return (
    <CircleNotch className={className} weight="regular" aria-hidden />
  );
}
