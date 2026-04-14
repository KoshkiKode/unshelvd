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
      target={target ?? "_blank"}
      rel={rel ?? "noopener noreferrer"}
    />
  );
}
