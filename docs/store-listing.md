# Chrome 웹 스토어 등록정보 초안 (0.5.18)

대시보드 입력란 순서대로 정리했다. 모든 기능·저장·권한 설명은 `manifest.json`, `settings.js`, `content.js`, `background.js`, `popup.js`, `options.js`를 직접 대조해 작성했고, 정책 판단은 [Chrome 웹 스토어 프로그램 정책](https://developer.chrome.com/docs/webstore/program-policies/policies)과 [사용자 데이터 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)를 근거로 했다.

## 0. 제출 전 확인

1. **제출 패키지는 0.5.18 이상.** 0.5.18에서 이름을 `Auto Allow Tool`로 바꿔 제품명에서 제3자 상표를 뺐다. `ChatGPT`는 동작 대상을 설명하는 문장에만 쓴다.
2. **`PRIVACY.md`는 동작과 일치한다.** 저장소 종류, 진단 로그, 탭 이동, Limited Use 준수 문구를 반영했다. 기능을 바꿀 때마다 함께 갱신한다.
3. **언어는 하나.** 패키지에 `_locales`가 없어 스토어 설명은 기본 언어 하나만 등록된다. 아래 한국어 설명을 쓰고, 필요하면 영어 설명을 같은 칸 하단에 덧붙인다.

## 1. 상품 정보

**이름 (manifest `name`, 75자 이하):** Auto Allow Tool

**요약 (manifest `description`, 132자 이하):** Unofficial helper for chatgpt.com: auto-approves tool permission prompts, refreshes plugin tools, optionally auto-continues.
요약은 manifest에서 그대로 가져오므로 바꾸려면 manifest를 수정해 다시 패키징해야 한다.

**카테고리:** 생산성 (Productivity)

**상세 설명 (KO):**

> ChatGPT(chatgpt.com)에서 도구를 쓸 때 반복되는 승인·관리 작업을 자동화하는 비공식 확장프로그램입니다. OpenAI와 제휴하거나 OpenAI가 보증·제작한 제품이 아닙니다.
>
> ■ 자동 허용
> - ChatGPT가 도구(플러그인, 연결된 앱 등)를 쓰려고 할 때 나타나는 권한 카드의 `허용하기`, `한 번만 허용`, `사용 허용`, `승인`, `Allow`, `Approve` 버튼을 자동으로 누릅니다.
> - `항상 허용`, `모두 허용`처럼 범위가 넓은 버튼과 `허용하지 않음`, `거절`, `취소`처럼 부정·거부 버튼은 누르지 않습니다.
> - `허용할 도구 이름`(쉼표 구분, 도구 이름 전체 일치)을 지정하면 그 도구만 자동 승인합니다. `자동 클릭 제외 키워드`가 들어간 카드는 건너뜁니다.
> - 클릭 지연 시간을 0~10,000ms로 조절할 수 있고, 툴바 팝업에서 바로 켜고 끌 수 있습니다.
>
> ■ 플러그인 도구 새로 고침
> - 팝업에서 실행하면 설치된 플러그인의 `도구 새로 고침`을 차례로 누릅니다. 실행 중에는 현재 탭이 ChatGPT 플러그인 설정 화면으로 이동합니다.
> - 옵션에서 주기(시간)를 지정하면 ChatGPT 탭이 백그라운드에 있을 때만 자동 실행합니다. 기본값은 꺼짐입니다.
>
> ■ 자동 이어서 진행 (선택, 기본값 꺼짐)
> - 사용자가 켠 경우에만, 응답이 끝나면 사용자가 옵션에서 직접 정한 문구(기본값 `이어서 진행`)를 현재 대화 입력창에 넣고 보내기를 누릅니다.
> - 사용자가 직접 보낸 메시지 하나당 사용자가 정한 횟수(기본 1회, 최대 100회)까지만 보냅니다. 입력창에 작성 중인 글이 있으면 덮어쓰지 않고, 보낼 때마다 화면에 횟수를 표시합니다.
> - 팝업에서 현재 탭만 따로 켜거나 끌 수 있습니다.
>
> ■ 안전 안내
> 이 확장프로그램은 추가 확인 없이 ChatGPT의 도구 사용을 승인합니다. ChatGPT가 호출할 수 있는 도구를 이해한 상태에서만 사용하고, `허용할 도구 이름`으로 자동 승인 범위를 제한하는 것을 권장합니다.
>
> ■ 개인정보
> 사용자 데이터를 개발자나 제3자에게 전송·판매·공유하지 않습니다. 권한 카드 문구와 플러그인 이름은 클릭 대상을 판단하기 위해 기기 안에서만 처리하며, 대화 내용은 저장하지 않습니다. 설정은 Chrome 저장소에 보관되고 Chrome 동기화를 켠 경우 같은 계정의 다른 Chrome과 동기화됩니다. 동작 범위는 chatgpt.com과 chat.openai.com뿐입니다.
>
> 소스 코드: https://github.com/JS190-prog/chatgpt-auto-allow-tool

**상세 설명 (EN, 필요 시 위 설명 하단에 덧붙임):**

> Unofficial helper for ChatGPT (chatgpt.com). Not affiliated with, endorsed by, or produced by OpenAI.
>
> - Auto-allow: clicks allow/approve buttons on tool-permission cards (e.g. "Allow", "Approve", `허용하기`, `한 번만 허용`). Never clicks broad buttons such as "Always allow" / "Allow all", or deny/cancel buttons. Optional allow-list of full tool names and deny-list keywords; click delay 0-10,000 ms.
> - Plugin tool refresh: presses "Refresh tools" for each installed plugin. The current tab navigates to the ChatGPT plugin settings page while it runs. An optional schedule runs only while the ChatGPT tab is in the background (off by default).
> - Auto-continue (optional, off by default): only when the user turns it on, sends the phrase the user set in options (default `이어서 진행`) into the current conversation after a response finishes, at most the user-set count (1-100) per manual message, never overwriting a draft, with an on-screen counter.
>
> Safety: this extension approves ChatGPT tool use without an extra click. Restrict it with the tool allow-list.
>
> Privacy: nothing is sent, sold or shared. Permission-card text and plugin names are processed only on the device; conversations are not stored. Settings sync through Chrome Sync if it is on. Runs only on chatgpt.com and chat.openai.com.

## 2. 그래픽 자료

`docs/store-assets/`에 있는 파일을 업로드한다. 원본 HTML은 `docs/store-assets/src/`에 있다.

| 항목 | 파일 | 규격 |
|---|---|---|
| 스토어 아이콘 | `icons/icon128.png` | 128x128 |
| 스크린샷 1 | `screenshot-1-popup.png` (실제 팝업 UI) | 1280x800 |
| 스크린샷 2 | `screenshot-2-options.png` (실제 옵션 UI) | 1280x800 |
| 스크린샷 3 | `screenshot-3-auto-allow.png` (예시 화면) | 1280x800 |
| 스크린샷 4 | `screenshot-4-plugin-refresh.png` (예시 화면) | 1280x800 |
| 스크린샷 5 | `screenshot-5-auto-continue.png` (예시 화면) | 1280x800 |
| 작은 프로모션 타일 | `promo-small-440x280.png` | 440x280 |

3~5번은 단순화한 재현 화면이라 "예시 화면"으로 표시했다. 오해 소지를 더 줄이려면 개인 정보와 플러그인 URL이 보이지 않게 실제 화면을 직접 캡처해 교체한다.

## 3. 개인정보 보호 탭

**단일 목적 설명:**
ChatGPT 웹사이트에서 도구 사용과 관련된 반복 작업(권한 카드 승인, 설치된 플러그인의 도구 새로 고침, 사용자가 켠 경우 응답 후 이어서 진행)을 사용자가 정한 조건대로 자동화한다. 모든 기능은 ChatGPT 페이지 안에서만 동작하며 한 가지 사용 흐름(도구를 쓰는 긴 대화를 끊김 없이 진행)을 위한 것이다.

**권한 사유:**

| 권한 | 입력할 사유 |
|---|---|
| `storage` | 사용자 설정(자동 허용 여부, 클릭 지연, 허용·제외 목록, 새로고침 주기, 자동 이어서 진행 설정), 탭별 임시 설정, 새로고침 진행 상태, 자동화 오류 진단 로그를 Chrome 저장소에 보관하는 데 사용합니다. 개발자나 제3자에게 전송하지 않습니다. |
| 호스트 권한 `https://chatgpt.com/*`, `https://chat.openai.com/*` | 확장프로그램의 유일한 대상인 ChatGPT 페이지에서 권한 카드와 허용 버튼, 플러그인 설정 화면, 입력창을 찾아 조작하려면 콘텐츠 스크립트로 페이지에 접근해야 합니다. 플러그인 새로고침을 시작할 때 현재 ChatGPT 탭을 플러그인 설정 화면으로 이동하는 데에도 사용합니다. 다른 사이트에는 접근하지 않습니다. |

**원격 코드 사용:** 아니요. 모든 코드는 패키지에 포함돼 있다(코드 검색 결과 `eval`, `new Function`, 외부 스크립트 로드, ChatGPT 외 URL 없음).

**데이터 사용 공개:**
사용자 데이터 FAQ는 "기기 안에서만 처리·저장하는 데이터도 처리 방식을 공개해야 한다"고 명시한다. 그래서 아래처럼 공개한다.
- 체크: **웹사이트 콘텐츠.** 권한 카드 문구, 플러그인 이름, 응답 완료 상태를 읽어 클릭·전송 대상을 판단하고, 플러그인 이름과 오류 문구를 진단 로그에 기기 안에서만 저장한다.
- 그 외 항목(개인 식별 정보, 건강, 금융, 인증 정보, 개인 커뮤니케이션, 위치, 웹 기록, 사용자 활동)은 체크하지 않는다. 대화 내용은 저장하거나 전송하지 않는다.
- 세 가지 인증 모두 체크: 승인된 용도 외 제3자 판매·전송 없음 / 단일 목적과 무관한 사용·전송 없음 / 신용도 판단·대출 목적 사용 없음.

**개인정보처리방침 URL:** https://github.com/JS190-prog/chatgpt-auto-allow-tool/blob/master/PRIVACY.md

## 4. 심사자 메모 (배포 탭의 "심사 관련 참고사항" 칸)

> This is an unofficial helper for ChatGPT and is not affiliated with OpenAI.
>
> Auto-continue is off by default. It only runs after the user turns it on in the options page or for a single tab in the popup. The text it sends is the phrase the user wrote in options, it is sent only into the conversation open in that tab, and it stops after the user-set count (1-100) per manual message. It never overwrites a draft, shows an on-screen counter for every send, stops at the limit, and can be turned off at any time. The count restarts only when the user manually sends a new message. This gives the user control over both the content and the recipient of each message.
>
> Auto-allow never clicks broad grants such as "Always allow" or "Allow all", and can be limited to an allow-list of tool names. Scheduled plugin refresh is off by default and runs only while the ChatGPT tab is in the background.
>
> The extension makes no network requests of its own and sends no data to the developer. Source: https://github.com/JS190-prog/chatgpt-auto-allow-tool

## 5. 배포 설정

- 공개 범위: 처음에는 "비공개(링크가 있는 사용자)"로 올려 실제 설치 동작을 확인한 뒤 "공개"로 바꾸는 방법을 권장한다.
- 지역: 전체 또는 대한민국.
- 공개가 확정되면 `release-version.json`의 `minimumPublishedVersion`을 제출한 버전으로 올린다.

## 6. 반려 위험과 대응

| 위험 | 정도 | 근거 | 대응 |
|---|---|---|---|
| 사용자 대신 메시지 전송 | 중간 | 스팸·남용 정책은 내용과 수신자를 확인할 수 없는 대리 전송을 금지한다. 자동 이어서 진행은 입력창에 문구를 넣어 보낸다 | 기본값 꺼짐, 사용자가 정한 문구, 현재 대화 고정, 횟수 상한, 화면 표시를 설명과 심사자 메모에 명시. 반려되면 처음 켤 때 보낼 문구를 확인하는 단계를 추가해 재제출 |
| 단일 목적 | 낮음~중간 | 기능이 세 가지다. 다만 자동 이어서 진행에 다른 기능을 묶은 ChatGPT 확장도 게시돼 있다 | 단일 목적을 "ChatGPT 도구 사용 반복 작업 자동화" 한 흐름으로 설명 |
| 상표 | 낮음 | 0.5.18에서 제품명에서 `ChatGPT`를 뺐다 | 설명 첫 줄에 비공식·비제휴 명시 |
| 예시 스크린샷 | 낮음 | 3~5번은 재현 화면이다 | "예시 화면" 표시. 가능하면 실제 화면 캡처로 교체 |
| 탭 이동 | 낮음 | 새로고침 중 탭이 설정 화면으로 이동한다 | 설명과 방침에 명시, 자동 실행은 기본값 꺼짐 |

어떤 대응을 해도 승인은 Google 심사자의 재량이라 보장되지 않는다. 반려되면 사유를 확인해 수정 후 재제출한다.
