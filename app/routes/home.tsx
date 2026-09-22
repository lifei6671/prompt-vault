import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Prompt Vault" },
    { name: "description", content: "Prompt Vault 工程骨架已就绪。" },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="flex flex-col gap-5">
        <p className="text-sm font-medium text-muted-foreground">Phase 1</p>
        <h1 className="text-4xl font-semibold tracking-tight">Prompt Vault</h1>
        <p className="max-w-xl text-muted-foreground">
          工程骨架已就绪：React Router SSR、Cloudflare Workers、D1、R2 与本地测试环境均已配置。
        </p>
        <div>
          <Button type="button">工程骨架就绪</Button>
        </div>
      </section>
    </main>
  );
}
