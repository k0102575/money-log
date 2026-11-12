# Money Log

개인용 계좌·보유 상품 기록과 상담용 Markdown 출력 웹 앱.

React Router Framework Mode + TypeScript + shadcn/ui + Tailwind CSS, Cloudflare Workers + D1(SQL). UI는 shadcn/ui의 sidebar-07 관리 화면 구성을 바탕으로 필요한 계좌·보고서 메뉴만 구성했습니다. 라이트·다크·시스템 테마를 지원합니다.

## 현재 기능

- 계좌 수 제한 없는 등록·조회·수정·보관. 하나·신한·CMA·ISA·IRP·연금저축·적금·청약 등 구분.
- 기준일·출처·정확도가 있는 잔액, 초기 누적 납입/인출 및 선택적인 계좌 전체 평가액.
- 투자 상품명·보유 수량·확인 이력. IRP에서만 위험/안전 구분.
- 계좌 정보 수정 충돌 감지와 금액/수량 정정 이력. 금액/상품이 있는 계좌는 유형·시작일 변경 제한.
- 기준일별 MD 미리보기 → 내용 고정 → 저장·다운로드. 저장한 보고서는 이후 입력 변경과 무관하게 보존.
- 비밀번호 로그인, 기기별 7일 세션, 로그인 시도 제한, 로그아웃, 모든 데이터 경로 인증.

상세 수입·지출·이체 원장, 부채·목표·미확인 사항 관리, 시세 조회·매매 원장은 포함하지 않습니다. 전체 순자산을 계산하지 않습니다. 상품 수량 변경을 거래로 생성하지 않으며 초기 누적 납입은 현금 잔액이 아닙니다.

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다. nvm을 쓴다면 `nvm use`로 맞춥니다.

```sh
npm ci
npm run password:setup
npm run db:migrate
npm run dev
```

터미널에 표시되는 로컬 주소로 접속합니다. 비밀번호 설정 명령은 입력을 표시하지 않으며 해시를 Git에서 제외된 `.dev.vars`에 저장합니다. 9자 이상 비밀번호를 사용하세요. 로컬 비밀번호 변경은 `npm run password:setup -- --replace` 후 개발 서버를 재시작합니다. 기본 로그인 비밀번호나 인증 우회 경로는 없습니다.

시작 시 실제 계좌·금액을 자동 입력하지 않습니다. UI에서 계좌와 기록을 직접 추가하세요. `.dev.vars`, `.wrangler`의 로컬 DB, 백업·보고서는 Git에서 제외됩니다. 실제 금융 데이터로 개발·테스트하지 마세요.

```sh
npm run typecheck
npm test
npm run build
# 위 검증을 모두 실행
npm run check
```

테스트는 메모리 SQLite에 실제 마이그레이션을 적용하고 가상 데이터만 사용합니다. 개발 서버가 실행 중인 폐기 가능한 로컬 환경에서 `MONEY_LOG_TEST_PASSWORD`를 설정한 뒤 `npm run test:http`로 HTTP 통합 검증도 할 수 있습니다. 이 검증은 가상 계좌 8개와 보고서를 추가하므로 실제 입력을 시작한 DB에서 실행하지 마세요. `tests/`의 DB 어댑터는 애플리케이션의 D1 인터페이스를 검증하기 위한 것입니다. 로컬 Worker 검증은 별도로 수행합니다.

## Cloudflare 배포 준비

계정 연결과 운영 DB는 저장소에 미리 만들지 않습니다. 로컬과 운영 설정은 분리돼 있습니다.

1. `npx wrangler login`으로 Cloudflare 계정을 연결합니다.
2. `npx wrangler d1 create money-log-production`으로 운영 D1을 만듭니다.
3. `wrangler.production.example.jsonc`를 `wrangler.production.jsonc`로 복사하고 실제 D1 ID와 서비스 주소(`APP_ORIGIN`)를 입력합니다. 운영 설정은 Git에서 제외됩니다.
4. `npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc`로 운영 스키마를 적용합니다. 기존 DB가 있다면 먼저 백업합니다.
5. `npm run password:setup -- --remote`로 운영 비밀번호와 인증 버전을 Secrets에 저장합니다. 재실행하면 기존 세션 전체가 무효화됩니다. 두 secret 명령 중 실패하면 배포하지 말고 다시 실행해 완료하세요.
6. `npm run deploy`로 검증·운영 빌드·배포합니다. 운영 설정이 없거나 예시 값 그대로면 실행을 중단합니다.

브라우저 주소와 APP_ORIGIN은 정확히 일치해야 합니다(프로토콜·호스트 포함). 별도 도메인을 쓰면 APP_ORIGIN을 바꿉니다. Cloudflare 계정 분실·비밀번호 복구는 앱의 기능 밖이며, 앱 비밀번호는 소유자가 위 명령으로 교체합니다.

Workers Free의 CPU 한도에서 비밀번호 검증이 충분한지 배포 후 확인하세요. PBKDF2-SHA256 100,000회는 Workers 지원 범위에 맞춘 구현이며, 앱에 사용하는 긴 비밀번호와 로그인 제한을 함께 적용합니다. 플랜 CPU 한도에 걸린다면 인증 비용을 낮추지 말고 실행 플랜/인증 방식을 조정합니다.

### Workers Builds / GitHub

GitHub Actions 없이 Cloudflare의 Git 연동으로 자동 배포할 수 있습니다. 운영 설정에는 Secret을 넣지 않지만 실제 리소스 연결은 관리자가 설정합니다.

- Cloudflare Workers Builds에서 이 저장소와 `main` 브랜치를 연결합니다.
- 빌드 환경변수 `MONEY_LOG_PRODUCTION=1`을 설정합니다.
- Git에 없는 운영 설정은 빌드 환경에서 준비해야 합니다. Workers Builds의 환경변수 `MONEY_LOG_D1_ID`, `MONEY_LOG_ORIGIN`을 등록하고 빌드 명령을 `node scripts/production-config.mjs && npm run check`로 지정합니다.
- 배포 명령은 `npx wrangler deploy --config build/server/wrangler.json`입니다.
- `PASSWORD_HASH`, `AUTH_VERSION`은 런타임 Secrets에 유지합니다. 빌드 환경변수로 복제하지 않습니다.
- 운영 마이그레이션은 검토·백업 후 별도로 적용합니다. 앱 배포 시 DB를 초기화하거나 파괴적 마이그레이션을 자동 실행하지 않습니다.
- 개발/미리보기 배포에는 **별도 개발 D1**과 별도 Secrets를 연결하세요. 초기에는 main 이외의 자동 배포를 비활성화해도 됩니다. 운영 DB를 미리보기에서 공유하지 마세요.

## 백업과 복원

운영 변경 전 SQL을 내보내고 Git 밖에 보관합니다. `backups/`도 ignore 대상입니다.

```sh
mkdir -p backups
npx wrangler d1 export DB --remote --config wrangler.production.jsonc --output backups/money-log.sql
```

복원 연습은 새 개발 DB에만 수행합니다. 별도 개발 설정의 D1을 생성한 뒤 아래처럼 SQL을 실행하고 UI에서 계좌·보고서를 확인합니다. 이미 데이터가 있는 DB에 덮어쓰는 명령이 아닙니다.

```sh
npx wrangler d1 execute DB --remote --config wrangler.restore.jsonc --file backups/money-log.sql
```

Cloudflare D1 Time Travel도 복구 수단으로 사용할 수 있으며 보존 기간은 플랜을 확인합니다. MD 파일은 전체 DB 백업이 아닙니다. 세션은 백업에 포함될 수 있으므로 복원 후 AUTH_VERSION을 바꿔 기존 로그인을 무효화하세요.

## 설계

[1단계 설계](finance-phase-1-design.md)가 최신 결정이며 [초기 인수인계](finance-project-handoff.md)보다 우선합니다. 개인정보·원본 명세서·인증정보를 Git에 커밋하지 않습니다.

카드 명세서의 후속 범위와 미결정 사항은 [카드 명세서 설계 초안](finance-card-statement-design.md)에 정리했습니다.
