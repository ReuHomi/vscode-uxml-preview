[English](README.md)

# Unity UI Toolkit용 UXML Preview

Unity Editor를 열지 않고 VS Code 안에서 Unity UI Toolkit `.uxml` 문서를
그린다. 레이아웃은 UI Toolkit이 사용하는 레이아웃 엔진 Yoga를 쓰는
[`uxml-preview`](https://github.com/ReuHomi/uxml-preview)가 계산한다. 이 확장은
파일을 읽고 감시하며, 미리보기 패널을 관리하고, 코어 렌더러의 결과를 보여준다.

## 그리는 것과 그리지 못하는 것

현재 `VisualElement`, `Label`, `Button`, `Image`, `ScrollView`를 지원한다.
그 밖의 컨트롤은 평범한 상자로 대체하고 진단 패널에 표시한다. 지원하지 못한
내용을 조용히 숨기지 않는다.

`Template`과 `Instance`는 아직 그리지 못한다. 재사용 UI를 템플릿으로 조합하는
실무 UI Toolkit 문서에서 흔히 마주칠 한계다.

이 범위는 외부 오픈소스 프로젝트 여섯 곳의 UXML 문서 14개로 확인했다. 이
표본에서는 `unsupported-control` 진단이 131번 발생했다. 이것은 서로 다른 렌더
실패 131건이 아니라, 현재 지원 컨트롤이 위 다섯 종뿐이라는 사실을 다른 단위로
본 것이다. 출처, 라이선스, 파일별 관찰은
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

외부 프로젝트에서 확인된 경로 문제 두 가지도 남아 있다.

- 상대 `@import`는 코어가 어느 스타일시트에서 요청했는지 알려주기 전까지
  임포트한 스타일시트를 기준으로 해석할 수 없다
  ([uxml-preview#1](https://github.com/ReuHomi/uxml-preview/issues/1)).
- 인라인 `style` 속성의 에셋 URL은 XML 엔티티가 디코드되지 않은 채
  리졸버에 도달할 수 있다
  ([uxml-preview#2](https://github.com/ReuHomi/uxml-preview/issues/2)).

패키지는 `<projectRoot>/Packages`에서만 찾으며 Unity의
`Library/PackageCache`는 검색하지 않는다.

## 측정된 레이아웃 값

Unity 6000.0.40f1과 비교한 **레이아웃 값 564개 중 548개가 일치했다**. 564개는
요소 141개의 `x`, `y`, `width`, `height` 값이다. 이 수치는 해당 케이스 집합에서
Yoga가 계산한 좌표를 비교한 것이며, 컨트롤 지원 범위나 완성된 화면 전체를
뜻하지 않는다. 케이스, 환경, 허용 오차, 제외 조건은 코어의
[정확도 문서](https://github.com/ReuHomi/uxml-preview/blob/main/docs/accuracy.md)에
있다.

## 미리보기 열기

개념부터 따라가는 사용법은 브라우저에서 단일 파일
[사용 매뉴얼](docs/manual.html)을 열어 확인할 수 있다. 매뉴얼 본문은 영어다.

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

`uxmlPreview.projectRoot`는 `Assets`, `Packages`, `ProjectSettings`가 들어 있는
Unity 프로젝트 디렉터리다. `project://` 경로, `/Assets` 경로, 패키지 경로,
그리고 기록된 에셋 경로가 낡았을 때 GUID 폴백에 사용한다. UXML 파일이 속한
워크스페이스 폴더가 Unity 프로젝트 루트가 아닐 때 설정한다. 비어 있으면 해당
워크스페이스 폴더를 사용한다.

| 설정 | 기본값 | 용도 |
|---|---:|---|
| `uxmlPreview.canvas.width` | `1920` | 고정 루트 폭(픽셀). |
| `uxmlPreview.canvas.height` | `1080` | 고정 루트 높이(픽셀). |
| `uxmlPreview.canvas.fitToPanel` | `false` | 고정 크기 대신 미리보기의 가용 영역을 사용한다. |
| `uxmlPreview.projectRoot` | 비어 있음 | Unity 프로젝트 경로와 GUID 참조를 해석한다. |
| `uxmlPreview.states` | `{}` | USS 셀렉터를 키로 하는 pseudo-class 상태. 이 버전에는 셀렉터 UI가 없다. |

---

`Unity` and `UI Toolkit` are trademarks of Unity Technologies. This project is
not affiliated with or endorsed by Unity Technologies.
