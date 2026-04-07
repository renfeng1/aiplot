import Link from "next/link";
import { Sparkles } from "lucide-react";

import { HeaderAuth } from "@/components/header-auth";
import { MobileSiteMenu } from "@/components/mobile-site-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { emergencyMaintenance } from "@/lib/maintenance";

const navItems = emergencyMaintenance
  ? [{ href: "/" as const, label: "首页" }]
  : [
      { href: "/" as const, label: "首页" },
      { href: "/characters" as const, label: "角色" },
      { href: "/create" as const, label: "创建角色" },
    ];

export function SiteHeader() {
  return (
    <header className="page-shell sticky top-0 z-50 pt-4 sm:pt-6">
      <div className="surface flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.18em] text-muted-foreground">
              AIPLOT.FUN
            </div>
            <div className="text-xs text-muted-foreground">
              角色蒸馏、长期记忆与正式产品化聊天体验
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {emergencyMaintenance ? (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
              临时维护中
            </span>
          ) : null}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <HeaderAuth />
        </div>

        <MobileSiteMenu navItems={navItems} />
      </div>
    </header>
  );
}
