# Backlog

## 2026-11-01 — 배포 자동화가 필요해지면

0.1.0은 마켓플레이스 웹 업로드로 냈다. PAT을 쓰지 않았으므로
2026-12-01 글로벌 PAT 폐지의 영향을 받지 않는다.

CI에서 자동 배포가 필요해지면 그때 인증을 고른다.
  - 조직 범위 PAT: 가장 싸지만 vsce가 "All accessible organizations"를
    요구한다는 문서와 어긋나므로 실제로 되는지 시험이 필요하다
  - Entra ID + 관리 ID + GitHub Actions 페더레이티드 자격 증명:
    publisher가 개인 소유라 --azure-credential이 publish 단계에서
    실패한 사례가 있다 (microsoft/vscode-vsce#1023)
    페더레이티드 자격 증명은 환경 기준으로 잡는다

Open VSX는 이 폐지와 무관하며 자체 토큰을 쓴다.

## 개발 의존성 업그레이드 (0.1.0 배포 후)

npm audit --omit=dev 는 0건이다. 배포물에는 영향이 없다.
전부 vitest/vite/esbuild 개발 도구 체인이고, vitest Critical은
UI 서버가 열려 있을 때의 문제인데 이 레포는 vitest run만 쓴다.

해소하려면 vitest 2 → 4 메이저 업그레이드가 필요하다.
90건의 테스트가 걸려 있으므로 배포 직후 별도 작업으로 한다.
배포 직전에 테스트 러너를 바꾸면, 깨졌을 때 원인이 배포 준비인지
러너인지 구분할 수 없다.

착수 시: happy-dom 통합 테스트 3건과 타입 테스트가 먼저 깨질 자리다.
