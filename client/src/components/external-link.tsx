import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { isNative, openExternalUrl } from "@/lib/native";

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export default function ExternalLink({
  href,
  onClick,
  rel,
  target,
  ...props
}: ExternalLinkProps) {
  const resolvedTarget = target ?? "_blank";
  const relTokens = new Set((rel ?? "").split(/\s+/).filter(Boolean));
  if (resolvedTarget === "_blank") {
    relTokens.add("noopener");
    relTokens.add("noreferrer");
  }
  const resolvedRel = relTokens.size > 0 ? [...relTokens].join(" ") : undefined;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (isNative() && /^https?:\/\//i.test(href)) {
      event.preventDefault();
      void openExternalUrl(href);
    }
  };

  return (
    <a
      {...props}
      href={href}
      onClick={handleClick}
      target={resolvedTarget}
      rel={resolvedRel}
    />
  );
}
