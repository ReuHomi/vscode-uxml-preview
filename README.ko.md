[English](README.md)

# Unity UI Toolkit용 UXML Preview

버전 **0.4.0**은 **uxml-preview ^0.7.0**을 사용한다.

Unity를 열지 않고 VS Code에서 Template/Instance로 조립된 UXML을 미리 보고,
Unity가 조용히 무시하는 `element-name` 오타를 짚는다. 레이아웃은 UI Toolkit이 사용하는 레이아웃 엔진 Yoga를 쓰는
[`uxml-preview`](https://github.com/ReuHomi/uxml-preview)가 계산한다. 이 확장은
파일을 읽고 감시하며, 미리보기 패널을 관리하고, 코어 렌더러의 결과를 보여준다.

## 그리는 것과 그리지 못하는 것

현재 `VisualElement`, `Label`, `Button`, `Image`, `ScrollView`, `GroupBox`, `Box`,
`TextField`, `Slider`, `SliderInt`, `Toggle`, `RadioButton`, `ProgressBar`,
`TextElement`, `RepeatButton`의 15종을 지원한다.
TextField의 커서·선택 표시는 그리지 않고, RepeatButton은 버튼 모양이 아닌 맨 글자로
보이며, 스크롤바는 그리지 않는다.
그 밖의 컨트롤은 평범한 상자로 대체하고 진단 패널에 표시한다. 지원하지 못한
내용을 조용히 숨기지 않는다.

`Template` 선언과 `Instance` 사용을 조합한다. 중첩 템플릿, 템플릿 로컬
스타일시트, `style` 이외의 `AttributeOverrides`도 포함한다. 슬롯은 의도적으로
지원하지 않는다. 슬롯 자식은 배치하지 않고, 진단 패널에 슬롯 정의와 빠진
자식을 함께 표시한다.
Unity는 import 중 `style` AttributeOverride를 무시하므로 미리보기에서도 적용하지
않고 `override-style-ignored`로 알린다. `element-name`이 실제 이름과 맞지 않으면
`override-target-missing`에 해당 인스턴스 스코프의 실제 이름 목록을 함께 표시한다.

이 범위는 외부 오픈소스 프로젝트 여섯 곳의 UXML 문서 14개로 확인했다. 이
원래 표본에서는 `unsupported-control` 진단이 131번 발생했다. 이것은 서로 다른
렌더 실패 131건이 아니라 진단 건수다. 템플릿을 쓰는 문서 한 개를 0.5.0으로
재관찰했을 때는 Instance 15개가 모두 전개됐고, 템플릿 폴백 진단 줄 31개
(선언 1 + Instance 15 + override 15)는 0개가 됐다. 새로 드러난 중복 이름 진단
1개는 별도로 기록한다. 출처, 라이선스, 파일별 관찰은
[외부 표본 결과](examples/external/FINDINGS.md)에 기록돼 있다.

이 확장은 다음을 하지 않는다.

- 파일을 편집하거나 쓰지 않는다. 뷰어다.
- USS를 검증하지 않는다. 구문과 검증은 기존 언어 확장의 영역이다.
- 모든 UI Toolkit 컨트롤과 시각 속성을 재현한다고 약속하지 않는다.

## 알려진 한계

코어 렌더러가 공개하는 Unity와의 알려진 차이는 세 가지다.

- 브라우저와 Unity 폰트 에셋의 글자 측정값이 달라, 글자 크기에 의존하는
  레이아웃은 몇 픽셀 어긋날 수 있다.
- 자식이 줄바꿈되는 컨테이너의 높이를 Unity가 정하는 규칙은 아직 확인되지
  않아, 해당 높이가 다를 수 있다.
- 확정된 크기가 없는 부모 아래에서 주축 백분율을 계산할 때 Unity
  6000.0.40f1의 Yoga와 렌더러가 쓰는 Yoga 버전의 동작이 달라질 수 있다.

해석에 실패한 `resource()` 참조는 의도적으로 마젠타 폴백으로 남긴다. Unity는
내장 아이콘으로 대체하지만, 이 확장은 화면을 그럴듯하게 만드는 대신 실패를
감추게 되므로 대체하지 않는다. 이것은 Unity와의 의도적 차이다.

패키지는 `<projectRoot>/Packages`에서만 찾으며 Unity의
`Library/PackageCache`는 검색하지 않는다.

## 측정된 레이아웃 값

레이아웃 값 일치는 좌표 비교이며 컨트롤 지원 범위나 완성된 화면 전체를 뜻하지 않는다.
테마·코호트별 현행 값과 케이스, 환경, 허용 오차, 제외 조건은 코어의
[정확도 문서](https://github.com/ReuHomi/uxml-preview/blob/main/docs/accuracy.md)에
있다.

## 미리보기 열기

개념부터 따라가는 사용법은 브라우저에서 단일 파일
[사용 매뉴얼](https://reuhomi.github.io/vscode-uxml-preview/manual.html)을 열어 확인할 수 있다. 매뉴얼 본문은 영어다.

`.uxml` 파일을 선택한 상태에서 다음 세 방법을 쓸 수 있다.

1. Windows/Linux에서는 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>, macOS에서는
   <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>를 누른다.
2. 편집기 제목 표시줄의 미리보기 아이콘을 누른다.
3. 탐색기에서 파일을 우클릭하고 **UXML Preview: Open Preview to the Side**를
   고른다.

UXML 문서나 해석에 성공한 임포트 스타일시트를 저장하면 미리보기가 갱신된다.
기본 캔버스는 1920×1080으로 고정돼 있어, 사람마다 패널 폭이 달라도 같은 문서가
같은 크기로 배치된다. 반응형 배치를 확인할 때는 **Fit to panel**을 켤 수 있다.

컨트롤 바에서는 모든 요소에 `hover`, `active`, `focus`, `disabled`를 한꺼번에
적용할 수 있다. 켜진 상태와 캔버스 크기는 미리보기 컨트롤 바에 계속 표시된다.

## 설정

기본 **Game screen**(`runtime`, 게임 화면)은 Unity 런타임 패널의 기본 테마다.
글자와 버튼이 예전보다 크게 보일 수 있다. 투명한 패널 뒤에는 흰색·회색 체크무늬를
깔아 VS Code 어두운 테마에서도 어두운 글자가 보이게 한다.
도구막대의 **Editor screen**(`editor`, 에디터 화면)을 고르면 설정
`uxmlPreview.theme`에도 저장된다. 선택 표시는 코어가 실제로 그린 테마를 따른다.
에디터 테마도 예전 코어 버전과 완전히 같지는 않다.

처음 미리보기를 열 때 한 번 안내하며 에디터 테마로 바꾸는 버튼을 제공한다.
강제로 켠 `disabled` 상태는 더 이상 흐리게 하지 않으며, 작성한 `enabled="false"`는
여전히 흐리게 한다. 글꼴 폴백은 렌더러 차이로 세고, 코어가 좌표에 영향을 준다고
알리면 레이아웃 안내를 표시한다. 프로젝트 글꼴 해석은 아직 지원하지 않는다.

`uxmlPreview.projectRoot`는 `Assets`, `Packages`, `ProjectSettings`가 들어 있는
Unity 프로젝트 디렉터리다. `project://` 경로, `/Assets` 경로, 패키지 경로,
그리고 기록된 에셋 경로가 낡았을 때 GUID 폴백에 사용한다. UXML 파일이 속한
워크스페이스 폴더가 Unity 프로젝트 루트가 아닐 때 설정한다. 비어 있으면 해당
워크스페이스 폴더를 사용한다.

| 설정 | 기본값 | 용도 |
|---|---:|---|
| `uxmlPreview.theme` | `runtime` | 게임 화면(`runtime`) 또는 에디터 화면(`editor`). |
| `uxmlPreview.canvas.width` | `1920` | 고정 루트 폭(픽셀). |
| `uxmlPreview.canvas.height` | `1080` | 고정 루트 높이(픽셀). |
| `uxmlPreview.canvas.fitToPanel` | `false` | 고정 크기 대신 미리보기의 가용 영역을 사용한다. |
| `uxmlPreview.projectRoot` | 비어 있음 | Unity 프로젝트 경로와 GUID 참조를 해석한다. |
| `uxmlPreview.states` | `{}` | USS 셀렉터를 키로 하는 pseudo-class 상태. 이 버전에는 셀렉터 UI가 없다. |

---

`Unity` and `UI Toolkit` are trademarks of Unity Technologies. This project is
not affiliated with or endorsed by Unity Technologies.
