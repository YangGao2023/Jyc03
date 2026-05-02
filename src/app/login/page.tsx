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
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg lg:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-600">Owner Login</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-800 lg:text-4xl">老板后台登录入口</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            请使用账号密码登录。
          </p>

          {hasError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              登录失败，请检查账号是否填写、密码是否正确。
            </div>
          ) : null}

          <form action="/api/login" method="POST" className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <input type="hidden" name="next" value={next} />
            <div className="grid gap-4">
              <label className="text-sm font-medium text-slate-600">
                账号
                <input
                  name="username"
                  className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-slate-700 outline-none placeholder:text-slate-400"
                  placeholder="JYCSTEEL"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                密码
                <input
                  name="password"
                  type="password"
                  className="mt-2 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-slate-700 outline-none placeholder:text-slate-400"
                  placeholder="••••••••"
                />
              </label>
              <button className="rounded-2xl bg-gray-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-200">
                登录进入后台
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link href="/" className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-slate-600 hover:bg-gray-50">
              返回前台
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
