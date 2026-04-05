import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page-shell py-20">
      <div className="surface mx-auto max-w-2xl space-y-4 px-6 py-10 text-center">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          404
        </div>
        <h1 className="font-heading text-4xl">没有找到这个角色</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          这个角色可能是私有的、已被移除，或尚未创建。
        </p>
        <Button asChild className="rounded-full">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </main>
  );
}
