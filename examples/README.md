# Examples

`basics/`는 기능 하나씩을 확인하는 독립 픽스처다. `unity-project/`는 `projectRoot`를 그 폴더로 설정하고 Unity 프로젝트 구조와 GUID 해석을 확인한다.

- `basics/01-layout.uxml` — 스타일시트 없이 빨강·초록·파랑 세 박스가 세로로 쌓이면 맞다. 가로로 늘어서면 `flex-direction` 기본값이 틀린 것이다.
- `basics/02-styled.uxml` — 밝은 초록 카드에 파란 왼쪽 테두리, 밝은 제목과 회색 본문이 보이면 `<Style src>`가 적용된 것이다.
- `basics/03-fallback.uxml` — Toggle·Slider 경고가 두 건이고 같은 좌표의 폴백 표식 하나에 `2`가 보이면 맞다. 파란 회전 박스의 `rotate`는 지원 속성이다.
- `basics/04-chain.uxml` — 짙은 회색 바깥 박스 안에 연한 노랑 막대가 보이면 전이 `@import`까지 적용된 것이다.
- `basics/05-asset.uxml` — 200×200 마젠타 빗금과 `asset-unresolved` 진단이 함께 보이면 해석 실패를 숨기지 않은 것이다.
- `basics/06-resolved-asset.uxml` — 청록·주황 체크무늬가 보이고 `asset-unresolved`가 없으면 상대 경로 에셋이 해석된 것이다.
- `unity-project/Assets/07-moved-asset.uxml` — `projectRoot`를 `examples/unity-project`로 설정했을 때 체크무늬와 `asset-path-stale` 진단이 함께 보여야 한다. USS의 `Assets/UI/icon.png`는 GUID 폴백을 검증하려고 일부러 낡게 둔 경로이므로 고치지 않는다.
- `unity-project/Assets/08-bad-guid.uxml` — 마젠타 빗금과 `asset-unresolved`, 한 항목을 검색했다는 GUID 진단이 보이면 맞다.
