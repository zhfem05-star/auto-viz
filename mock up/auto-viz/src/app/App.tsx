import { useState, useRef, useEffect } from "react";
import {
  Plus, Search, MoreHorizontal, Trash2, Edit3,
  ChevronDown, ChevronRight, Send, Sparkles, X,
  Database, LayoutDashboard, FileText, MessageSquare,
  CheckCircle2, AlertCircle, Eye, Loader2,
  BarChart2, PieChart, Table, Plug, FolderOpen, Folder,
  Settings2, BarChart, LineChart as LineChartIcon, Activity,
  Key, Lock, Unlock, EyeOff, Bot, ChevronDown as ChevronDownSm,
} from "lucide-react";
import {
  LineChart, Line, BarChart as RechartsBar, Bar,
  PieChart as RechartsPie, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type DBType = "postgresql" | "mysql" | "mongodb" | "sqlite" | "mssql";
type LLMProvider = "anthropic" | "openai" | "google" | "ollama";
type ConnStatus = "connected" | "disconnected" | "testing" | "error";

type DBConnection = {
  type: DBType;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  status: ConnStatus;
};

type LLMConfig = {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl: string;   // for Ollama
  status: ConnStatus;
};

type ChartType = "line" | "bar" | "pie" | "area";
type DataSource = "sample" | string;

type DashboardChart = {
  id: string;
  title: string;
  chartType: ChartType;
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
  color: string;
  sourceReportId?: string;
  createdAt: Date;
};

type Report = {
  id: string;
  title: string;
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  createdAt: Date;
  rowCount: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachedReport?: Report;
  attachedChart?: DashboardChart;
};

type Thread = {
  id: string;
  title: string;
  timestamp: Date;
  messages: Message[];
};

type ProjectSection = "chat" | "reports" | "dashboard" | "connection";

type Project = {
  id: string;
  name: string;
  color: string;
  isExpanded: boolean;
  activeSection: ProjectSection;
  connection: DBConnection;
  llm: LLMConfig;
  threads: Thread[];
  reports: Report[];
  dashboard: DashboardChart[];
};

// ─── LLM Provider metadata ────────────────────────────────────────────────────

const LLM_PROVIDERS: {
  id: LLMProvider;
  name: string;
  models: string[];
  keyPlaceholder: string;
  keyPrefix: string;
  needsBaseUrl: boolean;
}[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    keyPlaceholder: "sk-ant-api03-...",
    keyPrefix: "sk-ant-",
    needsBaseUrl: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    keyPlaceholder: "sk-proj-...",
    keyPrefix: "sk-",
    needsBaseUrl: false,
  },
  {
    id: "google",
    name: "Google Gemini",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    keyPlaceholder: "AIza...",
    keyPrefix: "AIza",
    needsBaseUrl: false,
  },
  {
    id: "ollama",
    name: "Ollama (로컬)",
    models: ["llama3.2", "llama3.1", "mistral", "gemma3", "qwen2.5"],
    keyPlaceholder: "API 키 불필요",
    keyPrefix: "",
    needsBaseUrl: true,
  },
];

// ─── Sample Data ──────────────────────────────────────────────────────────────

const salesData = [
  { month: "1월", revenue: 4200000, orders: 312 },
  { month: "2월", revenue: 3800000, orders: 278 },
  { month: "3월", revenue: 5100000, orders: 401 },
  { month: "4월", revenue: 4700000, orders: 355 },
  { month: "5월", revenue: 6200000, orders: 489 },
  { month: "6월", revenue: 5900000, orders: 462 },
];
const categoryData = [
  { name: "전자제품", value: 38 },
  { name: "의류", value: 24 },
  { name: "식품", value: 19 },
  { name: "가구", value: 12 },
  { name: "기타", value: 7 },
];
const userGrowthData = [
  { week: "W1", users: 1200 },
  { week: "W2", users: 1450 },
  { week: "W3", users: 1380 },
  { week: "W4", users: 1820 },
  { week: "W5", users: 2100 },
  { week: "W6", users: 2340 },
];

const CHART_COLORS = ["#c9703a", "#5b8ac9", "#5a9e6f", "#9b6bc9", "#c96b6b", "#c9b26b"];

const REPORT_R1: Report = {
  id: "r1",
  title: "월별 매출 현황 (최근 6개월)",
  query: "SELECT DATE_TRUNC('month', created_at) as month, SUM(total) as revenue, COUNT(*) as orders FROM orders WHERE created_at >= NOW() - INTERVAL '6 months' GROUP BY 1 ORDER BY 1",
  columns: ["month", "revenue", "orders"],
  rows: salesData,
  createdAt: new Date(Date.now() - 1000 * 60 * 60),
  rowCount: 6,
};
const REPORT_R2: Report = {
  id: "r2",
  title: "카테고리별 판매 비중",
  query: "SELECT category as name, ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as value FROM order_items GROUP BY category",
  columns: ["name", "value"],
  rows: categoryData,
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
  rowCount: 5,
};

const DEFAULT_LLM: LLMConfig = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-4-6",
  baseUrl: "http://localhost:11434",
  status: "disconnected",
};

const INITIAL_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "이커머스 분석",
    color: "#c9703a",
    isExpanded: true,
    activeSection: "chat",
    connection: {
      type: "postgresql",
      host: "db.ecommerce.internal",
      port: "5432",
      database: "ecommerce_prod",
      username: "analyst",
      password: "••••••••",
      status: "connected",
    },
    llm: {
      provider: "anthropic",
      apiKey: "sk-ant-api03-••••••••••••••••••••••••••",
      model: "claude-sonnet-4-6",
      baseUrl: "",
      status: "connected",
    },
    threads: [
      {
        id: "t1",
        title: "월별 매출 리포트 요청",
        timestamp: new Date(Date.now() - 1000 * 60 * 20),
        messages: [
          { id: "m1", role: "user", content: "최근 6개월간 월별 매출과 주문 수를 리포트로 만들어줘", timestamp: new Date(Date.now() - 1000 * 60 * 20) },
          { id: "m2", role: "assistant", content: "orders 테이블에서 최근 6개월 데이터를 집계했습니다. 리포트를 생성했어요.", timestamp: new Date(Date.now() - 1000 * 60 * 19), attachedReport: REPORT_R1 },
        ],
      },
    ],
    reports: [REPORT_R1, REPORT_R2],
    dashboard: [
      { id: "c1", title: "월별 매출 추이", chartType: "area", data: salesData, dataKey: "revenue", nameKey: "month", color: "#c9703a", sourceReportId: "r1", createdAt: new Date(Date.now() - 1000 * 60 * 60) },
      { id: "c2", title: "카테고리별 판매 비중", chartType: "pie", data: categoryData, dataKey: "value", nameKey: "name", color: "#5b8ac9", sourceReportId: "r2", createdAt: new Date(Date.now() - 1000 * 60 * 30) },
      { id: "c3", title: "월별 주문 수", chartType: "bar", data: salesData, dataKey: "orders", nameKey: "month", color: "#5a9e6f", sourceReportId: "r1", createdAt: new Date(Date.now() - 1000 * 60 * 15) },
    ],
  },
  {
    id: "p2",
    name: "사용자 성장 추적",
    color: "#5b8ac9",
    isExpanded: false,
    activeSection: "dashboard",
    connection: {
      type: "mysql",
      host: "mysql.analytics.svc",
      port: "3306",
      database: "user_analytics",
      username: "readonly",
      password: "••••••••",
      status: "disconnected",
    },
    llm: { ...DEFAULT_LLM },
    threads: [],
    reports: [],
    dashboard: [
      { id: "c4", title: "주간 신규 유저 증가", chartType: "line", data: userGrowthData, dataKey: "users", nameKey: "week", color: "#5b8ac9", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5) },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() { return Math.random().toString(36).slice(2, 10); }

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isNumericColumn(rows: Record<string, unknown>[], col: string) {
  return rows.every((r) => r[col] !== undefined && !isNaN(Number(r[col])));
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return key;
  const visible = key.slice(0, 10);
  return visible + "•".repeat(Math.min(key.length - 10, 20));
}

function inferKeyStatus(key: string, provider: LLMProvider): ConnStatus {
  if (!key || key.trim() === "") return "disconnected";
  if (provider === "ollama") return "connected";
  const meta = LLM_PROVIDERS.find((p) => p.id === provider);
  if (meta?.keyPrefix && key.startsWith(meta.keyPrefix)) return "connected";
  return "error";
}

// ─── Chart Renderer ───────────────────────────────────────────────────────────

function ChartRenderer({ chart, height = 180 }: { chart: DashboardChart; height?: number }) {
  if (chart.chartType === "line") return (
    <LineChart data={chart.data}>
      <XAxis dataKey={chart.nameKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
      <Line type="monotone" dataKey={chart.dataKey} stroke={chart.color} strokeWidth={2} dot={false} />
    </LineChart>
  );
  if (chart.chartType === "bar") return (
    <RechartsBar data={chart.data}>
      <XAxis dataKey={chart.nameKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
      <Bar dataKey={chart.dataKey} fill={chart.color} radius={[4, 4, 0, 0]} />
    </RechartsBar>
  );
  if (chart.chartType === "pie") return (
    <RechartsPie>
      <Pie data={chart.data} dataKey={chart.dataKey} nameKey={chart.nameKey} cx="50%" cy="50%" outerRadius={height * 0.38} label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
        {chart.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
      </Pie>
      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
    </RechartsPie>
  );
  return (
    <AreaChart data={chart.data}>
      <defs>
        <linearGradient id={`grad-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={chart.color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <XAxis dataKey={chart.nameKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
      <Area type="monotone" dataKey={chart.dataKey} stroke={chart.color} strokeWidth={2} fill={`url(#grad-${chart.id})`} />
    </AreaChart>
  );
}

// ─── Chart Modal ──────────────────────────────────────────────────────────────

type ChartDraft = { title: string; chartType: ChartType; sourceReportId: DataSource; nameKey: string; dataKey: string; color: string };

function ChartModal({ initial, reports, onSave, onClose }: {
  initial?: Partial<DashboardChart>;
  reports: Report[];
  onSave: (draft: ChartDraft) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial?.id;
  const [draft, setDraft] = useState<ChartDraft>({
    title: initial?.title ?? "",
    chartType: initial?.chartType ?? "bar",
    sourceReportId: initial?.sourceReportId ?? (reports[0]?.id ?? "sample"),
    nameKey: initial?.nameKey ?? "",
    dataKey: initial?.dataKey ?? "",
    color: initial?.color ?? CHART_COLORS[0],
  });

  const sourceReport = reports.find((r) => r.id === draft.sourceReportId);
  const columns = sourceReport?.columns ?? [];
  const numericCols = sourceReport ? columns.filter((c) => isNumericColumn(sourceReport.rows, c)) : [];

  useEffect(() => {
    if (!sourceReport) return;
    const nc = sourceReport.columns.filter((c) => !isNumericColumn(sourceReport.rows, c));
    const yc = sourceReport.columns.filter((c) => isNumericColumn(sourceReport.rows, c));
    setDraft((d) => ({ ...d, nameKey: nc[0] ?? sourceReport.columns[0] ?? "", dataKey: yc[0] ?? sourceReport.columns[1] ?? "" }));
  }, [draft.sourceReportId]);

  const previewChart: DashboardChart = { id: "preview", title: draft.title || "미리보기", chartType: draft.chartType, data: sourceReport?.rows ?? [], dataKey: draft.dataKey, nameKey: draft.nameKey, color: draft.color, createdAt: new Date() };
  const canSave = draft.title.trim() && draft.nameKey && draft.dataKey && sourceReport;
  const CHART_TYPES: { type: ChartType; label: string; icon: React.ReactNode }[] = [
    { type: "bar", label: "막대", icon: <BarChart size={15} /> },
    { type: "line", label: "선형", icon: <LineChartIcon size={15} /> },
    { type: "area", label: "영역", icon: <Activity size={15} /> },
    { type: "pie", label: "원형", icon: <PieChart size={15} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col" style={{ background: "var(--card)", borderColor: "var(--border)", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{isEdit ? "차트 수정" : "새 차트 만들기"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: "var(--muted-foreground)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--secondary)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={15} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 shrink-0 overflow-y-auto px-5 py-5 space-y-5 border-r" style={{ borderColor: "var(--border)", scrollbarWidth: "none" }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>차트 제목</label>
              <input type="text" placeholder="ex) 월별 매출 추이" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none border" style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>데이터 소스 (리포트)</label>
              {reports.length === 0 ? <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>리포트가 없습니다.</p> : (
                <div className="space-y-1">
                  {reports.map((r) => (
                    <button key={r.id} className="w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors"
                      style={{ background: draft.sourceReportId === r.id ? "rgba(201,112,58,0.12)" : "var(--secondary)", borderColor: draft.sourceReportId === r.id ? "var(--accent)" : "transparent", color: draft.sourceReportId === r.id ? "var(--foreground)" : "var(--muted-foreground)" }}
                      onClick={() => setDraft((d) => ({ ...d, sourceReportId: r.id }))}>
                      <div className="flex items-center gap-1.5"><FileText size={11} style={{ color: draft.sourceReportId === r.id ? "var(--accent)" : "var(--muted-foreground)", flexShrink: 0 }} /><span className="truncate">{r.title}</span></div>
                      <p className="mt-0.5 ml-4" style={{ color: "var(--muted-foreground)", fontSize: 10 }}>{r.rowCount}행 · {r.columns.join(", ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>차트 유형</label>
              <div className="grid grid-cols-2 gap-1.5">
                {CHART_TYPES.map(({ type, label, icon }) => (
                  <button key={type} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors"
                    style={{ background: draft.chartType === type ? "rgba(201,112,58,0.12)" : "var(--secondary)", borderColor: draft.chartType === type ? "var(--accent)" : "transparent", color: draft.chartType === type ? "var(--foreground)" : "var(--muted-foreground)" }}
                    onClick={() => setDraft((d) => ({ ...d, chartType: type }))}>
                    <span style={{ color: draft.chartType === type ? "var(--accent)" : "var(--muted-foreground)" }}>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>
            {sourceReport && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>X축 (레이블)</label>
                  <select value={draft.nameKey} onChange={(e) => setDraft((d) => ({ ...d, nameKey: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none border" style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }}>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Y축 (값)</label>
                  <select value={draft.dataKey} onChange={(e) => setDraft((d) => ({ ...d, dataKey: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-sm outline-none border" style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }}>
                    {(numericCols.length > 0 ? numericCols : columns).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>색상</label>
              <div className="flex gap-2 flex-wrap">
                {CHART_COLORS.map((c) => (
                  <button key={c} onClick={() => setDraft((d) => ({ ...d, color: c }))} className="w-6 h-6 rounded-full transition-transform"
                    style={{ background: c, outline: draft.color === c ? `2px solid ${c}` : "none", outlineOffset: 2, transform: draft.color === c ? "scale(1.2)" : "scale(1)" }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}><p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>미리보기</p></div>
            <div className="flex-1 flex items-center justify-center p-6">
              {!sourceReport || !draft.dataKey || !draft.nameKey ? (
                <div className="text-center"><BarChart2 size={32} style={{ color: "var(--muted-foreground)", opacity: 0.3, margin: "0 auto 8px" }} /><p className="text-xs" style={{ color: "var(--muted-foreground)" }}>데이터 소스와 축을 선택하면<br />미리보기가 표시됩니다</p></div>
              ) : (
                <div className="w-full" style={{ height: 260 }}>
                  <p className="text-sm font-medium mb-3" style={{ color: "var(--foreground)" }}>{draft.title || "제목 없음"}</p>
                  <ResponsiveContainer width="100%" height="100%"><ChartRenderer chart={previewChart} height={260} /></ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--muted-foreground)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--secondary)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>취소</button>
          <button disabled={!canSave} onClick={() => { if (canSave) { onSave(draft); onClose(); } }} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "#fff", opacity: canSave ? 1 : 0.4 }}>
            {isEdit ? "저장" : "대시보드에 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

function ChartCard({ chart, sourceReport, onEdit, onRemove }: { chart: DashboardChart; sourceReport?: Report; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border flex flex-col overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: chart.color }} />
          <span className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{chart.title}</span>
          {sourceReport && (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>
              <FileText size={10} />{sourceReport.title.slice(0, 12)}…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--secondary)"; (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }} title="수정"><Settings2 size={13} /></button>
          <button onClick={onRemove} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(192,57,43,0.1)"; (e.currentTarget as HTMLElement).style.color = "var(--destructive)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }} title="삭제"><Trash2 size={13} /></button>
        </div>
      </div>
      <div className="px-3 py-4" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%"><ChartRenderer chart={chart} height={200} /></ResponsiveContainer>
      </div>
      <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{formatDate(chart.createdAt)}</span>
        <span className="text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>{chart.chartType === "bar" ? "막대" : chart.chartType === "line" ? "선형" : chart.chartType === "area" ? "영역" : "원형"}</span>
      </div>
    </div>
  );
}

// ─── ReportTable ──────────────────────────────────────────────────────────────

function ReportTable({ report, onAddToDashboard }: { report: Report; onAddToDashboard: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{report.title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{report.rowCount}행</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAddToDashboard} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: "rgba(201,112,58,0.15)", color: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(201,112,58,0.25)")} onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(201,112,58,0.15)")}>
            <LayoutDashboard size={12} /> 대시보드에 추가
          </button>
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: open ? "var(--secondary)" : "transparent", color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--secondary)")} onMouseLeave={(e) => (e.currentTarget.style.background = open ? "var(--secondary)" : "transparent")}>
            <Eye size={12} /> {open ? "접기" : "보기"}
          </button>
        </div>
      </div>
      {open && (
        <>
          <div className="px-4 pb-2">
            <code className="block text-xs px-3 py-2 rounded-lg" style={{ background: "var(--secondary)", color: "var(--muted-foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{report.query}</code>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                  {report.columns.map((col) => <th key={col} className="px-4 py-2 text-left font-medium" style={{ color: "var(--muted-foreground)", background: "var(--secondary)" }}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--secondary)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {report.columns.map((col) => <td key={col} className="px-4 py-2" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{String(row[col] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs" style={{ color: "var(--muted-foreground)", borderTop: "1px solid var(--border)" }}>{formatDate(report.createdAt)} 생성</div>
        </>
      )}
    </div>
  );
}

function InlineMiniReport({ report }: { report: Report }) {
  return (
    <div className="mt-2 rounded-xl border overflow-hidden" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <FileText size={12} style={{ color: "var(--accent)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--foreground)" }}>{report.title}</span>
        <span className="ml-auto text-xs" style={{ color: "var(--muted-foreground)" }}>{report.rowCount}행</span>
      </div>
      <table className="w-full text-xs">
        <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>{report.columns.map((col) => <th key={col} className="px-3 py-1.5 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>{col}</th>)}</tr></thead>
        <tbody>
          {report.rows.slice(0, 4).map((row, i) => (
            <tr key={i} style={{ borderBottom: i < Math.min(3, report.rows.length - 1) ? "1px solid var(--border)" : undefined }}>
              {report.columns.map((col) => <td key={col} className="px-3 py-1.5" style={{ color: "var(--foreground)", fontFamily: "'JetBrains Mono', monospace" }}>{String(row[col] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── LLM Status Badge ─────────────────────────────────────────────────────────

function LLMStatusDot({ status }: { status: ConnStatus }) {
  const color = status === "connected" ? "#5a9e6f" : status === "error" ? "#c96b6b" : "var(--muted-foreground)";
  return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />;
}

// ─── Connection Section ───────────────────────────────────────────────────────

function ConnectionSection({ project, onUpdateDB, onUpdateLLM, onTestDB, onTestLLM, dbTestState, llmTestState }: {
  project: Project;
  onUpdateDB: (field: keyof DBConnection, value: string) => void;
  onUpdateLLM: (field: keyof LLMConfig, value: string) => void;
  onTestDB: () => void;
  onTestLLM: () => void;
  dbTestState: "idle" | "testing" | "ok" | "fail";
  llmTestState: "idle" | "testing" | "ok" | "fail";
}) {
  const [showKey, setShowKey] = useState(false);
  const providerMeta = LLM_PROVIDERS.find((p) => p.id === project.llm.provider)!;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8" style={{ scrollbarWidth: "none" }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── LLM API 설정 ── */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,112,58,0.15)" }}>
              <Bot size={16} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>LLM API 연결 (BYOK)</h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>AI 기능을 사용하려면 API 키가 필요합니다</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs">
              <LLMStatusDot status={project.llm.status} />
              <span style={{ color: project.llm.status === "connected" ? "#5a9e6f" : project.llm.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }}>
                {project.llm.status === "connected" ? "연결됨" : project.llm.status === "error" ? "키 오류" : "미연결"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {/* Provider selector */}
            <div className="p-5 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>LLM 제공자</label>
              <div className="grid grid-cols-4 gap-2">
                {LLM_PROVIDERS.map((p) => (
                  <button key={p.id}
                    className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-colors"
                    style={{
                      background: project.llm.provider === p.id ? "rgba(201,112,58,0.12)" : "var(--secondary)",
                      borderColor: project.llm.provider === p.id ? "var(--accent)" : "transparent",
                      color: project.llm.provider === p.id ? "var(--foreground)" : "var(--muted-foreground)",
                    }}
                    onClick={() => {
                      onUpdateLLM("provider", p.id);
                      onUpdateLLM("model", p.models[0]);
                      onUpdateLLM("apiKey", "");
                      onUpdateLLM("status", "disconnected");
                    }}>
                    <span className="text-base">{p.id === "anthropic" ? "🔷" : p.id === "openai" ? "🟢" : p.id === "google" ? "🔴" : "🦙"}</span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Key + model */}
            <div className="p-5 space-y-4" style={{ background: "var(--card)" }}>
              {/* API Key */}
              {providerMeta.id !== "ollama" ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>API 키</label>
                    <a href={providerMeta.id === "anthropic" ? "https://console.anthropic.com/keys" : providerMeta.id === "openai" ? "https://platform.openai.com/api-keys" : "https://aistudio.google.com/apikey"}
                      target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "var(--accent)" }}>
                      키 발급 →
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder={providerMeta.keyPlaceholder}
                      value={project.llm.apiKey}
                      onChange={(e) => {
                        onUpdateLLM("apiKey", e.target.value);
                        onUpdateLLM("status", inferKeyStatus(e.target.value, project.llm.provider));
                      }}
                      className="w-full px-3 py-2 pr-9 rounded-lg text-sm outline-none border"
                      style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: project.llm.status === "error" ? "var(--destructive)" : project.llm.status === "connected" ? "#5a9e6f" : "var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setShowKey((v) => !v)} style={{ color: "var(--muted-foreground)" }}>
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {project.llm.apiKey && (
                    <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: project.llm.status === "connected" ? "#5a9e6f" : project.llm.status === "error" ? "var(--destructive)" : "var(--muted-foreground)" }}>
                      {project.llm.status === "connected" ? <><CheckCircle2 size={11} /> 유효한 키 형식</> : project.llm.status === "error" ? <><AlertCircle size={11} /> 키 형식이 올바르지 않습니다</> : null}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Ollama 서버 URL</label>
                  <input type="text" placeholder="http://localhost:11434" value={project.llm.baseUrl}
                    onChange={(e) => { onUpdateLLM("baseUrl", e.target.value); onUpdateLLM("status", e.target.value ? "connected" : "disconnected"); }}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
                  <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>로컬 Ollama 인스턴스가 실행 중이어야 합니다</p>
                </div>
              )}

              {/* Model */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>모델</label>
                {providerMeta.id === "ollama" ? (
                  <input type="text" placeholder="llama3.2" value={project.llm.model}
                    onChange={(e) => onUpdateLLM("model", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
                ) : (
                  <select value={project.llm.model} onChange={(e) => onUpdateLLM("model", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                    style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }}>
                    {providerMeta.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>

              {/* Test button */}
              <div className="flex items-center gap-3 pt-1">
                <button onClick={onTestLLM} disabled={llmTestState === "testing" || (!project.llm.apiKey && providerMeta.id !== "ollama")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent)", color: "#fff", opacity: llmTestState === "testing" || (!project.llm.apiKey && providerMeta.id !== "ollama") ? 0.5 : 1 }}>
                  {llmTestState === "testing" ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                  {llmTestState === "testing" ? "검증 중..." : "연결 검증"}
                </button>
                {llmTestState === "ok" && <div className="flex items-center gap-1.5 text-sm" style={{ color: "#5a9e6f" }}><CheckCircle2 size={15} /> 연결 성공</div>}
                {llmTestState === "fail" && <div className="flex items-center gap-1.5 text-sm" style={{ color: "#c96b6b" }}><AlertCircle size={15} /> 연결 실패 — 키를 확인하세요</div>}
              </div>
            </div>
          </div>
        </div>

        {/* ── DB 연결 ── */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(91,138,201,0.15)" }}>
              <Database size={16} style={{ color: "#5b8ac9" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>데이터베이스 연결</h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>조회할 DB의 연결 정보를 입력하세요</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.connection.status === "connected" ? "#5a9e6f" : project.connection.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }} />
              <span style={{ color: project.connection.status === "connected" ? "#5a9e6f" : project.connection.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }}>
                {project.connection.status === "connected" ? "연결됨" : project.connection.status === "error" ? "연결 실패" : "미연결"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>데이터베이스 유형</label>
              <select value={project.connection.type} onChange={(e) => onUpdateDB("type", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }}>
                {(["postgresql", "mysql", "mongodb", "sqlite", "mssql"] as DBType[]).map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>호스트</label>
                <input type="text" placeholder="localhost" value={project.connection.host} onChange={(e) => onUpdateDB("host", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>포트</label>
                <input type="text" placeholder="5432" value={project.connection.port} onChange={(e) => onUpdateDB("port", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>데이터베이스 이름</label>
              <input type="text" placeholder="my_database" value={project.connection.database} onChange={(e) => onUpdateDB("database", e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>사용자명</label>
                <input type="text" placeholder="username" value={project.connection.username} onChange={(e) => onUpdateDB("username", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>비밀번호</label>
                <input type="password" placeholder="password" value={project.connection.password} onChange={(e) => onUpdateDB("password", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
                  style={{ background: "var(--secondary)", color: "var(--foreground)", borderColor: "var(--border)", fontFamily: "inherit" }} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={onTestDB} disabled={dbTestState === "testing"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "#5b8ac9", color: "#fff", opacity: dbTestState === "testing" ? 0.7 : 1 }}>
                {dbTestState === "testing" ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
                {dbTestState === "testing" ? "테스트 중..." : "연결 테스트"}
              </button>
              {dbTestState === "ok" && <div className="flex items-center gap-1.5 text-sm" style={{ color: "#5a9e6f" }}><CheckCircle2 size={15} /> 연결 성공</div>}
              {dbTestState === "fail" && <div className="flex items-center gap-1.5 text-sm" style={{ color: "#c96b6b" }}><AlertCircle size={15} /> 연결 실패</div>}
            </div>
            {project.connection.status === "connected" && (
              <div className="p-3 rounded-lg flex items-center gap-2 text-sm" style={{ background: "rgba(90,158,111,0.12)", color: "#5a9e6f" }}>
                <CheckCircle2 size={14} /><span>{project.connection.database}에 연결되어 있습니다</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState<string>("p1");
  const [activeThreadId, setActiveThreadId] = useState<string>("t1");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "project" | "thread"; id: string; projectId?: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [dbTestState, setDbTestState] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [llmTestState, setLlmTestState] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [chartModal, setChartModal] = useState<null | { mode: "create"; prefillReportId?: string } | { mode: "edit"; chart: DashboardChart }>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeThread = activeProject?.threads.find((t) => t.id === activeThreadId);
  const activeSection = activeProject?.activeSection ?? "chat";
  const hasLLM = activeProject?.llm.status === "connected";

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeThread?.messages, isTyping]);
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function setSection(projectId: string, section: ProjectSection) {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, activeSection: section } : p));
    setActiveProjectId(projectId);
  }
  function toggleProject(projectId: string) {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, isExpanded: !p.isExpanded } : p));
  }
  function addProject() {
    const colors = ["#c9703a", "#5a9e6f", "#5b8ac9", "#9b6bc9", "#c96b6b"];
    const newProject: Project = {
      id: generateId(), name: "새 프로젝트", color: colors[Math.floor(Math.random() * colors.length)],
      isExpanded: true, activeSection: "connection",
      connection: { type: "postgresql", host: "", port: "5432", database: "", username: "", password: "", status: "disconnected" },
      llm: { ...DEFAULT_LLM },
      threads: [], reports: [], dashboard: [],
    };
    setProjects((prev) => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    setEditingId(newProject.id);
    setEditingValue("새 프로젝트");
  }
  function addThread(projectId: string) {
    const newThread: Thread = { id: generateId(), title: "새 대화", timestamp: new Date(), messages: [] };
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, isExpanded: true, activeSection: "chat", threads: [newThread, ...p.threads] } : p));
    setActiveProjectId(projectId); setActiveThreadId(newThread.id);
    setEditingId(newThread.id); setEditingValue("새 대화");
  }
  function deleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(projects.find((p) => p.id !== id)?.id ?? "");
  }
  function deleteThread(projectId: string, threadId: string) {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, threads: p.threads.filter((t) => t.id !== threadId) } : p));
    if (activeThreadId === threadId) setActiveThreadId("");
  }
  function commitEdit() {
    if (!editingValue.trim()) return setEditingId(null);
    setProjects((prev) => prev.map((p) => {
      if (p.id === editingId) return { ...p, name: editingValue.trim() };
      return { ...p, threads: p.threads.map((t) => t.id === editingId ? { ...t, title: editingValue.trim() } : t) };
    }));
    setEditingId(null);
  }
  function updateDB(projectId: string, field: keyof DBConnection, value: string) {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, connection: { ...p.connection, [field]: value } } : p));
  }
  function updateLLM(projectId: string, field: keyof LLMConfig, value: string) {
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, llm: { ...p.llm, [field]: value } } : p));
  }

  async function testDB(projectId: string) {
    setDbTestState((s) => ({ ...s, [projectId]: "testing" }));
    await new Promise((r) => setTimeout(r, 1800));
    const ok = Math.random() > 0.3;
    setDbTestState((s) => ({ ...s, [projectId]: ok ? "ok" : "fail" }));
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, connection: { ...p.connection, status: ok ? "connected" : "error" } } : p));
    setTimeout(() => setDbTestState((s) => ({ ...s, [projectId]: "idle" })), 3000);
  }

  async function testLLM(projectId: string) {
    setLlmTestState((s) => ({ ...s, [projectId]: "testing" }));
    await new Promise((r) => setTimeout(r, 1600));
    const project = projects.find((p) => p.id === projectId);
    const meta = LLM_PROVIDERS.find((p) => p.id === project?.llm.provider);
    const ok = project?.llm.provider === "ollama" || (!!project?.llm.apiKey && project.llm.apiKey.startsWith(meta?.keyPrefix ?? ""));
    setLlmTestState((s) => ({ ...s, [projectId]: ok ? "ok" : "fail" }));
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, llm: { ...p.llm, status: ok ? "connected" : "error" } } : p));
    setTimeout(() => setLlmTestState((s) => ({ ...s, [projectId]: "idle" })), 3000);
  }

  function saveChart(draft: ChartDraft) {
    if (!activeProject) return;
    const report = activeProject.reports.find((r) => r.id === draft.sourceReportId);
    if (!report) return;
    if (chartModal?.mode === "edit") {
      const editId = (chartModal as { mode: "edit"; chart: DashboardChart }).chart.id;
      setProjects((prev) => prev.map((p) => p.id === activeProjectId ? {
        ...p, dashboard: p.dashboard.map((c) => c.id === editId ? { ...c, title: draft.title, chartType: draft.chartType, data: report.rows, dataKey: draft.dataKey, nameKey: draft.nameKey, color: draft.color, sourceReportId: draft.sourceReportId } : c),
      } : p));
    } else {
      const newChart: DashboardChart = { id: generateId(), title: draft.title, chartType: draft.chartType, data: report.rows, dataKey: draft.dataKey, nameKey: draft.nameKey, color: draft.color, sourceReportId: draft.sourceReportId, createdAt: new Date() };
      setProjects((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, dashboard: [...p.dashboard, newChart] } : p));
      setSection(activeProjectId, "dashboard");
    }
  }

  async function sendMessage() {
    if (!inputValue.trim() || !activeThreadId || !activeProjectId || !hasLLM) return;
    const content = inputValue.trim();
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const userMsg: Message = { id: generateId(), role: "user", content, timestamp: new Date() };
    setProjects((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, threads: p.threads.map((t) => t.id === activeThreadId ? { ...t, messages: [...t.messages, userMsg], timestamp: new Date() } : t) } : p));
    setIsTyping(true);
    await new Promise((r) => setTimeout(r, 1400 + Math.random() * 600));

    const isReport = /리포트|보고서|조회|쿼리|select|테이블/i.test(content);
    const isChart = /차트|대시보드|그래프|시각화|추가/i.test(content);
    let assistantMsg: Message;

    if (isReport) {
      const newReport: Report = {
        id: generateId(), title: content.slice(0, 28) + " 결과",
        query: `SELECT * FROM your_table WHERE condition LIMIT 100;`,
        columns: ["id", "항목", "값"],
        rows: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, 항목: `항목 ${i + 1}`, 값: Math.floor(Math.random() * 100000) })),
        createdAt: new Date(), rowCount: 5,
      };
      setProjects((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, reports: [newReport, ...p.reports] } : p));
      assistantMsg = { id: generateId(), role: "assistant", content: "DB를 조회해서 리포트를 생성했습니다. 리포트 탭에서 확인하거나 대시보드에 바로 추가할 수 있어요.", timestamp: new Date(), attachedReport: newReport };
    } else if (isChart) {
      const srcReport = projects.find((p) => p.id === activeProjectId)?.reports[0];
      if (srcReport) {
        const newChart: DashboardChart = {
          id: generateId(), title: content.slice(0, 22) + " 차트",
          chartType: (["line", "bar", "area"] as ChartType[])[Math.floor(Math.random() * 3)],
          data: srcReport.rows,
          dataKey: srcReport.columns.find((c) => isNumericColumn(srcReport.rows, c)) ?? srcReport.columns[1] ?? srcReport.columns[0],
          nameKey: srcReport.columns.find((c) => !isNumericColumn(srcReport.rows, c)) ?? srcReport.columns[0],
          color: CHART_COLORS[Math.floor(Math.random() * CHART_COLORS.length)],
          sourceReportId: srcReport.id, createdAt: new Date(),
        };
        setProjects((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, dashboard: [...p.dashboard, newChart] } : p));
        assistantMsg = { id: generateId(), role: "assistant", content: `"${srcReport.title}" 데이터로 차트를 생성해 대시보드에 추가했습니다.`, timestamp: new Date(), attachedChart: newChart };
      } else {
        assistantMsg = { id: generateId(), role: "assistant", content: "차트를 만들려면 먼저 리포트가 필요합니다. 데이터를 조회해서 리포트를 먼저 만들어주세요.", timestamp: new Date() };
      }
    } else {
      const replies = ["네, 해당 내용을 처리해드릴게요. DB 연결을 확인하고 진행하겠습니다.", "좋은 요청이에요! 데이터를 분석해서 알려드릴게요.", "확인했습니다. 조금 더 구체적인 조건이 있으시면 말씀해 주세요."];
      assistantMsg = { id: generateId(), role: "assistant", content: replies[Math.floor(Math.random() * replies.length)], timestamp: new Date() };
    }

    setIsTyping(false);
    setProjects((prev) => prev.map((p) => p.id === activeProjectId ? { ...p, threads: p.threads.map((t) => t.id === activeThreadId ? { ...t, messages: [...t.messages, assistantMsg] } : t) } : p));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    const ta = e.target; ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }

  const SECTION_ICONS: Record<ProjectSection, React.ReactNode> = {
    chat: <MessageSquare size={13} />, reports: <FileText size={13} />, dashboard: <LayoutDashboard size={13} />, connection: <Plug size={13} />,
  };
  const SECTION_LABELS: Record<ProjectSection, string> = { chat: "AI 대화", reports: "리포트", dashboard: "대시보드", connection: "연결 설정" };
  const SECTIONS: ProjectSection[] = ["chat", "reports", "dashboard", "connection"];

  const filteredProjects = searchQuery
    ? projects.map((p) => ({ ...p, threads: p.threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase())) })).filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.threads.length > 0)
    : projects;

  const activeProviderMeta = activeProject ? LLM_PROVIDERS.find((p) => p.id === activeProject.llm.provider) : null;

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", background: "var(--background)" }} onClick={() => setContextMenu(null)}>

      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-60 shrink-0 border-r overflow-hidden" style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--sidebar-primary)" }}>DataChat</span>
          </div>
          <button onClick={addProject} className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            <Plus size={14} />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ background: "var(--sidebar-accent)" }}>
            <Search size={12} style={{ color: "var(--muted-foreground)" }} />
            <input type="text" placeholder="검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-xs" style={{ color: "var(--sidebar-foreground)", fontFamily: "inherit" }} />
            {searchQuery && <button onClick={() => setSearchQuery("")}><X size={11} style={{ color: "var(--muted-foreground)" }} /></button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2" style={{ scrollbarWidth: "none" }}>
          {filteredProjects.map((project) => (
            <div key={project.id} className="mb-0.5">
              <div className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer select-none"
                onClick={() => { toggleProject(project.id); setActiveProjectId(project.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: "project", id: project.id }); }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--sidebar-accent)"}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <span style={{ color: project.color }}>{project.isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}</span>
                {editingId === project.id ? (
                  <input autoFocus className="flex-1 bg-transparent outline-none text-xs font-semibold"
                    style={{ color: "var(--sidebar-primary)", fontFamily: "inherit", borderBottom: "1px solid var(--accent)" }}
                    value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()} />
                ) : (
                  <span className="flex-1 text-xs font-semibold truncate" style={{ color: "var(--sidebar-primary)" }}>{project.name}</span>
                )}
                {/* dual status: LLM + DB */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <span title={`LLM: ${project.llm.status}`}>{project.llm.status === "connected" ? <Unlock size={10} style={{ color: "#5a9e6f" }} /> : <Lock size={10} style={{ color: project.llm.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }} />}</span>
                  <span className="w-1 h-1 rounded-full" style={{ background: project.connection.status === "connected" ? "#5a9e6f" : "var(--muted-foreground)" }} title={`DB: ${project.connection.status}`} />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-0.5 rounded" onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: "project", id: project.id }); }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <MoreHorizontal size={11} style={{ color: "var(--muted-foreground)" }} />
                  </button>
                </div>
                <span style={{ color: "var(--muted-foreground)" }}>{project.isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
              </div>

              {project.isExpanded && (
                <div className="ml-3 border-l pl-1.5 mt-0.5 mb-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {SECTIONS.map((section) => (
                    <div key={section}>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors"
                        style={{
                          background: activeProjectId === project.id && activeSection === section && section !== "chat" ? "var(--sidebar-accent)" : "transparent",
                          color: activeProjectId === project.id && activeSection === section ? "var(--sidebar-primary)" : "var(--muted-foreground)",
                          fontWeight: activeProjectId === project.id && activeSection === section ? 500 : 400,
                        }}
                        onClick={() => { setSection(project.id, section); if (section === "chat" && project.threads[0]) setActiveThreadId(project.threads[0].id); }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = activeProjectId === project.id && activeSection === section && section !== "chat" ? "var(--sidebar-accent)" : "transparent")}>
                        <span>{SECTION_ICONS[section]}</span>
                        <span className="text-xs">{SECTION_LABELS[section]}</span>
                        {section === "chat" && project.llm.status !== "connected" && (
                          <Lock size={10} className="ml-auto" style={{ color: "#c96b6b" }} title="API 키 필요" />
                        )}
                        {section === "reports" && project.reports.length > 0 && (
                          <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{project.reports.length}</span>
                        )}
                        {section === "dashboard" && project.dashboard.length > 0 && (
                          <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{project.dashboard.length}</span>
                        )}
                      </button>

                      {section === "chat" && activeProjectId === project.id && activeSection === "chat" && (
                        <div className="ml-4 border-l pl-2 mt-0.5 mb-1" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <button className="flex items-center gap-1 text-xs px-2 py-1 rounded w-full text-left" style={{ color: "var(--muted-foreground)" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                            onClick={() => addThread(project.id)}>
                            <Plus size={11} /> 새 대화
                          </button>
                          {project.threads.map((thread) => (
                            <div key={thread.id} className="group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer"
                              style={{ background: activeThreadId === thread.id ? "var(--sidebar-accent)" : "transparent", borderLeft: activeThreadId === thread.id ? `2px solid ${project.color}` : "2px solid transparent", marginLeft: "-2px" }}
                              onClick={() => { setActiveThreadId(thread.id); setActiveProjectId(project.id); }}
                              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: "thread", id: thread.id, projectId: project.id }); }}
                              onMouseEnter={(e) => { if (activeThreadId !== thread.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={(e) => { if (activeThreadId !== thread.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              {editingId === thread.id ? (
                                <input autoFocus className="flex-1 bg-transparent outline-none text-xs"
                                  style={{ color: "var(--sidebar-primary)", fontFamily: "inherit", borderBottom: "1px solid var(--accent)" }}
                                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={commitEdit} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                                  onClick={(e) => e.stopPropagation()} />
                              ) : (
                                <span className="flex-1 text-xs truncate" style={{ color: activeThreadId === thread.id ? "var(--sidebar-primary)" : "var(--muted-foreground)" }}>{thread.title}</span>
                              )}
                            </div>
                          ))}
                          {project.threads.length === 0 && <p className="text-xs px-2 py-1" style={{ color: "var(--muted-foreground)" }}>대화 없음</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>U</div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--sidebar-primary)" }}>사용자</p>
              <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>user@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeProject ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>왼쪽에서 프로젝트를 선택하세요</p></div>
        ) : (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: activeProject.color }} />
                <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{activeProject.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {SECTIONS.map((section) => (
                  <button key={section}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: activeSection === section ? "var(--secondary)" : "transparent", color: activeSection === section ? "var(--foreground)" : "var(--muted-foreground)" }}
                    onClick={() => setSection(activeProject.id, section)}
                    onMouseEnter={(e) => { if (activeSection !== section) (e.currentTarget as HTMLElement).style.background = "var(--secondary)"; }}
                    onMouseLeave={(e) => { if (activeSection !== section) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    {SECTION_ICONS[section]}{SECTION_LABELS[section]}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-3">
                {/* LLM status */}
                <div className="flex items-center gap-1.5 text-xs" style={{ color: hasLLM ? "#5a9e6f" : activeProject.llm.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }}>
                  <Bot size={12} />
                  {hasLLM ? `${activeProviderMeta?.name} · ${activeProject.llm.model}` : "API 키 미설정"}
                </div>
                <div style={{ width: 1, height: 14, background: "var(--border)" }} />
                {/* DB status */}
                <div className="flex items-center gap-1.5 text-xs" style={{ color: activeProject.connection.status === "connected" ? "#5a9e6f" : activeProject.connection.status === "error" ? "#c96b6b" : "var(--muted-foreground)" }}>
                  <Database size={12} />
                  {activeProject.connection.status === "connected" ? activeProject.connection.database : "DB 미연결"}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* Connection section */}
              {activeSection === "connection" && (
                <ConnectionSection
                  project={activeProject}
                  onUpdateDB={(f, v) => updateDB(activeProject.id, f, v)}
                  onUpdateLLM={(f, v) => updateLLM(activeProject.id, f, v)}
                  onTestDB={() => testDB(activeProject.id)}
                  onTestLLM={() => testLLM(activeProject.id)}
                  dbTestState={dbTestState[activeProject.id] ?? "idle"}
                  llmTestState={llmTestState[activeProject.id] ?? "idle"}
                />
              )}

              {/* Reports */}
              {activeSection === "reports" && (
                <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollbarWidth: "none" }}>
                  <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <FileText size={16} style={{ color: "var(--accent)" }} />
                        <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>리포트</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{activeProject.reports.length}</span>
                      </div>
                      <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "var(--accent)", color: "#fff" }} onClick={() => setSection(activeProject.id, "chat")}>
                        <Sparkles size={12} /> AI로 리포트 생성
                      </button>
                    </div>
                    {activeProject.reports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Table size={36} style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                        <div className="text-center"><p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>아직 리포트가 없습니다</p><p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>AI 대화에서 "테이블 조회해줘"라고 요청해보세요</p></div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeProject.reports.map((report) => (
                          <ReportTable key={report.id} report={report} onAddToDashboard={() => { setSection(activeProject.id, "dashboard"); setTimeout(() => setChartModal({ mode: "create", prefillReportId: report.id }), 80); }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dashboard */}
              {activeSection === "dashboard" && (
                <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollbarWidth: "none" }}>
                  <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard size={16} style={{ color: "var(--accent)" }} />
                        <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>대시보드</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{activeProject.dashboard.length}개 차트</span>
                      </div>
                      <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "var(--accent)", color: "#fff" }} onClick={() => setChartModal({ mode: "create" })}>
                        <Plus size={12} /> 차트 만들기
                      </button>
                    </div>
                    {activeProject.reports.length === 0 && activeProject.dashboard.length === 0 && (
                      <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-xs border" style={{ borderColor: "rgba(201,112,58,0.3)", background: "rgba(201,112,58,0.08)", color: "var(--muted-foreground)" }}>
                        <AlertCircle size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />차트를 만들려면 먼저 리포트가 필요합니다.
                      </div>
                    )}
                    {activeProject.dashboard.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <BarChart2 size={36} style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                        <div className="text-center"><p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>대시보드가 비어 있습니다</p><p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>리포트 탭에서 "대시보드에 추가" 버튼을 누르거나 위 버튼으로 직접 만드세요</p></div>
                      </div>
                    ) : (
                      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
                        {activeProject.dashboard.map((chart) => (
                          <ChartCard key={chart.id} chart={chart} sourceReport={activeProject.reports.find((r) => r.id === chart.sourceReportId)}
                            onEdit={() => setChartModal({ mode: "edit", chart })}
                            onRemove={() => setProjects((prev) => prev.map((p) => p.id === activeProject.id ? { ...p, dashboard: p.dashboard.filter((c) => c.id !== chart.id) } : p))} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chat */}
              {activeSection === "chat" && (
                <>
                  {/* LLM gate banner */}
                  {!hasLLM && (
                    <div className="px-6 pt-4 shrink-0">
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ background: "rgba(201,112,58,0.08)", borderColor: "rgba(201,112,58,0.3)" }}>
                        <Lock size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>API 키가 설정되지 않았습니다</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>AI 대화를 사용하려면 LLM API 키를 먼저 등록하세요</p>
                        </div>
                        <button onClick={() => setSection(activeProject.id, "connection")}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium shrink-0"
                          style={{ background: "var(--accent)", color: "#fff" }}>
                          연결 설정 →
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5" style={{ scrollbarWidth: "none" }}>
                    {!activeThread ? (
                      <div className="flex flex-col items-center justify-center h-full gap-5">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--secondary)" }}>
                          <Sparkles size={22} style={{ color: hasLLM ? "var(--accent)" : "var(--muted-foreground)" }} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>새 대화를 시작하세요</p>
                          <p className="text-xs mt-1.5" style={{ color: "var(--muted-foreground)" }}>리포트 생성이나 대시보드 차트 추가를 요청해보세요</p>
                        </div>
                        {hasLLM && (
                          <div className="flex flex-col gap-2 w-full max-w-sm">
                            {["최근 6개월 매출 리포트 만들어줘", "사용자별 주문 현황 조회해줘", "매출 추이 차트 만들어서 대시보드에 추가해줘"].map((s) => (
                              <button key={s} className="text-left px-4 py-2.5 rounded-xl text-xs border transition-colors"
                                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--foreground)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}
                                onClick={() => { addThread(activeProject.id); setTimeout(() => setInputValue(s), 100); }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {activeThread.messages.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                            <Sparkles size={24} style={{ color: "var(--accent)", opacity: 0.5 }} />
                            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>무엇을 도와드릴까요?</p>
                          </div>
                        )}
                        {activeThread.messages.map((msg) => (
                          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            {msg.role === "assistant" && (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--secondary)" }}>
                                <Sparkles size={13} style={{ color: "var(--accent)" }} />
                              </div>
                            )}
                            <div className="max-w-[72%]">
                              <div className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                                style={msg.role === "user" ? { background: "var(--secondary)", color: "var(--foreground)", borderBottomRightRadius: 6 } : { background: "var(--card)", color: "var(--card-foreground)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }}>
                                {msg.content}
                              </div>
                              {msg.attachedReport && (
                                <>
                                  <InlineMiniReport report={msg.attachedReport} />
                                  <button className="mt-1.5 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                                    style={{ background: "rgba(201,112,58,0.15)", color: "var(--accent)" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(201,112,58,0.25)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(201,112,58,0.15)")}
                                    onClick={() => { setSection(activeProject.id, "dashboard"); setTimeout(() => setChartModal({ mode: "create", prefillReportId: msg.attachedReport!.id }), 80); }}>
                                    <LayoutDashboard size={12} /> 대시보드에 차트로 추가
                                  </button>
                                </>
                              )}
                              {msg.attachedChart && (
                                <div className="mt-2 px-3 py-2 rounded-xl flex items-center gap-2 text-xs border"
                                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                                  <BarChart2 size={12} style={{ color: msg.attachedChart.color }} />
                                  <span style={{ color: "var(--foreground)" }}>{msg.attachedChart.title}</span>
                                  <span>→ 대시보드에 추가됨</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {isTyping && (
                          <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--secondary)" }}>
                              <Sparkles size={13} style={{ color: "var(--accent)" }} />
                            </div>
                            <div className="px-4 py-3 rounded-2xl" style={{ background: "var(--card)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }}>
                              <div className="flex gap-1 items-center h-4">
                                {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted-foreground)", animationDelay: `${i * 150}ms` }} />)}
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  <div className="px-6 pb-5 shrink-0">
                    <div className="flex items-end gap-3 px-4 py-3 rounded-2xl border" style={{ background: hasLLM ? "var(--card)" : "var(--secondary)", borderColor: "var(--border)", opacity: hasLLM ? 1 : 0.6 }}>
                      <textarea ref={textareaRef} rows={1} value={inputValue} onChange={handleTextareaChange} onKeyDown={handleKeyDown}
                        placeholder={!hasLLM ? "LLM API 키를 먼저 설정해주세요" : activeThread ? "리포트 생성, 차트 추가, 데이터 조회를 요청해보세요..." : "왼쪽에서 대화를 선택하거나 새 대화를 시작하세요"}
                        disabled={!activeThread || !hasLLM}
                        className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
                        style={{ color: "var(--foreground)", fontFamily: "inherit", maxHeight: 180, scrollbarWidth: "none" }} />
                      <button onClick={sendMessage} disabled={!inputValue.trim() || !activeThread || !hasLLM}
                        className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 transition-all"
                        style={{ background: inputValue.trim() && activeThread && hasLLM ? "var(--accent)" : "var(--secondary)", color: inputValue.trim() && activeThread && hasLLM ? "#fff" : "var(--muted-foreground)" }}>
                        <Send size={14} />
                      </button>
                    </div>
                    <p className="text-center text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>Enter 전송 · Shift+Enter 줄바꿈</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Context Menu */}
      {contextMenu && (
        <div className="fixed z-50 py-1 rounded-lg shadow-xl border overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x, background: "var(--popover)", borderColor: "var(--border)", minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === "project" ? (
            <>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors" style={{ color: "var(--foreground)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => { setEditingId(contextMenu.id); setEditingValue(projects.find((p) => p.id === contextMenu.id)?.name ?? ""); setContextMenu(null); }}>
                <Edit3 size={12} /> 이름 변경
              </button>
              <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors" style={{ color: "var(--destructive)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(192,57,43,0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => { deleteProject(contextMenu.id); setContextMenu(null); }}>
                <Trash2 size={12} /> 프로젝트 삭제
              </button>
            </>
          ) : (
            <>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors" style={{ color: "var(--foreground)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-accent)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => { setEditingId(contextMenu.id); setEditingValue(projects.flatMap((p) => p.threads).find((t) => t.id === contextMenu.id)?.title ?? ""); setContextMenu(null); }}>
                <Edit3 size={12} /> 이름 변경
              </button>
              <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <button className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors" style={{ color: "var(--destructive)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(192,57,43,0.1)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => { deleteThread(contextMenu.projectId!, contextMenu.id); setContextMenu(null); }}>
                <Trash2 size={12} /> 대화 삭제
              </button>
            </>
          )}
        </div>
      )}

      {/* Chart Modal */}
      {chartModal && activeProject && (
        <ChartModal
          initial={chartModal.mode === "edit" ? chartModal.chart : chartModal.prefillReportId ? { sourceReportId: chartModal.prefillReportId } : undefined}
          reports={activeProject.reports}
          onSave={saveChart}
          onClose={() => setChartModal(null)}
        />
      )}
    </div>
  );
}
