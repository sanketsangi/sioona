"use client";

import { useId } from "react";

const MARK_PATH =
  "M124 44.4752V58.331L136 51.4028L164 62.9498L160 92.972L148 99.9004L160 106.829L164 136.851L136 148.398L124 141.47V155.326L100 173.801L76 155.326V141.47L64 148.398L36 136.851L40 106.829L52.0004 99.9004L40 92.972L36 62.9498L64 51.4028L76 58.331V44.4752L100 26L124 44.4752ZM78 45.4596L100 28.524L122 45.4596V59.4857L104 69.878L100.375 97.0885L100 97.3769L99.6254 97.0885L96 69.878L78 59.4857V45.4596ZM54.0004 101.055L41.8525 108.069L38.1858 135.589L63.8525 146.174L76 139.16V118.376L97.7517 101.631L97.8142 101.163L97.3764 100.982L72 111.447L54.0004 101.055ZM94.7535 99.9004L72.1475 109.223L56.0004 99.9004L72.1475 90.5779L94.7535 99.9004ZM97.3764 98.8187L72 88.3537L54.0004 98.7457L41.8525 91.7321L38.1858 64.2117L63.8525 53.627L76 60.6404V81.4256L97.7518 98.1702L97.8142 98.6382L97.3764 98.8187ZM97.377 104.444L78 119.36V138.006L94.1475 128.683L97.377 104.444ZM78 140.315L96 129.923L99.6253 102.713L100 102.425L100.375 102.713L104 129.923L122 140.315V154.342L100 171.278L78 154.342V140.315ZM105.852 71.1178L122 61.7951V80.4413L102.623 95.3578L105.852 71.1178ZM124 81.4256L102.248 98.1702L102.186 98.6382L102.624 98.8187L128 88.3537L146 98.7457L158.148 91.7321L161.814 64.2117L136.148 53.627L124 60.6404V81.4256ZM128 111.447L102.624 100.982L102.186 101.163L102.248 101.631L124 118.376V139.16L136.148 146.174L161.814 135.589L158.148 108.069L146 101.055L128 111.447ZM127.852 109.223L144 99.9004L127.852 90.5779L105.247 99.9004L127.852 109.223ZM102.623 104.444L122 119.36V138.006L105.852 128.683L102.623 104.444ZM94.1475 71.1178L97.3771 95.3578L78 80.4413V61.7951L94.1475 71.1178Z";

/** Same faceted hex mark as the app sidebar brand. */
export function SioonaMark({ className = "size-8 shrink-0", solid = false }: { className?: string; solid?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const maskId = `sioona-mark-stroke-mask-${uid}`;
  const fillId = `sioona-mark-fill-${uid}`;
  const strokeId = `sioona-mark-stroke-${uid}`;

  if (solid) {
    return (
      <svg width="200" height="200" viewBox="24 24 152 152" fill="currentColor" className={className} aria-hidden>
        <path fillRule="evenodd" clipRule="evenodd" d={MARK_PATH} />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="200"
      height="200"
      viewBox="24 24 152 152"
      fill="none"
      className={className}
      aria-hidden
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="34"
        y="24"
        width="132"
        height="152"
        fill="black"
      >
        <rect fill="white" x="34" y="24" width="132" height="152" />
        <path fillRule="evenodd" clipRule="evenodd" d={MARK_PATH} />
      </mask>
      <path fillRule="evenodd" clipRule="evenodd" d={MARK_PATH} fill={`url(#${fillId})`} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={MARK_PATH}
        stroke={`url(#${strokeId})`}
        strokeWidth="2"
        mask={`url(#${maskId})`}
      />
      <defs>
        <radialGradient
          id={fillId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(100 99.9008) rotate(56.4881) scale(106.863 92.5459)"
        >
          <stop />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={strokeId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(100 99.9007) rotate(55.8228) scale(107.698 93.2696)"
        >
          <stop />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
