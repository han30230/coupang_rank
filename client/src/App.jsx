import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from './lib/api';
import { loadLocalFavorites, saveLocalFavorites, isFav } from './lib/favorites';

const DEFAULT_KEYWORD = '노트북';
const DEFAULT_SEARCH_LIMIT = 10;

// 카테고리 베스트용: API 문서 기준 (최대 50개)
const CATEGORIES = [
  { id: '1016', name: '가전디지털' },
  { id: '1001', name: '여성패션' },
  { id: '1002', name: '남성패션' },
  { id: '1010', name: '뷰티' },
  { id: '1011', name: '출산/유아동' },
  { id: '1012', name: '식품' },
  { id: '1013', name: '주방용품' },
  { id: '1014', name: '생활용품' },
  { id: '1015', name: '홈인테리어' },
  { id: '1017', name: '스포츠/레저' },
  { id: '1018', name: '자동차용품' },
  { id: '1019', name: '도서/음반/DVD' },
  { id: '1020', name: '완구/취미' },
  { id: '1021', name: '문구/오피스' },
  { id: '1024', name: '헬스/건강식품' },
  { id: '1025', name: '국내여행' },
  { id: '1026', name: '해외여행' },
  { id: '1029', name: '반려동물용품' },
  { id: '1030', name: '유아동패션' },
];

function Badge({ children, tone = 'gray' }) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20'
      : tone === 'red'
        ? 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20'
        : tone === 'blue'
          ? 'bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20'
          : 'bg-zinc-500/10 text-zinc-700 ring-1 ring-zinc-500/20';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function ProductCard({ product, fav, onToggleFav }) {
  const name = product.productName || '상품명 없음';
  const price = Number(product.productPrice) || 0;
  const priceStr = price > 0 ? price.toLocaleString() + '원' : '가격 없음';
  const imageUrl = product.productImage || '';
  const productUrl = product.productUrl || '#';
  const rocket = product.isRocket === true || product.isRocket === 'true' || product.isRocket === 'Y';
  const freeShip = product.isFreeShipping === true || product.isFreeShipping === 'true' || product.isFreeShipping === 'Y';

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square bg-zinc-100">
        {imageUrl ? (
          <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">이미지 없음</div>
        )}
        <button
          type="button"
          onClick={() => onToggleFav(product)}
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow ring-1 ring-black/5 hover:bg-white"
          aria-label={fav ? '찜 해제' : '찜하기'}
          title={fav ? '찜 해제' : '찜하기'}
        >
          <span className={`text-lg ${fav ? 'text-rose-600' : 'text-zinc-500'}`}>{fav ? '♥' : '♡'}</span>
        </button>
      </div>
      <div className="p-4">
        <div className="mb-2 flex flex-wrap gap-1">
          {rocket && <Badge tone="blue">로켓</Badge>}
          {freeShip && <Badge tone="green">무료배송</Badge>}
          {product.rank != null && <Badge>랭킹 {product.rank}</Badge>}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900">{name}</h3>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="text-lg font-semibold text-zinc-900">{priceStr}</div>
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            상품 보기 <span className="opacity-80">↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('search'); // 'search' | 'best'
  const [keyword, setKeyword] = useState(DEFAULT_KEYWORD);
  const [inputValue, setInputValue] = useState(DEFAULT_KEYWORD);
  const [categoryId, setCategoryId] = useState('1016');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('recommended'); // recommended|low|high
  const [filters, setFilters] = useState({ rocketOnly: false, freeShipOnly: false });
  const [trending, setTrending] = useState([]);
  const [localFavs, setLocalFavs] = useState(() => loadLocalFavorites());
  const [serverFavs, setServerFavs] = useState([]);
  const [favOpen, setFavOpen] = useState(false);

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
      // 조용히 실패 처리 (테스트 단계)
      console.warn('[Ingest] failed:', e.message);
    }
  };

  const toggleFavorite = async (product) => {
    const id = String(product.productId || '');
    if (!id) return;

    // 로컬 즉시 반영 (UX)
    const nextLocal = isFav(localFavs, id)
      ? localFavs.filter((x) => String(x.productId) !== id)
      : [{ productId: id, productName: product.productName, productImage: product.productImage, productUrl: product.productUrl }, ...localFavs];
    setLocalFavs(nextLocal);
    saveLocalFavorites(nextLocal);

    try {
      await apiPost('/api/favorites', { action: 'toggle', product });
      await refreshFavorites();
      // 찜한 직후 스냅샷 1회 저장 (추가 쿠팡 호출 없이 현재 price 사용)
      await ingestDisplayed([product]);
    } catch (e) {
      console.warn('[Favorites] toggle failed:', e.message);
    }
  };

  const fetchSearch = async (searchKeyword) => {
    if (!searchKeyword.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/coupang/products?keyword=${encodeURIComponent(searchKeyword.trim())}&limit=${DEFAULT_SEARCH_LIMIT}`);
      setProducts(data.products || []);
      refreshTrending();
    } catch (err) {
      console.error('[App] fetch error:', err);
      const isNetworkErr = err.message?.includes('fetch') || err.message?.includes('Failed') || err.name === 'TypeError';
      setError(
        isNetworkErr
          ? '백엔드 서버에 연결할 수 없습니다. 프로젝트 루트에서 "npm run dev"를 실행해 주세요. (서버: 3025, 클라이언트: 5173)'
          : err.message || '네트워크 오류가 발생했습니다. 서버가 실행 중인지 확인해 주세요.'
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBest = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/coupang/products/best?categoryId=${encodeURIComponent(categoryId)}&limit=50`);
      setProducts(data.products || []);
    } catch (err) {
      console.error('[App] fetch best error:', err);
      setError(err.message || '네트워크 오류가 발생했습니다. 서버가 실행 중인지 확인해 주세요.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSearch(DEFAULT_KEYWORD);
    refreshTrending();
    refreshFavorites();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const k = inputValue.trim();
    if (k) {
      setKeyword(k);
      fetchSearch(k);
    }
  };

  const categoryName = CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId;

  const visibleProducts = useMemo(() => {
    let arr = [...products];
    if (filters.rocketOnly) arr = arr.filter((p) => p.isRocket === true || p.isRocket === 'true' || p.isRocket === 'Y');
    if (filters.freeShipOnly) arr = arr.filter((p) => p.isFreeShipping === true || p.isFreeShipping === 'true' || p.isFreeShipping === 'Y');
    if (sort === 'low') arr.sort((a, b) => (Number(a.productPrice) || 0) - (Number(b.productPrice) || 0));
    if (sort === 'high') arr.sort((a, b) => (Number(b.productPrice) || 0) - (Number(a.productPrice) || 0));
    return arr;
  }, [products, filters, sort]);

  // 표시 결과를 서버에 전달 → 찜한 상품만 가격 스냅샷 기록
  useEffect(() => {
    if (visibleProducts.length > 0) ingestDisplayed(visibleProducts);
  }, [visibleProducts]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="relative overflow-hidden rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_60%)]" />
          <div className="relative">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10">
                  실시간 테스트 · 제휴 링크 포함
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                  쿠팡 파트너스 상품 탐색기
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-white/70">
                  키워드로 빠르게 10개를 확인하거나, 카테고리 베스트로 최대 50개까지 한 번에 살펴보세요.
                  게시글 작성 시 “파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있음” 문구 표기를 권장합니다.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFavOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-100"
                >
                  찜 목록 <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-bold text-white">{serverFavs.length}</span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-white/10 ${mode === 'search' ? 'bg-white text-zinc-900' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    onClick={() => setMode('search')}
                  >
                    키워드 검색 (최대 10)
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-white/10 ${mode === 'best' ? 'bg-white text-zinc-900' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    onClick={() => setMode('best')}
                  >
                    카테고리 베스트 (최대 50)
                  </button>
                </div>

                {mode === 'search' ? (
                  <form onSubmit={handleSearchSubmit} className="mt-4 flex gap-2">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="검색어 입력 (예: 노트북, 키보드)"
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/50 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-zinc-900 hover:bg-emerald-300 disabled:opacity-60"
                      disabled={loading}
                    >
                      {loading ? '검색 중...' : '검색'}
                    </button>
                  </form>
                ) : (
                  <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 md:w-auto"
                      disabled={loading}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id} className="text-zinc-900">
                          {c.name} ({c.id})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={fetchBest}
                      className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-zinc-900 hover:bg-emerald-300 disabled:opacity-60"
                      disabled={loading}
                    >
                      {loading ? '불러오는 중...' : '베스트 50개 불러오기'}
                    </button>
                    <div className="text-xs text-white/60 md:ml-auto">
                      현재 선택: <span className="font-semibold text-white">{categoryName}</span>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-white/70">정렬</div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10"
                  >
                    <option value="recommended" className="text-zinc-900">추천</option>
                    <option value="low" className="text-zinc-900">최저가</option>
                    <option value="high" className="text-zinc-900">최고가</option>
                  </select>

                  <label className="ml-2 inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10">
                    <input
                      type="checkbox"
                      checked={filters.rocketOnly}
                      onChange={(e) => setFilters((s) => ({ ...s, rocketOnly: e.target.checked }))}
                      className="h-4 w-4 accent-emerald-400"
                    />
                    로켓만
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10">
                    <input
                      type="checkbox"
                      checked={filters.freeShipOnly}
                      onChange={(e) => setFilters((s) => ({ ...s, freeShipOnly: e.target.checked }))}
                      className="h-4 w-4 accent-emerald-400"
                    />
                    무료배송만
                  </label>
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white">인기 키워드 (24h)</div>
                  <button
                    type="button"
                    onClick={refreshTrending}
                    className="text-xs font-semibold text-white/70 hover:text-white"
                  >
                    새로고침
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trending.length === 0 ? (
                    <div className="text-sm text-white/60">검색을 몇 번 해보면 여기에 쌓입니다.</div>
                  ) : (
                    trending.map((t) => (
                      <button
                        key={t.keyword}
                        type="button"
                        onClick={() => {
                          setMode('search');
                          setInputValue(t.keyword);
                          setKeyword(t.keyword);
                          fetchSearch(t.keyword);
                        }}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                        title={`검색 ${t.cnt}회`}
                      >
                        {t.keyword} <span className="opacity-70">({t.cnt})</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          {loading && <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70 ring-1 ring-white/10">상품 목록을 불러오는 중...</div>}
          {error && !loading && (
            <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/20">{error}</div>
          )}

          {!loading && !error && visibleProducts.length === 0 && (
            <div className="rounded-2xl bg-white/5 p-6 text-sm text-white/70 ring-1 ring-white/10">
              {mode === 'search'
                ? '검색 결과가 없습니다. 다른 검색어로 시도해 보세요.'
                : '카테고리를 선택하고 “베스트 50개 불러오기”를 눌러 주세요.'}
            </div>
          )}

          {!loading && !error && visibleProducts.length > 0 && (
            <>
              <div className="mb-4 flex items-end justify-between">
                <div className="text-sm text-white/70">
                  {mode === 'search' ? (
                    <>검색어 <span className="font-semibold text-white">“{keyword}”</span> 결과</>
                  ) : (
                    <>카테고리 <span className="font-semibold text-white">“{categoryName}”</span> 베스트</>
                  )}
                  <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10">
                    {visibleProducts.length}개
                  </span>
                </div>
                <div className="text-xs text-white/50">정렬/필터는 현재 목록 내에서만 적용됩니다.</div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visibleProducts.map((p) => (
                  <ProductCard
                    key={p.productId || p.productUrl || Math.random()}
                    product={p}
                    fav={isFav(localFavs, p.productId)}
                    onToggleFav={toggleFavorite}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Favorites Drawer */}
        {favOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60" onClick={() => setFavOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-zinc-950 p-5 ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-white">내 찜</div>
                <button type="button" onClick={() => setFavOpen(false)} className="text-white/70 hover:text-white">
                  닫기 ✕
                </button>
              </div>
              <div className="mt-1 text-xs text-white/60">찜한 상품만 가격 스냅샷을 저장해 변동을 보여줍니다.</div>

              <div className="mt-4 space-y-3">
                {serverFavs.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70 ring-1 ring-white/10">
                    아직 찜한 상품이 없습니다. 카드 우측 상단의 ♥를 눌러 추가해 보세요.
                  </div>
                ) : (
                  serverFavs.map((f) => (
                    <div key={f.productId} className="flex gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                      <div className="h-16 w-16 overflow-hidden rounded-xl bg-zinc-900">
                        {f.productImage ? (
                          <img src={f.productImage} alt={f.productName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-white/50">No img</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold text-white">{f.productName || '상품명 없음'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                          {f.latestPrice != null ? (
                            <span className="font-semibold text-white">{Number(f.latestPrice).toLocaleString()}원</span>
                          ) : (
                            <span>가격 데이터 없음</span>
                          )}
                          {f.direction === 'down' && <Badge tone="green">하락</Badge>}
                          {f.direction === 'up' && <Badge tone="red">상승</Badge>}
                          {f.direction === 'same' && <Badge>변동없음</Badge>}
                          {f.direction === 'unknown' && <Badge>기록중</Badge>}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <a
                            href={f.productUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-100"
                          >
                            열기 ↗
                          </a>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(f)}
                            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                          >
                            찜 해제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
