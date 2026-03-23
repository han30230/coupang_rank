# Coupang Partners Product Explorer

쿠팡 파트너스 API로 **키워드 검색(최대 10개)** / **카테고리 베스트(최대 50개)** 상품을 조회하고,  
**인기 키워드 / 찜(즐겨찾기) / 가격 변동(찜한 상품만)** 기능을 제공하는 최소 기능 웹앱입니다.

## Requirements
- Node.js (권장: 18+)
- 쿠팡 파트너스 API Access/Secret Key

## Env
프로젝트 루트에 `.env`를 만들고 아래 값을 넣습니다.

```
COUPANG_ACCESS_KEY=...
COUPANG_SECRET_KEY=...
COUPANG_SUB_ID=
PORT=3025
```

## Run (dev)
```
npm install
cd client
npm install
cd ..
npm run dev
```

- Server: `http://localhost:3025`
- Client: 터미널에 출력된 Vite URL로 접속

## Notes
- `.env`는 `.gitignore`에 포함되어 커밋되지 않습니다.
- SQLite DB 파일은 `server/data.sqlite`로 생성됩니다(로컬 개발용).

