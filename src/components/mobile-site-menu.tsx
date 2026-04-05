"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useSyncExternalStore } from "react";

import { HeaderAuth } from "@/components/header-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type MobileSiteMenuProps = {
  navItems: Array<{
    href: string;
    label: string;
  }>;
};

export function MobileSiteMenu({ navItems }: MobileSiteMenuProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="flex items-center gap-2 md:hidden">
      <ThemeToggle />
      {!mounted ? (
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          type="button"
          aria-label="Open menu"
        >
          <Menu className="size-4.5" />
        </Button>
      ) : (
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="rounded-full">
              <Menu className="size-4.5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[86vw] max-w-sm">
            <SheetHeader>
              <SheetTitle>AIPLOT.FUN</SheetTitle>
            </SheetHeader>
            <div className="mt-8 flex flex-col gap-4">
              {navItems.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant="ghost"
                  className="justify-start rounded-2xl text-base"
                >
                  <a href={item.href}>{item.label}</a>
                </Button>
              ))}
              <div className="pt-4">
                <HeaderAuth />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
