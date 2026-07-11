# Third-Party Notices

배포 설치본에는 다음 제3자 구성요소가 포함되거나 사용된다.

## FFmpeg (GPL-3.0-or-later)

영상 조립에 FFmpeg를 사용한다. `ffmpeg-static`이 배포하는 사전 빌드 바이너리를 별도 프로세스(`child_process`)로 실행하며 앱 코드에 링크하지 않는다. 바이너리는 GNU GPL v3 조건으로 재배포되고, 라이선스 전문은 배포본의 `ffmpeg.exe.LICENSE`에 들어 있다. 대응 소스는 https://ffmpeg.org , 빌드 스크립트는 https://github.com/eugeneware/ffmpeg-static 를 참고한다.

## Remotion

영상·썸네일 렌더링에 Remotion(`remotion`, `@remotion/renderer`, `@remotion/bundler`)을 사용한다. Remotion은 자체 라이선스를 따르며 조직 규모·용도에 따라 별도 라이선스가 필요할 수 있다. https://www.remotion.dev/docs/license 참고.

## 기타

Electron, React / React DOM, electron-log, electron-updater는 MIT 라이선스, JSZip은 MIT/GPL 듀얼 라이선스(MIT 적용)다. 각 라이선스 전문은 해당 패키지의 `LICENSE` 파일에 포함된다.
