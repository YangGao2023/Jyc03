import Link from "next/link";

const highlights = [
  "JYC 产品展示前台",
  "AI 接待与未来空间感",
  "老板后台独立入口",
  "手机优先访问",
];

const agents = [
  {
    name: "阿三",
    role: "协调 / 翻译 / 主控制位",
    desc: "负责把老板意图翻成可执行动作，维持整体节奏。",
  },
  {
    name: "阿本",
    role: "执行 / 业务落地",
    desc: "负责把交付、流程、业务动作真正落下来。",
  },
  {
    name: "小四",
    role: "CAD / research / drawing",
    desc: "负责图纸、专项研究和更偏技术的细工作。",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-600">JYC NYC · Frontstage</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight text-slate-800 lg:text-6xl">
                给客户看的前台，和给老板看的后台，从今天开始正式分路。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 lg:text-base">
                这里是前台主页原型。以后放真实产品照片、公司介绍、轻互动 AI 接待。控制权限不在这里暴露，老板通过独立登录入口进入后台。
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-600">
                {highlights.map((item) => (
                  <span key={item} className="rounded-full border border-gray-200 bg-white px-3 py-2">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className="rounded-2xl bg-gray-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-200">
                  老板登录入口
                </Link>
                <Link href="/dashboard" className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-gray-50">
                  查看当前后台原型
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              {agents.map((agent) => (
                <div key={agent.name} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-lg font-semibold text-slate-700">{agent.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{agent.role}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{agent.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[28px] bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-medium text-slate-600">前台定位</p>
            <h2 className="mt-1 text-xl font-semibold">客户先看到空间和产品</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              先展示 JYC 的产品、案例和品牌感，AI 在前台做轻接待，而不是一上来暴露指令面板。
            </p>
          </div>
          <div className="rounded-[28px] bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-medium text-slate-600">登录定位</p>
            <h2 className="mt-1 text-xl font-semibold">老板走单独入口</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              老板通过独立登录页进入后台，后面再接账号密码、权限和真实受保护路由。
            </p>
          </div>
          <div className="rounded-[28px] bg-white p-5 text-slate-700 shadow-sm">
            <p className="text-sm font-medium text-slate-600">后台定位</p>
            <h2 className="mt-1 text-xl font-semibold">任务、记忆、状态、指令</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              后台继续承接真实状态、ToDo、错峰会议、待接手任务和老板指令入口，慢慢长成真正可用的控制台。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
