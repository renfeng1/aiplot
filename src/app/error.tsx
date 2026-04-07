"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

function isDatabaseIssue(error: Error) {
  const message = error.message.toLowerCase();

  return (
    message.includes("data transfer quota") ||
    message.includes("database_url") ||
    message.includes("database") ||
    message.includes("prisma")
  );
}

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const databaseIssue = isDatabaseIssue(error);

  return (
    <main className="page-shell py-20">
      <div className="surface mx-auto max-w-2xl space-y-4 px-6 py-10 text-center">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Service Error
        </div>
        <h1 className="font-heading text-4xl">
          {databaseIssue ? "数据服务暂时不可用" : "页面加载失败"}
        </h1>
        <p className="text-sm leading-7 text-muted-foreground">
          {databaseIssue
            ? "当前数据库服务没有正常响应，所以这部分页面暂时无法渲染。你可以稍后重试，或先返回首页继续浏览。"
            : "服务器在渲染页面时发生了异常。请重试；如果问题持续存在，再继续排查对应模块。"}
        </p>
        <div className="flex justify-center gap-3">
          <Button type="button" className="rounded-full" onClick={unstable_retry}>
            重新加载
          </Button>
          <Button asChild type="button" variant="outline" className="rounded-full">
            <Link href="/">返回首页</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
