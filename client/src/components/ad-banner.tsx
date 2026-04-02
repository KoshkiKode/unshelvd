/**
 * Ad Banner — lightweight, non-intrusive ad slots
 * 
 * Supports:
 * - Google AdSense (set VITE_ADSENSE_CLIENT in env)
 * - Custom house ads (fallback when no ad network configured)
 * - Respectful sizing: leaderboard (728x90), banner (320x50), medium rect (300x250)
 * 
 * These are SUBSIDIZATION ads — small, tasteful, never popup/interstitial.
 */

import { useEffect, useRef } from "react";

type AdSize = "banner" | "leaderboard" | "medium-rect";

const adSizes: Record<AdSize, { width: number; height: number; slot: string }> = {
  banner: { width: 320, height: 50, slot: "banner" },
  leaderboard: { width: 728, height: 90, slot: "leaderboard" },
  "medium-rect": { width: 300, height: 250, slot: "medium-rect" },
};

interface AdBannerProps {
  size?: AdSize;
  className?: string;
}

// House ads shown when no ad network is configured
const houseAds = [
  { text: "List your first book — it's free", link: "/dashboard/add-book" },
  { text: "Looking for something specific? Post a book request", link: "/requests" },
  { text: "Unshelv'd — Where every book finds its next reader", link: "/" },
  { text: "Explore books from 150+ languages worldwide", link: "/browse" },
];

export default function AdBanner({ size = "banner", className = "" }: AdBannerProps) {
  const adRef = useRef<HTMLDivElement>(null);
  const { width, height } = adSizes[size];
  const adsenseClient = import.meta.env.VITE_ADSENSE_CLIENT;

  useEffect(() => {
    // If AdSense is configured, try to load an ad
    if (adsenseClient && adRef.current) {
      try {
        // @ts-ignore — AdSense global
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // AdSense not loaded yet, house ad will show
      }
    }
  }, [adsenseClient]);

  const randomHouseAd = houseAds[Math.floor(Math.random() * houseAds.length)];

  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ maxWidth: width, maxHeight: height }}
      data-testid={`ad-slot-${size}`}
    >
      {adsenseClient ? (
        // Google AdSense
        <div ref={adRef}>
          <ins
            className="adsbygoogle"
            style={{ display: "block", width, height }}
            data-ad-client={adsenseClient}
            data-ad-slot={adSizes[size].slot}
            data-ad-format="auto"
          />
        </div>
      ) : (
        // House ad fallback — clean and on-brand
        <a
          href={`/#${randomHouseAd.link}`}
          className="flex items-center justify-center w-full rounded border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors text-xs text-muted-foreground px-4"
          style={{ height, maxWidth: width }}
        >
          <span>{randomHouseAd.text}</span>
        </a>
      )}
    </div>
  );
}
