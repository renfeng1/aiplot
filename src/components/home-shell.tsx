"use client";

import type { Route } from "next";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Users, Lock } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CharacterCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  shortDescription: string | null;
  tags: string[];
  creationStatus?: "DRAFT" | "DISTILLING" | "FAILED" | "READY";
  currentVersionId?: string | null;
  creationMessage?: string | null;
  lastError?: string | null;
};

function publicCardHref(character: CharacterCard): Route {
  return `/characters/${character.slug}` as Route;
}

function ownedCardHref(character: CharacterCard): Route {
  if (character.currentVersionId) {
    return `/characters/${character.slug}` as Route;
  }
  return `/create?characterId=${character.id}` as Route;
}

function statusLabel(status?: CharacterCard["creationStatus"]) {
  switch (status) {
    case "READY":
      return "已完成";
    case "FAILED":
      return "失败";
    case "DISTILLING":
      return "创建中";
    default:
      return "草稿";
  }
}

export function HomeShell({
  isSignedIn,
  publicCharacters,
  serviceWarning,
  ownedCharacters,
}: {
  isSignedIn: boolean;
  publicCharacters: CharacterCard[];
  serviceWarning?: string | null;
  ownedCharacters: CharacterCard[];
}) {
  return (
    <div className="pb-20">
      <SiteHeader />
      <main className="page-shell mt-6 space-y-10 sm:mt-10">
        {serviceWarning ? (
          <section className="surface border-amber-500/30 bg-amber-500/8 px-5 py-4 text-sm leading-7 text-amber-950 sm:px-6 dark:text-amber-100">
            {serviceWarning}
          </section>
        ) : null}
        <section className="surface relative overflow-hidden px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
          <div className="hero-grid absolute inset-0 opacity-70" />
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="space-y-6"
            >
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
              >
                正式产品
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-balance font-heading text-5xl leading-[0.96] sm:text-6xl lg:text-7xl">
                  资料凝成 Ta，
                  <br />
                  时光酿出我们。
                </h1>
                <p className="max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
                  上传文本、文档、截图和照片，生成有角色设定、可持续记忆、可长期对话的正式角色。
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-6">
                  <Link href="/characters">
                    查看公共角色
                    <ArrowRight className="size-4.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full px-6"
                >
                  {isSignedIn ? (
                    <Link href="/create">创建角色</Link>
                  ) : (
                    <a href="/sign-in">登录 / 注册</a>
                  )}
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
              className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1"
            >
              {[
                {
                  icon: Sparkles,
                  title: "角色蒸馏",
                  body: "从多源资料中提取人格、知识、语气和长期关系线索。",
                },
                {
                  icon: Users,
                  title: "公共角色",
                  body: "所有用户可浏览和使用管理员发布的公共角色。",
                },
                {
                  icon: Lock,
                  title: "私有角色",
                  body: "你创建的角色和记忆默认只对你自己可见。",
                },
              ].map((feature) => (
                <Card
                  key={feature.title}
                  className="rounded-[1.75rem] border-white/60 bg-white/70 dark:border-white/10 dark:bg-white/5"
                >
                  <CardContent className="space-y-3 p-5">
                    <feature.icon className="size-5 text-primary" />
                    <div className="space-y-1.5">
                      <h2 className="text-sm font-semibold">{feature.title}</h2>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {feature.body}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
              >
                公共角色
              </Badge>
              <h2 className="mt-3 font-heading text-3xl sm:text-4xl">
                所有人都能使用的公共角色
              </h2>
            </div>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/characters">查看全部</Link>
            </Button>
          </div>

          {publicCharacters.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {publicCharacters.map((character) => (
                <Link
                  key={character.id}
                  href={publicCardHref(character)}
                  className="surface group block overflow-hidden rounded-[1.75rem] p-5 transition-transform hover:-translate-y-0.5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">{character.title}</div>
                      <Sparkles className="size-4 text-primary transition-transform group-hover:rotate-12" />
                    </div>
                    <p className="min-h-14 text-sm leading-6 text-muted-foreground">
                      {character.shortDescription ?? character.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {character.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="surface px-5 py-6 text-sm leading-7 text-muted-foreground">
              目前还没有公共角色。管理员创建后会在这里展示。
            </div>
          )}
        </section>

        {isSignedIn ? (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <Badge
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs tracking-[0.18em]"
                >
                  我的角色
                </Badge>
                <h2 className="mt-3 font-heading text-3xl sm:text-4xl">
                  我的角色与创建状态
                </h2>
              </div>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/create">创建角色</Link>
              </Button>
            </div>

            {ownedCharacters.length ? (
              <div className="grid gap-4 md:grid-cols-3">
                {ownedCharacters.map((character) => (
                  <Link
                    key={character.id}
                    href={ownedCardHref(character)}
                    className="surface group block overflow-hidden rounded-[1.75rem] p-5 transition-transform hover:-translate-y-0.5"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-lg font-semibold">{character.title}</div>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                          {statusLabel(character.creationStatus)}
                        </span>
                      </div>
                      <p className="min-h-14 text-sm leading-6 text-muted-foreground">
                        {character.shortDescription ?? character.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {character.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {character.creationStatus === "FAILED"
                          ? character.lastError || "蒸馏失败，可点击继续处理"
                          : character.creationStatus === "DISTILLING"
                            ? character.creationMessage || "角色正在后台创建中"
                            : character.creationMessage || "角色已完成"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="surface px-5 py-6 text-sm leading-7 text-muted-foreground">
                你还没有私有角色。创建后，这里的状态会持续保留。
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
