type IconProps = { className?: string };

/** Stacked layers — Signals metric (user-provided SVG). */
export function LayersIcon({ className = "size-4 shrink-0" }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M0 5.25124V4.24858L0.463236 4.0569L7.71324 1.0569L8 0.938232L8.28676 1.0569L15.5368 4.0569L16 4.24858V5.25124L15.5368 5.44292L8.28676 8.44292L8 8.56158L7.71324 8.44292L0.463236 5.44292L0 5.25124ZM0 8.45813V6.83479L0.536764 7.0569L8 10.1452L15.4632 7.0569L16 6.83479V8.45813L8.28676 11.6498L8 11.7685L7.71324 11.6498L0 8.45813ZM0 11.7082V10.0848L0.536764 10.3069L8 13.3952L15.4632 10.3069L16 10.0848V11.7082L8.28676 14.8998L8 15.0185L7.71324 14.8998L0 11.7082ZM8 6.93823L2.71154 4.74991L8 2.56158L13.2885 4.74991L8 6.93823Z"
      />
    </svg>
  );
}
