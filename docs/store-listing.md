# Chrome 웹 스토어 등록정보 초안 (0.5.17)

대시보드 입력란 순서대로 정리했다. 모든 기능·저장·권한 설명은 `manifest.json`, `settings.js`, `content.js`, `background.js`, `popup.js`, `options.js`를 직접 대조해 작성했다.

## 0. 제출 전 필수 조치

1. **`PRIVACY.md` 보완.** 아래 "6. 개인정보처리방침 보완 항목"을 반영했다. 방침이 동작과 다르면 사용자 데이터 정책 위반으로 반려될 수 있으므로, 기능을 바꿀 때마다 함께 갱신한다.
2. **언어 결정.** 패키지에 `_locales`가 없어 스토어 설명은 기본 언어 하나만 등록된다. 한국어 사용자가 주 대상이면 아래 한국어 설명을 쓰고, 영어 설명은 같은 칸 하단에 덧붙이거나 생략한다. 언어별로 나눠 등록하려면 `_locales`를 추가하는 별도 작업이 필요하다.

## 1. 상품 정보

**이름 (manifest `name`, 75자 이하):** ChatGPT Auto Allow Tool

**요약 (manifest `description`, 132자 이하):** Automatically allows ChatGPT tools and optionally continues completed responses.
요약은 manifest에서 그대로 가져오므로 바꾸려면 manifest를 수정해 다시 패키징해야 한다.

**카테고리:** 생산성 (Productivity)

**상세 설명 (KO):**

> ChatGPT가 도구(플러그인, 연결된 앱 등)를 사용하려 할 때 나타나는 권한 카드의 허용 버튼을 대신 눌러 주는 비공식 확장프로그램입니다. OpenAI와 관련이 없습니다.
>
> ■ 자동 허용
> - 권한 카드의 `허용하기`, `한 번만 허용`, `사용 허용`, `승인`, `Allow`, `Approve` 버튼을 자동으로 누릅니다.
> - `항상 허용`, `모두 허용`처럼 범위가 넓은 버튼과 `허용하지 않음`, `거절`, `취소`처럼 부정·거부 버튼은 누르지 않습니다.
> - `허용할 도구 이름`(쉼표 구분, 도구 이름 전체 일치)을 지정하면 그 도구만 자동 승인합니다. `자동 클릭 제외 키워드`가 들어간 카드는 건너뜁니다.
> - 클릭 지연 시간을 0~10,000ms로 조절할 수 있고, 툴바 팝업에서 바로 켜고 끌 수 있습니다.
>
> ■ 플러그인 도구 새로 고침
> - 팝업에서 실행하면 설치된 플러그인의 `도구 새로 고침`을 차례로 누릅니다. 실행 중에는 현재 탭이 ChatGPT 플러그인 설정 화면으로 이동합니다.
> - 옵션에서 주기(시간)를 지정하면 ChatGPT 탭이 백그라운드에 있을 때만 자동 실행합니다. 기본값은 꺼짐입니다.
>
> ■ 자동 이어서 진행 (선택, 기본값 꺼짐)
> - 응답이 끝나면 지정한 문구(기본값 `이어서 진행`)를 입력하고 보내기를 누릅니다.
> - 직접 보낸 메시지 하나당 최대 횟수(기본 1회, 1~100회)를 넘지 않으며, 입력창에 작성 중인 글이 있으면 덮어쓰지 않습니다.
> - 팝업에서 현재 탭만 따로 켜거나 끌 수 있습니다.
>
> ■ 안전 안내
> 이 확장프로그램은 추가 확인 없이 ChatGPT의 도구 사용을 승인합니다. ChatGPT가 호출할 수 있는 도구를 이해한 상태에서만 사용하고, `허용할 도구 이름`으로 자동 승인 범위를 제한하는 것을 권장합니다.
>
> ■ 개인정보
> 사용자 데이터를 수집·판매·공유하지 않으며 개발자 서버로 아무것도 전송하지 않습니다. 설정은 Chrome 저장소에 보관되고, Chrome 동기화를 켠 경우 같은 계정의 다른 Chrome과 동기화됩니다. 동작 범위는 chatgpt.com과 chat.openai.com뿐입니다.
>
> 소스 코드: https://github.com/JS190-prog/chatgpt-auto-allow-tool

**상세 설명 (EN, 필요 시 위 설명 하단에 덧붙임):**

> Unofficial extension, not affiliated with OpenAI. Clicks the allow button on ChatGPT tool-permission cards for you.
>
> - Auto-clicks allow/approve buttons (e.g. "Allow", "Approve", `허용하기`, `한 번만 허용`). Never clicks broad buttons such as "Always allow" / "Allow all", or deny/cancel buttons.
> - Optional allow-list of full tool names and deny-list keywords; click delay 0-10,000 ms; on/off from the toolbar popup.
> - Plugin tool refresh: presses "Refresh tools" for each installed plugin. The current tab navigates to the ChatGPT plugin settings page while it runs. An optional schedule runs only while the ChatGPT tab is in the background (off by default).
> - Optional auto-continue (off by default): sends a phrase (default `이어서 진행`) after a response finishes, at most 1-100 times per manual message, never overwriting a draft.
>
> Safety: this extension approves ChatGPT tool use without an extra click. Restrict it with the tool allow-list.
>
> Privacy: nothing is collected, sold, shared or sent to the developer. Settings are kept in Chrome storage and sync to your other Chrome browsers if Chrome Sync is on. Runs only on chatgpt.com and chat.openai.com.

## 2. 그래픽 자료 (직접 준비)

| 항목 | 규격 | 필수 | 권장 내용 |
|---|---|---|---|
| 스토어 아이콘 | 128x128 PNG | 필수 | `icons/icon128.png` |
| 스크린샷 | 1280x800 또는 640x400, 1~5장 | 1장 이상 필수 | ① 팝업 ② 옵션(허용 목록·제외 키워드) ③ 권한 카드 자동 승인 ④ 플러그인 새로고침 완료 알림 ⑤ 자동 이어서 진행 상태 |
| 작은 프로모션 타일 | 440x280 | 필수 | 아이콘 + 짧은 문구 |

스크린샷에 개인 대화 내용, 계정 이메일, 플러그인 URL이 보이지 않게 한다.

## 3. 개인정보 보호 탭

**단일 목적 설명:**
ChatGPT 웹사이트에서 도구 사용 승인과 도구 관리(권한 카드 자동 허용, 설치된 플러그인 도구 새로 고침, 응답 후 자동 이어서 진행)를 사용자가 정한 조건대로 자동화하는 것.

**권한 사유:**

| 권한 | 입력할 사유 |
|---|---|
| `storage` | 사용자 설정(자동 허용 여부, 클릭 지연, 허용·제외 목록, 새로고침 주기, 자동 이어서 진행 설정), 탭별 임시 설정, 새로고침 진행 상태, 자동화 오류 진단 로그를 Chrome 저장소에 보관하는 데 사용합니다. 개발자나 제3자에게 전송하지 않습니다. |
| 호스트 권한 `https://chatgpt.com/*`, `https://chat.openai.com/*` | 확장프로그램의 유일한 대상인 ChatGPT 페이지에서 권한 카드와 허용 버튼, 플러그인 설정 화면을 찾아 클릭하려면 콘텐츠 스크립트로 페이지에 접근해야 합니다. 플러그인 새로고침을 시작할 때 현재 ChatGPT 탭을 플러그인 설정 화면으로 이동하는 데에도 사용합니다. 다른 사이트에는 접근하지 않습니다. |

**원격 코드 사용:** 아니요. 모든 코드는 패키지에 포함돼 있다(코드 검색 결과 `eval`, `new Function`, 외부 스크립트 로드, ChatGPT 외 URL 없음).

**데이터 사용 공개:**
- 수집 항목 체크박스: 모두 비워 둔다. 데이터는 사용자 기기 안에서만 처리되고 개발자 서버로 전송되지 않는다. 설정이 동기화되는 경로는 사용자가 켠 Chrome 동기화뿐이다.
- 다만 콘텐츠 스크립트가 ChatGPT 페이지의 권한 카드 문구와 플러그인 이름을 읽고, 플러그인 이름과 오류 문구를 진단 로그에 저장한다. 심사에서 "웹사이트 콘텐츠" 처리 여부를 물으면, 승인 판단을 위해 기기에서만 읽고 전송하지 않는다고 답한다.
- 아래 세 인증은 모두 체크한다: 승인된 용도 외 제3자 판매·전송 없음 / 단일 목적과 무관한 사용·전송 없음 / 신용도 판단·대출 목적 사용 없음.

**개인정보처리방침 URL:** https://github.com/JS190-prog/chatgpt-auto-allow-tool/blob/master/PRIVACY.md

## 4. 배포 설정

- 공개 범위: 처음에는 "비공개(링크가 있는 사용자)"로 올려 실제 설치 동작을 확인한 뒤 "공개"로 바꾸는 방법을 권장한다.
- 지역: 전체 또는 대한민국.
- 공개가 확정되면 `release-version.json`의 `minimumPublishedVersion`을 `0.5.17`로 올린다.

## 5. 반려 위험과 대응

| 위험 | 근거 | 대응 |
|---|---|---|
| 개인정보 방침 불일치 | 이전 `PRIVACY.md`에 Chrome 동기화, 진단 로그, 새로고침 주기, 탭 이동이 빠져 있었다 | 6번 항목 반영 완료. 기능 변경 시 함께 갱신 |
| 단일 목적 | 기능이 세 가지(자동 허용, 플러그인 새로고침, 자동 이어서 진행)라 목적이 여러 개로 보일 수 있다 | 단일 목적을 "ChatGPT 도구 사용·관리 자동화"로 묶어 설명. 반려되면 자동 이어서 진행을 분리하는 방안 검토 |
| 상표 | 이름이 `ChatGPT`로 시작해 OpenAI 공식 제품으로 오인될 수 있다 | 설명 첫 줄에 비공식 명시. 반려되면 `Auto Allow Tool for ChatGPT`로 변경 |
| 보안 민감 기능 | 사용자 확인 단계를 자동으로 통과시킨다 | 넓은 범위 버튼 제외, 허용 목록, 기본값 끔(자동 이어서 진행·자동 새로고침)을 설명에 명시 |

## 6. 개인정보처리방침 보완 항목

`PRIVACY.md`에 다음을 추가하거나 고친다.

- **저장 위치:** 설정은 `chrome.storage.sync`에 저장되며 Chrome 동기화를 켠 경우 같은 Google 계정의 다른 Chrome과 동기화된다. 진단 로그와 마지막 자동 새로고침 시각은 `chrome.storage.local`, 탭별 임시 설정과 새로고침 진행 요청은 `chrome.storage.session`에 저장된다.
- **추가 저장 항목:** 플러그인 자동 새로고침 주기, 마지막 자동 새로고침 시각.
- **진단 로그:** 플러그인 새로고침과 자동 이어서 진행이 실패하면 시각, 확장 버전, 기능, 플러그인 이름(최대 160자), 단계, 오류 코드와 문구(최대 600자, URL과 토큰 형태 문자열은 가려짐), 경과 시간, 클릭·건너뜀 횟수를 기기에만 최대 100건 저장한다. 프롬프트와 응답 내용은 저장하지 않는다. 사용자는 옵션 페이지에서 로그를 보고 복사할 수 있다.
- **탭 이동:** 플러그인 새로고침은 현재 ChatGPT 탭을 `https://chatgpt.com/settings/plugins-settings`로 이동시킨다. 확장프로그램 자체의 외부 네트워크 요청은 없다.
