"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-10 rounded-full"
      onClick={() => {
        if (!mounted) return;
        setTheme(isDark ? "light" : "dark");
      }}
      aria-label="切换主题"
    >
      {!mounted ? (
        <span className="size-4.5" aria-hidden />
      ) : isDark ? (
        <SunMedium className="size-4.5" />
      ) : (
        <MoonStar className="size-4.5" />
      )}
    </Button>
  );
}
