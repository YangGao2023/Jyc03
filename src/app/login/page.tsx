import Link from "next/link";

type SearchParams = Promise<{
  error?: string;
  next?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = params?.next?.startsWith("/") ? params.next : "/dashboard";
  const hasError = params?.error === "1";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full rounded-[32px] border border-white/10 bg-[linear-gradient(145deg,_rgba(15,23,42,0.94),_rgba(30,41,59,0.92))] p-6 shadow-2xl lg:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-sky-300">Owner Login</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">老板后台登录入口</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            这个登录页先保留着，但当前本地原型已经临时改成可直接进入 `/dashboard`，方便你先做页面和流程验证。
          </p>

          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50">
            当前为本地临时放行模式，后台暂时不需要账号密码。后面如果要恢复，只需要重新挂回 `/dashboard` 的访问门即可。
          </div>

          {hasError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
              登录失败，请检查账号是否填写、密码是否正确。
            </div>
          ) : null}

          <form action="/api/login" method="POST" className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
            <input type="hidden" name="next" value={next} />
            <div className="grid gap-4">
              <label className="text-sm font-medium text-slate-200">
                账号
                <input
                  name="username"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  placeholder="owner / admin"
                />
              </label>
              <label className="text-sm font-medium text-slate-200">
                密码
                <input
                  name="password"
                  type="password"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </label>
              <button className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100">
                登录进入后台
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href="/" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-slate-200 hover:bg-white/10">
              返回前台
            </Link>
            <Link href="/dashboard" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-slate-200 hover:bg-white/10">
              试图进入后台
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
