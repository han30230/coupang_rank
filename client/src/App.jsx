import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from './lib/api';
import { loadLocalFavorites, saveLocalFavorites, isFav } from './lib/favorites';

const DEFAULT_KEYWORD = '노트북';
const DEFAULT_LIMIT = 10;

const CATEGORY_PRESETS = [
  { id: '1016', name: '가전디지털', keyword: '노트북' },
  { id: '1013', name: '주방용품', keyword: '에어프라이어' },
  { id: '1014', name: '생활용품', keyword: '무선청소기' },
  { id: '1021', name: '문구/오피스', keyword: '의자' },
  { id: '1011', name: '출산/유아동', keyword: '유모차' },
  { id: '1029', name: '반려동물용품', keyword: '고양이 모래' },
];

const USECASE_PRESETS = [
  { id: 'single-life', label: '자취 추천', keyword: '자취 필수템', cta: '자취 추천 보기' },
  { id: 'gift', label: '선물 추천', keyword: '선물용 소형가전', cta: '선물 추천 보기' },
  { id: 'office', label: '재택근무', keyword: '재택근무 책상 의자', cta: '재택근무 추천 보기' },
  { id: 'study', label: '학생/입문', keyword: '학생용 노트북', cta: '학생 추천 보기' },
];

const PRICE_PRESETS = [
  { id: 'under-3', label: '3만원 이하', keyword: '가성비 생활용품', tone: 'green' },
  { id: 'under-10', label: '10만원 이하', keyword: '10만원 이하 추천', tone: 'blue' },
  { id: 'under-30', label: '30만원 이하', keyword: '가성비 가전', tone: 'violet' },
  { id: 'premium', label: '프리미엄', keyword: '프리미엄 가전', tone: 'amber' },
];

const LANDING_ROUTES = {
  '/category/notebook': { type: 'keyword', keyword: '노트북 추천', title: '노트북 추천', description: '입문/가성비/프리미엄 노트북 추천' },
  '/category/airfryer': { type: 'keyword', keyword: '에어프라이어 추천', title: '에어프라이어 추천', description: '용량별 에어프라이어 추천' },
  '/category/desk-chair': { type: 'keyword', keyword: '사무용 의자 추천', title: '사무용 의자 추천', description: '재택/사무용 의자 추천' },
  '/price/under-100000': { type: 'keyword', keyword: '10만원 이하 추천', title: '10만원 이하 추천', description: '예산 중심 실속형 추천' },
  '/usecase/one-person-household': { type: 'keyword', keyword: '자취 필수템', title: '자취 추천', description: '1인 가구 생활템 추천' },
  '/usecase/work-from-home': { type: 'keyword', keyword: '재택근무 추천', title: '재택근무 추천', description: '재택 효율을 높이는 추천' },
};

function getSessionId() {
  try {
    const key = 'cr_session_id';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `s_${Date.now()}`;
  }
}

function getVariant() {
  try {
    const key = 'cr_variant';
    const params = new URLSearchParams(window.location.search);
    const queryV = params.get('v');
    if (queryV === 'A' || queryV === 'B') {
      localStorage.setItem(key, queryV);
      return queryV;
    }
    const existing = localStorage.getItem(key);
    if (existing === 'A' || existing === 'B') return existing;
    const picked = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem(key, picked);
    return picked;
  } catch {
    return 'A';
  }
}

function sendTrackEvent(name, params = {}, context = {}) {
  const payload = {
    eventName: name,
    pagePath: context.pagePath || window.location.pathname,
    sessionId: context.sessionId || '',
    variant: context.variant || '',
    params,
  };
  if (window?.gtag) window.gtag('event', name, params);
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function toPrice(product) {
  return Number(product.productPrice) || 0;
}

function badgeLabel(badge) {
  const map = {
    value: '가성비 추천',
    beginner: '입문용',
    bestseller: '베스트셀러',
    clicked: '많이 클릭됨',
    review: '후기 반응 좋음',
    premium: '프리미엄',
    practical: '실속형',
    single: '자취 추천',
  };
  return map[badge] || badge;
}

function buildReasons(product) {
  const p = toPrice(product);
  const rocket = product.isRocket === true || product.isRocket === 'true' || product.isRocket === 'Y';
  const free = product.isFreeShipping === true || product.isFreeShipping === 'true' || product.isFreeShipping === 'Y';
  const reasons = [];
  if (p > 0 && p < 100000) reasons.push('예산 부담이 적은 가격대');
  if (rocket) reasons.push('빠른 배송 옵션 확인 가능');
  if (free) reasons.push('배송비 부담을 줄이기 좋음');
  if (reasons.length === 0) reasons.push('핵심 기능 중심으로 비교하기 좋음');
  return reasons.slice(0, 3);
}

function buildBadges(product, position = 0) {
  const p = toPrice(product);
  const list = [];
  if (position < 3) list.push('clicked');
  if (p > 0 && p < 100000) list.push('value');
  if (p > 500000) list.push('premium');
  const rocket = product.isRocket === true || product.isRocket === 'true' || product.isRocket === 'Y';
  if (rocket) list.push('practical');
  if (list.length === 0) list.push('beginner');
  return list.slice(0, 2);
}

function Badge({ children, tone = 'zinc' }) {
  const tones = {
    green: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
    blue: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
    violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
    amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
    zinc: 'bg-white/10 text-zinc-200 ring-white/20',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ${tones[tone] || tones.zinc}`}>{children}</span>;
}

function ProductCard({ product, section, index, fav, onToggleFav, onTrack }) {
  const name = product.productName || '상품명 없음';
  const price = toPrice(product);
  const priceStr = price > 0 ? `${price.toLocaleString()}원` : '가격 확인 필요';
  const imageUrl = product.productImage || '';
  const productUrl = product.productUrl || '#';
  const reasons = buildReasons(product);
  const badges = buildBadges(product, index);
  const recommendedFor = price > 300000 ? '성능 중심 사용자' : '입문/실속 사용자';

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300/40">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900/80">
        {imageUrl ? (
          <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">이미지 없음</div>
        )}
        <button
          type="button"
          onClick={() => onToggleFav(product)}
          className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/20 hover:bg-black/60"
          aria-label={fav ? '찜 해제' : '찜하기'}
        >
          {fav ? '♥' : '♡'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <Badge key={badge}>{badgeLabel(badge)}</Badge>
        ))}
      </div>

      <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-white">{name}</h3>
      <p className="mt-1 text-xl font-bold text-emerald-300">{priceStr}</p>
      <p className="mt-1 text-xs text-zinc-300">추천 대상: {recommendedFor}</p>

      <ul className="mt-2 space-y-1 text-xs text-zinc-300">
        {reasons.map((r) => (
          <li key={r} className="flex items-start gap-1">
            <span className="mt-1 h-1 w-1 rounded-full bg-emerald-300" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-3">
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-400 px-3 py-2 text-sm font-bold text-zinc-900 hover:bg-emerald-300"
          onClick={() => onTrack('product_outbound_click', { section, index, productId: product.productId })}
        >
          가격/후기 보기 ↗
        </a>
      </div>
    </article>
  );
}

function SectionHeader({ title, subtitle, actionLabel, onAction }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white md:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-zinc-300">{subtitle}</p>}
      </div>
      {actionLabel && (
        <button type="button" onClick={onAction} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/15">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function AdminEventsDashboard() {
  const [rangeHours, setRangeHours] = useState(24);
  const [summary, setSummary] = useState([]);
  const [variantSummary, setVariantSummary] = useState([]);
  const [recent, setRecent] = useState([]);
  const [kpi, setKpi] = useState({ totals: {}, byVariant: [] });
  const [thresholds, setThresholds] = useState({
    outboundRateGood: 8,
    outboundRateWarn: 4,
    recirculationRateGood: 20,
    recirculationRateWarn: 10,
    outboundPerSessionGood: 0.3,
    outboundPerSessionWarn: 0.15,
    significancePvHigh: 500,
    significancePvMedium: 200,
  });
  const [trendDays, setTrendDays] = useState(7);
  const [trend, setTrend] = useState([]);
  const [impactAction, setImpactAction] = useState('open_variant_A');
  const [impactWindowHours, setImpactWindowHours] = useState(24);
  const [impact, setImpact] = useState(null);
  const [configMeta, setConfigMeta] = useState({ loadedAt: 0, fingerprint: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restartNotice, setRestartNotice] = useState({ pending: false, snapshot: '' });

  const trackAdminAction = (action, extra = {}) => {
    sendTrackEvent('admin_action_click', { action, ...extra }, {
      pagePath: '/admin/events',
      sessionId: getSessionId(),
      variant: 'admin',
    });
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [a, b, c, d, e, g] = await Promise.all([
        apiGet(`/api/events/summary?rangeHours=${rangeHours}&limit=100`),
        apiGet(`/api/events/summary-by-variant?rangeHours=${rangeHours}&limit=500`),
        apiGet('/api/events/recent?limit=120'),
        apiGet(`/api/events/kpi?rangeHours=${rangeHours}`),
        apiGet(`/api/events/trend?days=${trendDays}`),
        apiGet('/api/events/config'),
      ]);
      setSummary(a.items || []);
      setVariantSummary(b.items || []);
      setRecent(c.items || []);
      setKpi({ totals: d?.totals ? d.totals : {}, byVariant: d?.byVariant || [] });
      setThresholds(g?.thresholds || d?.thresholds || thresholds);
      setConfigMeta({ loadedAt: Number(g?.loadedAt || 0), fingerprint: String(g?.fingerprint || '') });
      setTrend(e.items || []);
      const f = await apiGet(`/api/events/admin-action-impact?action=${encodeURIComponent(impactAction)}&windowHours=${impactWindowHours}`);
      setImpact(f?.found ? f.impact : null);
    } catch (e) {
      setError(e.message || '이벤트 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('cr_admin_restart_notice');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.pending === 'boolean') {
          setRestartNotice(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const currentSnapshot = JSON.stringify({
      outboundRateGood: thresholds.outboundRateGood,
      outboundRateWarn: thresholds.outboundRateWarn,
      recirculationRateGood: thresholds.recirculationRateGood,
      recirculationRateWarn: thresholds.recirculationRateWarn,
      outboundPerSessionGood: thresholds.outboundPerSessionGood,
      outboundPerSessionWarn: thresholds.outboundPerSessionWarn,
      significancePvHigh: thresholds.significancePvHigh,
      significancePvMedium: thresholds.significancePvMedium,
    });
    if (restartNotice.pending && restartNotice.snapshot && restartNotice.snapshot !== currentSnapshot) {
      const next = { pending: false, snapshot: currentSnapshot };
      setRestartNotice(next);
      try {
        localStorage.setItem('cr_admin_restart_notice', JSON.stringify(next));
      } catch {
        // ignore
      }
    }
  }, [thresholds, restartNotice]);

  const markRestartNotice = () => {
    const snapshot = JSON.stringify({
      outboundRateGood: thresholds.outboundRateGood,
      outboundRateWarn: thresholds.outboundRateWarn,
      recirculationRateGood: thresholds.recirculationRateGood,
      recirculationRateWarn: thresholds.recirculationRateWarn,
      outboundPerSessionGood: thresholds.outboundPerSessionGood,
      outboundPerSessionWarn: thresholds.outboundPerSessionWarn,
      significancePvHigh: thresholds.significancePvHigh,
      significancePvMedium: thresholds.significancePvMedium,
    });
    const next = { pending: true, snapshot };
    setRestartNotice(next);
    try {
      localStorage.setItem('cr_admin_restart_notice', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, [rangeHours, trendDays, impactAction, impactWindowHours]);

  const fmtTime = (ms) => new Date(Number(ms)).toLocaleString();
  const pct = (num, den) => {
    const n = Number(num) || 0;
    const d = Number(den) || 0;
    if (!d) return '0.0%';
    return `${((n / d) * 100).toFixed(1)}%`;
  };
  const perSession = (num, den) => {
    const n = Number(num) || 0;
    const d = Number(den) || 0;
    if (!d) return '0.00';
    return (n / d).toFixed(2);
  };
  const clsByGoal = (value, good, warn) => {
    if (value >= good) return 'text-emerald-300';
    if (value >= warn) return 'text-amber-300';
    return 'text-rose-300';
  };
  const outboundRate = (() => {
    const pv = Number(kpi.totals?.pageViews || 0);
    const ob = Number(kpi.totals?.outboundClicks || 0);
    return pv ? (ob / pv) * 100 : 0;
  })();
  const recirculationRate = (() => {
    const pv = Number(kpi.totals?.pageViews || 0);
    const rc = Number(kpi.totals?.recirculationClicks || 0);
    return pv ? (rc / pv) * 100 : 0;
  })();
  const outboundPerSessionValue = (() => {
    const ob = Number(kpi.totals?.outboundClicks || 0);
    const s = Number(kpi.totals?.totalSessions || 0);
    return s ? ob / s : 0;
  })();
  const chartWidth = 760;
  const chartHeight = 220;
  const chartPadding = 24;
  const maxRate = Math.max(
    1,
    ...trend.map((row) => {
      const ob = Number(row.outboundClicks || 0);
      const pv = Number(row.pageViews || 0);
      const rc = Number(row.recirculationClicks || 0);
      const oRate = pv ? (ob / pv) * 100 : 0;
      const rRate = pv ? (rc / pv) * 100 : 0;
      return Math.max(oRate, rRate);
    }),
    Number(thresholds.recirculationRateGood || 20),
    Number(thresholds.outboundRateGood || 8),
  );
  const buildLine = (values) => {
    if (!values.length) return '';
    return values
      .map((v, idx) => {
        const x = chartPadding + (idx * (chartWidth - chartPadding * 2)) / Math.max(1, values.length - 1);
        const y = chartHeight - chartPadding - (v / maxRate) * (chartHeight - chartPadding * 2);
        return `${x},${y}`;
      })
      .join(' ');
  };
  const trendOutbound = trend.map((row) => {
    const ob = Number(row.outboundClicks || 0);
    const pv = Number(row.pageViews || 0);
    return pv ? (ob / pv) * 100 : 0;
  });
  const trendRecirculation = trend.map((row) => {
    const rc = Number(row.recirculationClicks || 0);
    const pv = Number(row.pageViews || 0);
    return pv ? (rc / pv) * 100 : 0;
  });
  const movingAverage = (arr, windowSize = 7) =>
    arr.map((_, idx) => {
      const start = Math.max(0, idx - (windowSize - 1));
      const slice = arr.slice(start, idx + 1);
      const sum = slice.reduce((acc, v) => acc + Number(v || 0), 0);
      return slice.length ? sum / slice.length : 0;
    });
  const trendOutboundMA = movingAverage(trendOutbound, 7);
  const trendRecirculationMA = movingAverage(trendRecirculation, 7);
  const prevDelta = (arr) => {
    if (!arr.length) return 0;
    if (arr.length === 1) return arr[0] || 0;
    return (arr[arr.length - 1] || 0) - (arr[arr.length - 2] || 0);
  };
  const outboundDelta = prevDelta(trendOutbound);
  const recirculationDelta = prevDelta(trendRecirculation);
  const consecutiveBelowDays = (values, threshold) => {
    let cnt = 0;
    for (let i = values.length - 1; i >= 0; i -= 1) {
      if (Number(values[i] || 0) < Number(threshold)) cnt += 1;
      else break;
    }
    return cnt;
  };
  const outboundBelowStreak = consecutiveBelowDays(trendOutbound, thresholds.outboundRateWarn);
  const recirculationBelowStreak = consecutiveBelowDays(trendRecirculation, thresholds.recirculationRateWarn);
  const todayOutbound = trendOutbound.length ? trendOutbound[trendOutbound.length - 1] : 0;
  const todayRecirculation = trendRecirculation.length ? trendRecirculation[trendRecirculation.length - 1] : 0;
  const summaryLevel = (() => {
    if (outboundBelowStreak >= 3 || recirculationBelowStreak >= 3) return 'critical';
    if (todayOutbound < Number(thresholds.outboundRateWarn) || todayRecirculation < Number(thresholds.recirculationRateWarn)) return 'warn';
    if (todayOutbound >= Number(thresholds.outboundRateGood) && todayRecirculation >= Number(thresholds.recirculationRateGood)) return 'good';
    return 'normal';
  })();
  const summaryTheme = {
    good: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
    normal: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    warn: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
    critical: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
  };
  const summaryTitle = {
    good: '상태 양호: KPI가 목표 범위에 있습니다.',
    normal: '상태 보통: 일부 KPI가 목표에 근접합니다.',
    warn: '주의: 오늘 KPI가 경고선 아래입니다.',
    critical: '긴급: KPI 미달이 연속 발생 중입니다.',
  };
  const summaryAction = (() => {
    if (summaryLevel === 'critical') return '히어로 CTA/카드 문구 A/B를 즉시 재배치하고, 인기 섹션 상단 고정 실험을 권장합니다.';
    if (summaryLevel === 'warn') return '오늘 유입 구간에서 클릭 장벽을 낮추는 문구(가격 보기/후기 보기) 비중을 늘려보세요.';
    if (summaryLevel === 'good') return '현재 구성을 유지하며 상위 성과 variant에 트래픽을 더 배분하세요.';
    return '전일 대비 하락 항목 중심으로 섹션 순서 및 CTA 반복 위치를 점검해보세요.';
  })();
  const deltaView = (v) => {
    const sign = v > 0 ? '▲' : v < 0 ? '▼' : '■';
    const cls = v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : 'text-zinc-300';
    return <span className={cls}>{sign} {Math.abs(v).toFixed(2)}%p</span>;
  };
  const ratio = (num, den) => {
    const n = Number(num) || 0;
    const d = Number(den) || 0;
    return d ? (n / d) * 100 : 0;
  };
  const diffView = (a, b) => {
    const delta = Number(b || 0) - Number(a || 0);
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(2)}%p`;
  };
  const fromNow = (ts) => {
    const t = Number(ts || 0);
    if (!t) return '-';
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return `${sec}초 전`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    return `${day}일 전`;
  };
  const avg = (arr) => {
    if (!arr.length) return 0;
    return arr.reduce((acc, v) => acc + Number(v || 0), 0) / arr.length;
  };
  const recent7 = trend.slice(-7);
  const avgDailySessions7 = avg(recent7.map((d) => Number(d.totalSessions || 0)));
  const avgDailyPv7 = avg(recent7.map((d) => Number(d.pageViews || 0)));
  const scaleReady = avgDailySessions7 >= 500 || avgDailyPv7 >= 1500;
  const initialPreset = `KPI_OUTBOUND_RATE_GOOD=5
KPI_OUTBOUND_RATE_WARN=2.5
KPI_RECIRCULATION_RATE_GOOD=12
KPI_RECIRCULATION_RATE_WARN=6
KPI_OUTBOUND_PER_SESSION_GOOD=0.18
KPI_OUTBOUND_PER_SESSION_WARN=0.08
KPI_SIGNIFICANCE_PV_HIGH=250
KPI_SIGNIFICANCE_PV_MEDIUM=120`;
  const scalePreset = `KPI_OUTBOUND_RATE_GOOD=8
KPI_OUTBOUND_RATE_WARN=4
KPI_RECIRCULATION_RATE_GOOD=20
KPI_RECIRCULATION_RATE_WARN=10
KPI_OUTBOUND_PER_SESSION_GOOD=0.3
KPI_OUTBOUND_PER_SESSION_WARN=0.15
KPI_SIGNIFICANCE_PV_HIGH=500
KPI_SIGNIFICANCE_PV_MEDIUM=200`;
  const recommendedMap = scaleReady
    ? {
      KPI_OUTBOUND_RATE_GOOD: 8,
      KPI_OUTBOUND_RATE_WARN: 4,
      KPI_RECIRCULATION_RATE_GOOD: 20,
      KPI_RECIRCULATION_RATE_WARN: 10,
      KPI_OUTBOUND_PER_SESSION_GOOD: 0.3,
      KPI_OUTBOUND_PER_SESSION_WARN: 0.15,
      KPI_SIGNIFICANCE_PV_HIGH: 500,
      KPI_SIGNIFICANCE_PV_MEDIUM: 200,
    }
    : {
      KPI_OUTBOUND_RATE_GOOD: 5,
      KPI_OUTBOUND_RATE_WARN: 2.5,
      KPI_RECIRCULATION_RATE_GOOD: 12,
      KPI_RECIRCULATION_RATE_WARN: 6,
      KPI_OUTBOUND_PER_SESSION_GOOD: 0.18,
      KPI_OUTBOUND_PER_SESSION_WARN: 0.08,
      KPI_SIGNIFICANCE_PV_HIGH: 250,
      KPI_SIGNIFICANCE_PV_MEDIUM: 120,
    };
  const currentMap = {
    KPI_OUTBOUND_RATE_GOOD: Number(thresholds.outboundRateGood),
    KPI_OUTBOUND_RATE_WARN: Number(thresholds.outboundRateWarn),
    KPI_RECIRCULATION_RATE_GOOD: Number(thresholds.recirculationRateGood),
    KPI_RECIRCULATION_RATE_WARN: Number(thresholds.recirculationRateWarn),
    KPI_OUTBOUND_PER_SESSION_GOOD: Number(thresholds.outboundPerSessionGood),
    KPI_OUTBOUND_PER_SESSION_WARN: Number(thresholds.outboundPerSessionWarn),
    KPI_SIGNIFICANCE_PV_HIGH: Number(thresholds.significancePvHigh),
    KPI_SIGNIFICANCE_PV_MEDIUM: Number(thresholds.significancePvMedium),
  };
  const diffRows = Object.keys(recommendedMap).map((key) => {
    const current = currentMap[key];
    const recommended = recommendedMap[key];
    return { key, current, recommended, changed: Number(current) !== Number(recommended) };
  });
  const changedRows = diffRows.filter((r) => r.changed);
  const envPatchText = changedRows.map((r) => `${r.key}=${r.recommended}`).join('\n');
  const getSignificance = (beforePv, afterPv) => {
    const b = Number(beforePv || 0);
    const a = Number(afterPv || 0);
    const minPv = Math.min(b, a);
    const high = Number(thresholds.significancePvHigh || 500);
    const medium = Number(thresholds.significancePvMedium || 200);
    if (minPv >= high) return { level: 'high', text: '신뢰도 높음 (표본 충분)' };
    if (minPv >= medium) return { level: 'medium', text: '신뢰도 보통 (표본 보통)' };
    return { level: 'low', text: '해석 주의 (표본 부족)' };
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h1 className="text-2xl font-black text-white">이벤트 대시보드</h1>
          <p className="mt-1 text-sm text-zinc-300">전환 이벤트, A/B variant 반응, 최근 로그를 확인합니다.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {[1, 6, 24, 72, 168].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setRangeHours(h)}
                className={`rounded-lg px-3 py-2 text-xs font-bold ring-1 ${rangeHours === h ? 'bg-emerald-400 text-zinc-900 ring-emerald-300' : 'bg-white/10 text-white ring-white/20'}`}
              >
                최근 {h}시간
              </button>
            ))}
            <button type="button" onClick={load} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-zinc-900">
              새로고침
            </button>
            <a
              href={`/api/events/export.csv?rangeHours=${rangeHours}&limit=10000`}
              onClick={() => trackAdminAction('export_csv', { rangeHours, limit: 10000 })}
              className="rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-zinc-900"
            >
              CSV 내보내기
            </a>
            <a href="/" className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20">서비스 홈</a>
          </div>
        </header>

        {loading && <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">데이터를 불러오는 중...</div>}
        {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
        {restartNotice.pending && (
          <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-100">
            <h2 className="text-base font-black">서버 재시작 필요 가능</h2>
            <p className="mt-1 text-xs">
              `.env` 변경분을 복사한 이후입니다. 서버를 재시작해야 KPI 기준 변경이 반영됩니다.
            </p>
            <p className="mt-1 text-xs text-amber-200/90">
              마지막 설정 반영 시각: {configMeta.loadedAt ? new Date(configMeta.loadedAt).toLocaleString() : '확인 중'}
              {configMeta.loadedAt ? ` (${fromNow(configMeta.loadedAt)})` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-lg bg-black/20 px-3 py-1.5 text-xs">로컬: `npm run dev` 재실행</span>
              <span className="rounded-lg bg-black/20 px-3 py-1.5 text-xs">배포: 재배포 또는 인스턴스 재시작</span>
            </div>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-zinc-900"
            >
              다시 확인
            </button>
          </section>
        )}

        <section className={`mt-6 rounded-2xl border p-4 ${scaleReady ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>
          <h2 className="text-base font-black">
            {scaleReady ? '스케일 단계 권장 기준' : '초기 트래픽 단계 권장 기준'}
          </h2>
          <p className="mt-1 text-xs">
            최근 7일 평균 · 세션 {avgDailySessions7.toFixed(1)} / PV {avgDailyPv7.toFixed(1)}
            {' · '}
            {scaleReady ? '스케일 기준 충족(세션 500+ 또는 PV 1500+)' : '아직 초기 기준 유지 권장'}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/20 bg-black/20 p-3">
              <div className="mb-2 text-xs font-bold text-white">초기 프리셋</div>
              <pre className="overflow-auto whitespace-pre-wrap text-[11px] text-zinc-100">{initialPreset}</pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(initialPreset);
                  trackAdminAction('copy_initial_env_preset');
                  markRestartNotice();
                }}
                className="mt-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-zinc-900"
              >
                초기 프리셋 복사
              </button>
            </div>
            <div className="rounded-lg border border-white/20 bg-black/20 p-3">
              <div className="mb-2 text-xs font-bold text-white">스케일 프리셋</div>
              <pre className="overflow-auto whitespace-pre-wrap text-[11px] text-zinc-100">{scalePreset}</pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(scalePreset);
                  trackAdminAction('copy_scale_env_preset');
                  markRestartNotice();
                }}
                className="mt-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-zinc-900"
              >
                스케일 프리셋 복사
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-base font-black text-white">현재 .env 대비 권장값 diff</h2>
          <p className="mt-1 text-xs text-zinc-400">
            서버가 현재 읽은 KPI 값과 {scaleReady ? '스케일' : '초기'} 권장 프리셋을 비교했습니다.
          </p>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-left text-xs text-zinc-200">
              <thead className="text-zinc-400">
                <tr>
                  <th className="px-2 py-2">KEY</th>
                  <th className="px-2 py-2">현재값</th>
                  <th className="px-2 py-2">권장값</th>
                  <th className="px-2 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((r) => (
                  <tr key={r.key} className="border-t border-white/10">
                    <td className="px-2 py-2">{r.key}</td>
                    <td className="px-2 py-2">{r.current}</td>
                    <td className="px-2 py-2">{r.recommended}</td>
                    <td className={`px-2 py-2 font-semibold ${r.changed ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {r.changed ? '변경 필요' : '유지'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changedRows.length === 0 ? (
            <p className="mt-3 text-xs text-emerald-300">현재 .env KPI 값이 권장 프리셋과 일치합니다.</p>
          ) : (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-xs font-bold text-white">적용할 값 (복붙용)</div>
              <pre className="overflow-auto whitespace-pre-wrap text-[11px] text-zinc-100">{envPatchText}</pre>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(envPatchText);
                  trackAdminAction('copy_env_diff_patch', { targetPreset: scaleReady ? 'scale' : 'initial', changedCount: changedRows.length });
                  markRestartNotice();
                }}
                className="mt-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-zinc-900"
              >
                변경분 복사
              </button>
            </div>
          )}
        </section>

        <section className={`mt-6 rounded-2xl border p-4 ${summaryTheme[summaryLevel]}`}>
          <h2 className="text-base font-black">{summaryTitle[summaryLevel]}</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
            <div>오늘 외부 이동률: <span className="font-bold">{todayOutbound.toFixed(2)}%</span> (warn {thresholds.outboundRateWarn}%)</div>
            <div>오늘 재탐색률: <span className="font-bold">{todayRecirculation.toFixed(2)}%</span> (warn {thresholds.recirculationRateWarn}%)</div>
            <div>
              연속 미달일:
              <span className="ml-1 font-bold">외부 {outboundBelowStreak}일</span>,
              <span className="ml-1 font-bold">재탐색 {recirculationBelowStreak}일</span>
            </div>
          </div>
          <p className="mt-2 text-xs">{summaryAction}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/?v=A"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAdminAction('open_variant_A')}
              className="rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-white"
            >
              A안 강제 열기
            </a>
            <a
              href="/?v=B"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAdminAction('open_variant_B')}
              className="rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-white"
            >
              B안 강제 열기
            </a>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAdminAction('open_home_check')}
              className="rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25"
            >
              홈 실서비스 점검
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?v=A`);
                trackAdminAction('copy_variant_A_link');
              }}
              className="rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25"
            >
              A안 링크 복사
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?v=B`);
                trackAdminAction('copy_variant_B_link');
              }}
              className="rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/30 hover:bg-white/25"
            >
              B안 링크 복사
            </button>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">세션 수</div>
            <div className="mt-1 text-2xl font-black text-white">{Number(kpi.totals?.totalSessions || 0).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">상품 외부 이동률</div>
            <div className={`mt-1 text-2xl font-black ${clsByGoal(outboundRate, Number(thresholds.outboundRateGood), Number(thresholds.outboundRateWarn))}`}>{pct(kpi.totals?.outboundClicks, kpi.totals?.pageViews)}</div>
            <div className="mt-1 text-xs text-zinc-400">outbound / page_view</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">재탐색률</div>
            <div className={`mt-1 text-2xl font-black ${clsByGoal(recirculationRate, Number(thresholds.recirculationRateGood), Number(thresholds.recirculationRateWarn))}`}>{pct(kpi.totals?.recirculationClicks, kpi.totals?.pageViews)}</div>
            <div className="mt-1 text-xs text-zinc-400">recirculation / page_view</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">세션당 외부 클릭</div>
            <div className={`mt-1 text-2xl font-black ${clsByGoal(outboundPerSessionValue, Number(thresholds.outboundPerSessionGood), Number(thresholds.outboundPerSessionWarn))}`}>
              {perSession(kpi.totals?.outboundClicks, kpi.totals?.totalSessions)}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              goal {thresholds.outboundPerSessionGood}+ / warn {thresholds.outboundPerSessionWarn}+
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">운영 액션 성과 리포트</h2>
            <div className="flex flex-wrap gap-2">
              <select value={impactAction} onChange={(e) => setImpactAction(e.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-white">
                <option value="open_variant_A">open_variant_A</option>
                <option value="open_variant_B">open_variant_B</option>
                <option value="open_home_check">open_home_check</option>
                <option value="copy_variant_A_link">copy_variant_A_link</option>
                <option value="copy_variant_B_link">copy_variant_B_link</option>
                <option value="export_csv">export_csv</option>
              </select>
              <select value={impactWindowHours} onChange={(e) => setImpactWindowHours(Number(e.target.value))} className="rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-white">
                <option value={6}>6h window</option>
                <option value={24}>24h window</option>
                <option value={48}>48h window</option>
              </select>
            </div>
          </div>
          {!impact ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">선택한 액션 로그가 아직 없어 비교할 데이터가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(() => {
                const sig = getSignificance(impact.before?.pageViews, impact.after?.pageViews);
                const sigCls = sig.level === 'high'
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : sig.level === 'medium'
                    ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                    : 'border-rose-400/30 bg-rose-500/10 text-rose-200';
                return (
                  <div className={`md:col-span-3 rounded-lg border px-3 py-2 text-xs ${sigCls}`}>
                    {sig.text} · before PV {Number(impact.before?.pageViews || 0).toLocaleString()} / after PV {Number(impact.after?.pageViews || 0).toLocaleString()}
                  </div>
                );
              })()}
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-zinc-400">기준 액션 시점</div>
                <div className="mt-1 text-sm font-bold text-white">{new Date(impact.pivotAt).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-zinc-400">외부 이동률 변화</div>
                <div className="mt-1 text-sm text-zinc-200">
                  {ratio(impact.before?.outboundClicks, impact.before?.pageViews).toFixed(2)}% → {ratio(impact.after?.outboundClicks, impact.after?.pageViews).toFixed(2)}%
                </div>
                <div className="mt-1 text-xs text-emerald-300">
                  {diffView(
                    ratio(impact.before?.outboundClicks, impact.before?.pageViews),
                    ratio(impact.after?.outboundClicks, impact.after?.pageViews),
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-zinc-400">재탐색률 변화</div>
                <div className="mt-1 text-sm text-zinc-200">
                  {ratio(impact.before?.recirculationClicks, impact.before?.pageViews).toFixed(2)}% → {ratio(impact.after?.recirculationClicks, impact.after?.pageViews).toFixed(2)}%
                </div>
                <div className="mt-1 text-xs text-sky-300">
                  {diffView(
                    ratio(impact.before?.recirculationClicks, impact.before?.pageViews),
                    ratio(impact.after?.recirculationClicks, impact.after?.pageViews),
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">일별 KPI 트렌드</h2>
            <div className="flex gap-2">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendDays(d)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 ${trendDays === d ? 'bg-emerald-400 text-zinc-900 ring-emerald-300' : 'bg-white/10 text-white ring-white/20'}`}
                >
                  최근 {d}일
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-zinc-400">이동률 라인 차트 (%)</span>
              <div className="flex gap-3">
                <span className="text-zinc-300">외부 이동률 전일 대비 {deltaView(outboundDelta)}</span>
                <span className="text-zinc-300">재탐색률 전일 대비 {deltaView(recirculationDelta)}</span>
              </div>
            </div>
            {trend.length === 0 ? (
              <div className="text-xs text-zinc-500">차트 데이터가 없습니다.</div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full">
                <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="#3f3f46" strokeWidth="1" />
                <line x1={chartPadding} y1={chartPadding} x2={chartPadding} y2={chartHeight - chartPadding} stroke="#3f3f46" strokeWidth="1" />
                {trend.map((row, idx) => {
                  const pv = Number(row.pageViews || 0);
                  const ob = Number(row.outboundClicks || 0);
                  const rc = Number(row.recirculationClicks || 0);
                  const oRate = pv ? (ob / pv) * 100 : 0;
                  const rRate = pv ? (rc / pv) * 100 : 0;
                  const isBelow = oRate < Number(thresholds.outboundRateWarn) || rRate < Number(thresholds.recirculationRateWarn);
                  if (!isBelow) return null;
                  const x = chartPadding + (idx * (chartWidth - chartPadding * 2)) / Math.max(1, trend.length - 1);
                  const bandW = (chartWidth - chartPadding * 2) / Math.max(1, trend.length - 1);
                  return (
                    <rect
                      key={`${row.day}-warn`}
                      x={x - bandW / 2}
                      y={chartPadding}
                      width={Math.max(8, bandW)}
                      height={chartHeight - chartPadding * 2}
                      fill="#7f1d1d"
                      opacity="0.15"
                    />
                  );
                })}
                <polyline fill="none" stroke="#34d399" strokeWidth="3" points={buildLine(trendOutbound)} />
                <polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={buildLine(trendRecirculation)} />
                <polyline fill="none" stroke="#86efac" strokeWidth="2" strokeDasharray="4 4" points={buildLine(trendOutboundMA)} />
                <polyline fill="none" stroke="#7dd3fc" strokeWidth="2" strokeDasharray="4 4" points={buildLine(trendRecirculationMA)} />
                <line
                  x1={chartPadding}
                  y1={chartHeight - chartPadding - (Number(thresholds.outboundRateGood) / maxRate) * (chartHeight - chartPadding * 2)}
                  x2={chartWidth - chartPadding}
                  y2={chartHeight - chartPadding - (Number(thresholds.outboundRateGood) / maxRate) * (chartHeight - chartPadding * 2)}
                  stroke="#14532d"
                  strokeDasharray="6 4"
                />
                <line
                  x1={chartPadding}
                  y1={chartHeight - chartPadding - (Number(thresholds.recirculationRateGood) / maxRate) * (chartHeight - chartPadding * 2)}
                  x2={chartWidth - chartPadding}
                  y2={chartHeight - chartPadding - (Number(thresholds.recirculationRateGood) / maxRate) * (chartHeight - chartPadding * 2)}
                  stroke="#0c4a6e"
                  strokeDasharray="6 4"
                />
              </svg>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="text-emerald-300">● 외부 이동률</span>
              <span className="text-sky-300">● 재탐색률</span>
              <span className="text-emerald-200">- - 외부 이동률 7일 MA</span>
              <span className="text-sky-200">- - 재탐색률 7일 MA</span>
              <span className="text-zinc-400">-- 목표선</span>
              <span className="text-rose-300">▮ 목표선 미달일</span>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs text-zinc-200">
              <thead className="text-zinc-400">
                <tr>
                  <th className="px-2 py-2">날짜</th>
                  <th className="px-2 py-2">세션</th>
                  <th className="px-2 py-2">페이지뷰</th>
                  <th className="px-2 py-2">외부클릭</th>
                  <th className="px-2 py-2">외부이동률</th>
                  <th className="px-2 py-2">재탐색클릭</th>
                  <th className="px-2 py-2">재탐색률</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((row) => (
                  <tr key={row.day} className="border-t border-white/10">
                    <td className="px-2 py-2">{row.day}</td>
                    <td className="px-2 py-2">{Number(row.totalSessions || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{Number(row.pageViews || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{Number(row.outboundClicks || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-emerald-300">{pct(row.outboundClicks, row.pageViews)}</td>
                    <td className="px-2 py-2">{Number(row.recirculationClicks || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-sky-300">{pct(row.recirculationClicks, row.pageViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-bold text-white">Variant KPI 비교</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs text-zinc-200">
              <thead className="text-zinc-400">
                <tr>
                  <th className="px-2 py-2">Variant</th>
                  <th className="px-2 py-2">세션</th>
                  <th className="px-2 py-2">페이지뷰</th>
                  <th className="px-2 py-2">외부클릭</th>
                  <th className="px-2 py-2">외부이동률</th>
                  <th className="px-2 py-2">재탐색클릭</th>
                  <th className="px-2 py-2">재탐색률</th>
                </tr>
              </thead>
              <tbody>
                {(kpi.byVariant || []).map((row) => (
                  <tr key={row.variant} className="border-t border-white/10">
                    <td className="px-2 py-2">{row.variant}</td>
                    <td className="px-2 py-2">{Number(row.totalSessions || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{Number(row.pageViews || 0).toLocaleString()}</td>
                    <td className="px-2 py-2">{Number(row.outboundClicks || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-emerald-300">{pct(row.outboundClicks, row.pageViews)}</td>
                    <td className="px-2 py-2">{Number(row.recirculationClicks || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-sky-300">{pct(row.recirculationClicks, row.pageViews)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-lg font-bold text-white">이벤트 총량</h2>
            <div className="space-y-2">
              {summary.length === 0 ? (
                <p className="text-sm text-zinc-400">데이터가 없습니다.</p>
              ) : (
                summary.map((row) => (
                  <div key={row.eventName} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span className="text-sm text-zinc-200">{row.eventName}</span>
                    <span className="text-sm font-bold text-emerald-300">{row.cnt}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-3 text-lg font-bold text-white">Variant별 이벤트</h2>
            <div className="max-h-[420px] overflow-auto space-y-2">
              {variantSummary.length === 0 ? (
                <p className="text-sm text-zinc-400">데이터가 없습니다.</p>
              ) : (
                variantSummary.map((row, idx) => (
                  <div key={`${row.eventName}-${row.variant}-${idx}`} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span className="text-sm text-zinc-200">{row.eventName} · {row.variant}</span>
                    <span className="text-sm font-bold text-sky-300">{row.cnt}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-bold text-white">최근 이벤트 로그</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-xs text-zinc-200">
              <thead className="text-zinc-400">
                <tr>
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">이벤트</th>
                  <th className="px-2 py-2">페이지</th>
                  <th className="px-2 py-2">Variant</th>
                  <th className="px-2 py-2">Session</th>
                  <th className="px-2 py-2">Params</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-2 py-2 whitespace-nowrap">{fmtTime(row.createdAt)}</td>
                    <td className="px-2 py-2">{row.eventName}</td>
                    <td className="px-2 py-2">{row.pagePath || '-'}</td>
                    <td className="px-2 py-2">{row.variant || 'N/A'}</td>
                    <td className="px-2 py-2">{row.sessionId ? `${row.sessionId}`.slice(-8) : '-'}</td>
                    <td className="px-2 py-2 max-w-[480px] truncate">{JSON.stringify(row.params || {})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminEvents = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/events');
  const [keyword, setKeyword] = useState(DEFAULT_KEYWORD);
  const [inputValue, setInputValue] = useState(DEFAULT_KEYWORD);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [activeProducts, setActiveProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeLoading, setActiveLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trending, setTrending] = useState([]);
  const [localFavs, setLocalFavs] = useState(() => loadLocalFavorites());
  const [serverFavs, setServerFavs] = useState([]);
  const [favOpen, setFavOpen] = useState(false);
  const [activeTitle, setActiveTitle] = useState('지금 인기 상품');
  const [sort, setSort] = useState('recommended');
  const [filters, setFilters] = useState({ rocketOnly: false, freeShipOnly: false });
  const [sessionId, setSessionId] = useState('');
  const [variant, setVariant] = useState('A');

  const track = (name, params = {}) => {
    sendTrackEvent(name, params, { sessionId, variant, pagePath: window.location.pathname });
  };

  const heroCopy = variant === 'B'
    ? {
      title: '지금 많이 보는 이유부터 확인하세요.',
      desc: '복잡한 검색보다 빠른 추천 흐름으로 후보를 줄여드립니다. 가격/후기를 바로 확인할 수 있어요.',
      cta: '지금 인기 이유 보기',
    }
    : {
      title: '검색보다 빠르게, 비교보다 쉽게.',
      desc: '목적, 가격대, 인기 흐름을 기준으로 후보를 먼저 좁혀드립니다. 클릭하면 쿠팡에서 최신 가격과 후기를 확인할 수 있습니다.',
      cta: '가격/후기 확인',
    };

  const refreshTrending = async () => {
    try {
      const data = await apiGet('/api/trending-keywords?rangeHours=24&limit=10');
      setTrending(data.items || []);
    } catch (e) {
      console.warn('[Trending] fetch failed:', e.message);
    }
  };

  const refreshFavorites = async () => {
    try {
      const data = await apiGet('/api/favorites');
      setServerFavs(data.items || []);
    } catch (e) {
      console.warn('[Favorites] fetch failed:', e.message);
    }
  };

  const ingestDisplayed = async (items) => {
    try {
      await apiPost('/api/ingestDisplayedProducts', { products: items });
    } catch (e) {
      console.warn('[Ingest] failed:', e.message);
    }
  };

  const fetchProductsByKeyword = async (searchKeyword, limit = DEFAULT_LIMIT) => {
    if (!searchKeyword?.trim()) return [];
    const data = await apiGet(`/api/coupang/products?keyword=${encodeURIComponent(searchKeyword.trim())}&limit=${limit}`);
    return data.products || [];
  };

  const loadFeatured = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b, c] = await Promise.all([
        fetchProductsByKeyword('노트북'),
        fetchProductsByKeyword('에어프라이어'),
        fetchProductsByKeyword('무선청소기'),
      ]);
      const merged = [...a.slice(0, 4), ...b.slice(0, 3), ...c.slice(0, 3)];
      setFeaturedProducts(merged);
      setActiveProducts(merged);
      setActiveTitle('지금 인기 상품');
      await ingestDisplayed(merged);
      await refreshTrending();
    } catch (err) {
      console.error('[App] featured load error', err);
      setError(err.message || '초기 추천을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadByKeyword = async (nextKeyword, title) => {
    setActiveLoading(true);
    setError(null);
    try {
      const items = await fetchProductsByKeyword(nextKeyword, 12);
      setKeyword(nextKeyword);
      setInputValue(nextKeyword);
      setActiveTitle(title);
      setActiveProducts(items);
      await ingestDisplayed(items);
      track('section_keyword_click', { keyword: nextKeyword, title });
    } catch (err) {
      setError(err.message || '상품을 불러오지 못했습니다.');
      setActiveProducts([]);
    } finally {
      setActiveLoading(false);
    }
  };

  const loadBestByCategory = async (categoryId, categoryName) => {
    setActiveLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/coupang/products/best?categoryId=${encodeURIComponent(categoryId)}&limit=20`);
      const items = data.products || [];
      setActiveTitle(`${categoryName} 베스트`);
      setActiveProducts(items);
      await ingestDisplayed(items);
      track('category_click', { categoryId, categoryName });
    } catch (err) {
      setError(err.message || '카테고리 베스트를 불러오지 못했습니다.');
      setActiveProducts([]);
    } finally {
      setActiveLoading(false);
    }
  };

  const toggleFavorite = async (product) => {
    const id = String(product.productId || '');
    if (!id) return;
    const nextLocal = isFav(localFavs, id)
      ? localFavs.filter((x) => String(x.productId) !== id)
      : [{ productId: id, productName: product.productName, productImage: product.productImage, productUrl: product.productUrl }, ...localFavs];
    setLocalFavs(nextLocal);
    saveLocalFavorites(nextLocal);

    try {
      await apiPost('/api/favorites', { action: 'toggle', product });
      await refreshFavorites();
      await ingestDisplayed([product]);
      track('favorite_toggle', { productId: id, active: !isFav(localFavs, id) });
    } catch (e) {
      console.warn('[Favorites] toggle failed:', e.message);
    }
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const k = inputValue.trim();
    if (!k) return;
    await loadByKeyword(k, `검색 결과: ${k}`);
    track('search_submit', { keyword: k });
  };

  useEffect(() => {
    const sid = getSessionId();
    const v = getVariant();
    setSessionId(sid);
    setVariant(v);
    refreshFavorites();
    const route = LANDING_ROUTES[window.location.pathname];
    if (route?.type === 'keyword') {
      loadByKeyword(route.keyword, route.title);
      document.title = `${route.title} | 쿠팡 선택가이드`;
    } else {
      loadFeatured();
      document.title = '쿠팡 선택가이드 | 추천형 구매 의사결정';
    }
    track('page_view', { path: window.location.pathname });
  }, []);

  useEffect(() => {
    const route = LANDING_ROUTES[window.location.pathname];
    if (route?.description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', route.description);
    }
  }, [activeTitle]);

  const visibleActiveProducts = useMemo(() => {
    let arr = [...activeProducts];
    if (filters.rocketOnly) arr = arr.filter((p) => p.isRocket === true || p.isRocket === 'true' || p.isRocket === 'Y');
    if (filters.freeShipOnly) arr = arr.filter((p) => p.isFreeShipping === true || p.isFreeShipping === 'true' || p.isFreeShipping === 'Y');
    if (sort === 'low') arr.sort((a, b) => toPrice(a) - toPrice(b));
    if (sort === 'high') arr.sort((a, b) => toPrice(b) - toPrice(a));
    return arr;
  }, [activeProducts, sort, filters]);

  const relatedProducts = useMemo(() => {
    const source = activeProducts.length > 0 ? activeProducts : featuredProducts;
    return source.slice(0, 6);
  }, [activeProducts, featuredProducts]);

  if (isAdminEvents) return <AdminEventsDashboard />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-6 md:pt-10">
        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 p-6 md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.28),transparent_60%)]" />
          <div className="relative z-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Badge tone="green">추천형 구매의사결정 서비스</Badge>
              <button
                type="button"
                onClick={() => setFavOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
              >
                찜/비교함 <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">{serverFavs.length}</span>
              </button>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              {heroCopy.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-200 md:text-base">
              {heroCopy.desc}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {USECASE_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    window.history.pushState({}, '', `/usecase/${item.id}`);
                    loadByKeyword(item.keyword, `${item.label} 추천`);
                    track('hero_usecase_click', { usecase: item.id });
                  }}
                  className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/20 hover:bg-white/15"
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', '/');
                  loadFeatured();
                  track('hero_refresh_click', { variant });
                }}
                className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-black text-zinc-900 hover:bg-emerald-300"
              >
                인기 추천 새로고침
              </button>
            </div>

            <form onSubmit={handleSearchSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="이미 사고 싶은 제품이 있다면 바로 검색 (예: 게이밍 노트북)"
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              />
              <button type="submit" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-zinc-900 hover:bg-zinc-200">
                {heroCopy.cta}
              </button>
            </form>
          </div>
        </header>

        <section className="mt-8">
          <SectionHeader title="빠른 랜딩 바로가기" subtitle="SEO 유입을 위한 목적/카테고리/가격대 랜딩입니다." />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {Object.entries(LANDING_ROUTES).map(([path, route]) => (
              <button
                key={path}
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', path);
                  loadByKeyword(route.keyword, route.title);
                  document.title = `${route.title} | 쿠팡 선택가이드`;
                  track('landing_route_click', { path, title: route.title });
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
              >
                <div className="text-sm font-bold text-white">{route.title}</div>
                <div className="mt-1 text-xs text-zinc-300">{path}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader
            title="지금 인기 상품"
            subtitle="초기 탐색 부담을 줄이기 위해 많이 찾는 상품군을 먼저 보여드립니다."
            actionLabel="인기 새로고침"
            onAction={loadFeatured}
          />
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">인기 상품을 불러오는 중...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {featuredProducts.slice(0, 10).map((p, i) => (
                <ProductCard key={`${p.productId}-${i}`} product={p} index={i} section="featured" fav={isFav(localFavs, p.productId)} onToggleFav={toggleFavorite} onTrack={track} />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12">
          <SectionHeader title="카테고리별 바로 진입" subtitle="무엇을 살지 정해졌다면 카테고리 베스트부터 빠르게 확인하세요." />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {CATEGORY_PRESETS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', `/category/${c.keyword.replaceAll(' ', '-').toLowerCase()}`);
                  loadBestByCategory(c.id, c.name);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-semibold text-white hover:border-emerald-300/40 hover:bg-white/10"
              >
                <div>{c.name}</div>
                <div className="mt-1 text-xs text-zinc-300">{c.keyword} 중심</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionHeader title="가격대별 추천" subtitle="예산이 먼저라면 가격 구간으로 바로 시작하세요." />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {PRICE_PRESETS.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                onClick={() => {
                  window.history.pushState({}, '', `/price/${bucket.id}`);
                  loadByKeyword(bucket.keyword, `${bucket.label} 추천`);
                  track('price_bucket_click', { bucket: bucket.id });
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-left hover:bg-white/10"
              >
                <Badge tone={bucket.tone}>{bucket.label}</Badge>
                <p className="mt-2 text-sm font-bold text-white">{bucket.keyword}</p>
                <p className="mt-1 text-xs text-zinc-300">클릭해서 추천 후보 보기</p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionHeader
            title={activeTitle}
            subtitle={`정렬/필터를 적용해 ${keyword ? `"${keyword}"` : '현재'} 기준으로 비교할 수 있습니다.`}
            actionLabel="추천 기준 초기화"
            onAction={() => {
              setSort('recommended');
              setFilters({ rocketOnly: false, freeShipOnly: false });
            }}
          />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white">
              <option value="recommended">추천순</option>
              <option value="low">최저가순</option>
              <option value="high">최고가순</option>
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white">
              <input type="checkbox" checked={filters.rocketOnly} onChange={(e) => setFilters((s) => ({ ...s, rocketOnly: e.target.checked }))} className="accent-emerald-400" />
              로켓만
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white">
              <input type="checkbox" checked={filters.freeShipOnly} onChange={(e) => setFilters((s) => ({ ...s, freeShipOnly: e.target.checked }))} className="accent-emerald-400" />
              무료배송만
            </label>
          </div>

          {activeLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">추천 목록을 불러오는 중...</div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
          ) : visibleActiveProducts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">조건에 맞는 상품이 없습니다. 다른 카테고리 또는 키워드를 시도해보세요.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleActiveProducts.map((p, i) => (
                <ProductCard
                  key={`${p.productId}-${i}`}
                  product={p}
                  index={i}
                  section="active-list"
                  fav={isFav(localFavs, p.productId)}
                  onToggleFav={toggleFavorite}
                  onTrack={track}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12">
          <SectionHeader title="관련 상품 계속 보기" subtitle="한 번의 클릭으로 끝나지 않도록 비슷한 후보를 이어서 추천합니다." />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {relatedProducts.map((p, i) => (
              <ProductCard key={`related-${p.productId}-${i}`} product={p} index={i} section="related" fav={isFav(localFavs, p.productId)} onToggleFav={toggleFavorite} onTrack={track} />
            ))}
          </div>
        </section>

        <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-lg font-bold text-white">많이 검색한 키워드 (24시간)</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {trending.length === 0 ? (
                <p className="text-sm text-zinc-300">아직 키워드 데이터가 충분하지 않습니다. 검색이 쌓이면 자동 반영됩니다.</p>
              ) : (
                trending.map((t) => (
                  <button
                    key={t.keyword}
                    type="button"
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/20 hover:bg-white/15"
                    onClick={() => {
                      loadByKeyword(t.keyword, `많이 찾은 키워드: ${t.keyword}`);
                      track('trending_keyword_click', { keyword: t.keyword, count: t.cnt });
                    }}
                  >
                    {t.keyword} ({t.cnt})
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="text-lg font-bold text-white">신뢰 및 안내</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              <li>추천은 가격/용도/탐색 흐름 기준으로 구성하며, 과장 수치는 사용하지 않습니다.</li>
              <li>일부 링크는 쿠팡 파트너스 제휴 링크이며 수수료가 발생할 수 있습니다.</li>
              <li>최신 가격과 리뷰는 이동 후 쿠팡 상세 페이지에서 확인해 주세요.</li>
            </ul>
          </div>
        </section>

        {favOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70" onClick={() => setFavOpen(false)} />
            <div className="absolute bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto border-l border-white/10 bg-zinc-950 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">찜/비교함</h3>
                <button type="button" onClick={() => setFavOpen(false)} className="text-sm text-zinc-300 hover:text-white">닫기</button>
              </div>
              <p className="mt-1 text-xs text-zinc-400">가격 비교 후보를 저장해두고 다시 확인할 수 있습니다.</p>

              <div className="mt-4 space-y-3">
                {serverFavs.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">아직 저장한 상품이 없습니다.</div>
                ) : (
                  serverFavs.map((f) => (
                    <div key={f.productId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="line-clamp-2 text-sm font-semibold text-white">{f.productName || '상품명 없음'}</div>
                      <div className="mt-1 text-xs text-zinc-300">
                        {f.latestPrice != null ? `${Number(f.latestPrice).toLocaleString()}원` : '가격 데이터 수집 중'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <a href={f.productUrl || '#'} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-900">
                          가격 보기 ↗
                        </a>
                        <button type="button" onClick={() => toggleFavorite(f)} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white">
                          삭제
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-zinc-950/95 p-2 md:hidden">
          <div className="mx-auto grid max-w-7xl grid-cols-4 gap-2">
            <button onClick={loadFeatured} className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white">인기</button>
            <button onClick={() => loadByKeyword('가성비 추천', '가성비 추천')} className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white">가성비</button>
            <button onClick={() => loadByKeyword('많이 본 상품', '많이 본 상품')} className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white">탐색</button>
            <button onClick={() => setFavOpen(true)} className="rounded-lg bg-emerald-400 py-2 text-xs font-black text-zinc-900">찜/비교</button>
          </div>
        </div>
      </div>
    </div>
  );
}
