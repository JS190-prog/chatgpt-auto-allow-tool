# ChatGPT Auto Allow Tool

[English](README.en.md)

[![Validate](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml/badge.svg)](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml)

ChatGPT 도구 사용 권한 카드에 표시되는 한국어/영어 허용 버튼을 자동으로 눌러주는 작은 Chrome 확장프로그램입니다.

이 프로젝트는 OpenAI와 관련 없는 비공식 도구입니다.

자동 클릭 대상 예시는 다음과 같습니다.

- `허용하기`
- `Allow`
- `Approve`
- `승인`
- `사용 허용`

## 중요 안전 안내

이 확장프로그램은 사용자가 한 번 더 클릭하지 않아도 ChatGPT 도구 사용을 승인할 수 있습니다. ChatGPT가 어떤 도구를 호출할 수 있는지 이해한 상태에서만 사용하세요.

더 안전하게 사용하려면 확장프로그램 옵션에서 `허용할 도구 이름`을 설정해 특정 도구만 자동 승인되도록 제한하세요.

## 설치 방법

1. 이 저장소를 다운로드하거나 clone합니다.
2. Chrome에서 확장 프로그램 페이지를 엽니다: `chrome://extensions`
3. 오른쪽 위 `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드`를 클릭합니다.
5. 이 저장소 폴더를 선택합니다.
6. 이미 열려 있는 ChatGPT 탭을 새로고침합니다.

## 사용 방법

툴바의 확장프로그램 아이콘을 클릭하면 자동 허용 기능을 빠르게 켜거나 끌 수 있습니다.

자세한 설정은 Chrome 확장프로그램 상세 페이지에서 `확장 프로그램 옵션`을 열어 변경할 수 있습니다.

- `자동 허용 사용`: 자동 클릭 기능 켜기/끄기
- `클릭 지연 시간(ms)`: 허용 버튼이 보인 뒤 클릭하기까지 기다릴 시간
- `허용할 도구 이름`: 쉼표로 구분한 허용 목록입니다. 비워두면 조건에 맞는 모든 권한 카드에서 작동합니다.
- `자동 클릭 제외 키워드`: 쉼표로 구분한 제외 목록입니다. 비워두면 키워드 차단을 사용하지 않습니다.

## 작동 방식

콘텐츠 스크립트는 다음 ChatGPT 페이지에서만 실행됩니다.

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

확장프로그램은 화면에 보이는 버튼을 검사하고, 가까운 상위 영역에 ChatGPT 권한 카드가 있는지 확인합니다. 조건에 맞는 허용 버튼을 찾으면 포인터/마우스 이벤트를 먼저 발생시킨 뒤 `button.click()`을 호출합니다.

버전 `0.2.0`부터 기본 제외 키워드는 비워져 있습니다. 이전 방식은 `This will cancel...` 같은 설명 문구에 포함된 `cancel` 때문에 실제 허용 카드가 차단될 수 있었습니다.

## 제한 사항

이 확장프로그램은 웹페이지 DOM 안에 있는 버튼만 클릭할 수 있습니다. 다음 항목은 클릭할 수 없습니다.

- Chrome 네이티브 권한 팝업
- 운영체제 대화상자
- 확장프로그램 설치 확인창
- 선언된 ChatGPT 호스트 권한 밖의 페이지

ChatGPT UI가 바뀌면 버튼 감지 로직 업데이트가 필요할 수 있습니다.

## 개발

로컬 검증:

```bash
npm run check
```

릴리스 ZIP 생성:

```bash
npm run package
```

ZIP 파일은 `dist/` 폴더에 생성됩니다.

`manifest.json`과 `package.json`의 버전은 항상 같아야 합니다. `release-version.json`은 이미 공개된 최저 허용 버전을 기록하며, 패키징은 이 값보다 낮은 버전을 자동으로 거부합니다. 새 버전을 공개한 뒤에만 `minimumPublishedVersion`을 그 버전으로 올립니다.

## 저장소 구성

- `manifest.json`: Chrome 확장프로그램 매니페스트
- `content.js`: ChatGPT 권한 카드 감지와 자동 클릭 로직
- `options.html`, `options.css`, `options.js`: 옵션 페이지
- `popup.html`, `popup.css`, `popup.js`: 툴바 팝업과 빠른 토글
- `icons/`: 확장프로그램 아이콘
- `scripts/validate-manifest.js`: 간단한 매니페스트 검증 스크립트
- `scripts/validate-version.js`: 버전 일치 및 공개 버전 하향 방지 검사
- `scripts/package-extension.js`: 릴리스 ZIP 패키징 스크립트
- `.github/workflows/validate.yml`: GitHub Actions 검증 워크플로

## 문제 해결

자동 클릭이 동작하지 않으면 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)를 확인하세요.

## 변경 이력

[CHANGELOG.md](CHANGELOG.md)를 확인하세요.

## 개인정보

이 확장프로그램은 사용자 데이터를 수집하거나 전송하지 않습니다. 자세한 내용은 [PRIVACY.md](PRIVACY.md)를 확인하세요.

## 보안

[SECURITY.md](SECURITY.md)를 확인하세요.

## 라이선스

MIT. [LICENSE](LICENSE)를 확인하세요.
