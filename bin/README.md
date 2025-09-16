# CollabCut CLI Tools

CollabCut의 CLI 도구들은 명령행에서 프로젝트 관리, 미디어 처리, 타임라인 편집을 수행할 수 있게 해줍니다.

## 설치 및 설정

먼저 필요한 dependencies를 설치합니다:

```bash
npm install
```

## 사용 가능한 CLI 도구들

### 1. Project Management CLI (`collabcut-cli`)

프로젝트 생성, 조회, 수정, 삭제를 위한 CLI 도구입니다.

```bash
# CLI 실행
npm run cli:project

# 사용 가능한 명령어들
npm run cli:project create           # 새 프로젝트 생성
npm run cli:project list             # 프로젝트 목록 조회
npm run cli:project get <projectId>  # 프로젝트 상세 정보
npm run cli:project update <projectId>  # 프로젝트 수정
npm run cli:project delete <projectId>  # 프로젝트 삭제
```

**예시:**

```bash
# 새 프로젝트 생성 (대화형)
npm run cli:project create

# 모든 프로젝트 목록 조회
npm run cli:project list

# 특정 상태의 프로젝트만 조회
npm run cli:project list --status active

# 프로젝트 상세 정보 조회
npm run cli:project get abc123-def456-ghi789
```

### 2. Media Processing CLI (`media-cli`)

미디어 파일 업로드, 처리, 변환을 위한 CLI 도구입니다.

```bash
# CLI 실행
npm run cli:media

# 사용 가능한 명령어들
npm run cli:media upload <filePath>    # 미디어 파일 업로드
npm run cli:media list                 # 미디어 목록 조회
npm run cli:media get <assetId>        # 미디어 상세 정보
npm run cli:media thumbnail <assetId>  # 썸네일 생성
npm run cli:media convert <assetId>    # 포맷 변환
npm run cli:media process <assetId>    # 대화형 처리 워크플로우
npm run cli:media delete <assetId>     # 미디어 삭제
```

**예시:**

```bash
# 비디오 파일 업로드
npm run cli:media upload "/path/to/video.mp4" --project-id abc123

# 특정 프로젝트의 미디어 목록
npm run cli:media list --project-id abc123 --type video

# 썸네일 생성 (5초 지점에서)
npm run cli:media thumbnail def456 --time 5 --width 320

# MP4로 변환
npm run cli:media convert def456 --format mp4 --quality high

# 대화형 처리 워크플로우
npm run cli:media process def456
```

### 3. Timeline Operations CLI (`timeline-cli`)

타임라인 시퀀스 및 클립 편집을 위한 CLI 도구입니다.

```bash
# CLI 실행
npm run cli:timeline

# 사용 가능한 명령어들
npm run cli:timeline create-sequence <projectId>  # 새 시퀀스 생성
npm run cli:timeline list-sequences <projectId>   # 시퀀스 목록
npm run cli:timeline get-sequence <sequenceId>    # 시퀀스 상세 정보
npm run cli:timeline add-clip <sequenceId>        # 클립 추가
npm run cli:timeline move-clip <clipId>           # 클립 이동
npm run cli:timeline split-clip <clipId>          # 클립 분할
npm run cli:timeline delete-clip <clipId>         # 클립 삭제
npm run cli:timeline edit <sequenceId>            # 대화형 편집 워크플로우
```

**예시:**

```bash
# 새 타임라인 시퀀스 생성
npm run cli:timeline create-sequence abc123

# 프로젝트의 시퀀스 목록
npm run cli:timeline list-sequences abc123

# 클립을 타임라인에 추가
npm run cli:timeline add-clip ghi789 --media-id def456 --track 0 --start-time 10

# 클립을 새 위치로 이동
npm run cli:timeline move-clip jkl012 --start-time 20 --track 1

# 클립을 15초 지점에서 분할
npm run cli:timeline split-clip jkl012 --split-time 15

# 대화형 편집 워크플로우
npm run cli:timeline edit ghi789
```

## 공통 옵션

모든 CLI 도구는 다음과 같은 공통 옵션들을 지원합니다:

- `--help` : 도움말 표시
- `--version` : 버전 정보 표시
- `--force` : 확인 없이 강제 실행 (삭제 작업 시)

## 데이터베이스 연결

모든 CLI 도구는 자동으로 SQLite 데이터베이스에 연결됩니다. 데이터베이스 파일이 존재하지 않으면 자동으로 생성됩니다.

## 에러 처리

CLI 도구들은 포괄적인 에러 처리를 제공합니다:

- 입력 유효성 검사
- 데이터베이스 연결 오류 감지
- 파일 시스템 오류 처리
- 색상 코딩된 출력 (성공: 녹색, 오류: 빨간색, 경고: 노란색)

## 개발자 정보

이 CLI 도구들은 TypeScript로 작성되었으며 다음 기술들을 사용합니다:

- **Commander.js**: 명령행 인터페이스
- **Inquirer.js**: 대화형 프롬프트
- **TypeScript**: 타입 안전성
- **Node.js**: 런타임 환경

## 문제 해결

### 자주 발생하는 문제들

1. **`ts-node` 명령을 찾을 수 없음**

   ```bash
   npm install ts-node --save-dev
   ```

2. **데이터베이스 연결 오류**
   - 데이터베이스 스키마가 초기화되었는지 확인
   - 파일 권한 확인

3. **미디어 파일 처리 오류**
   - FFmpeg가 설치되어 있는지 확인
   - 파일 경로와 권한 확인

### 디버깅

환경 변수를 설정하여 더 자세한 로그를 확인할 수 있습니다:

```bash
DEBUG=collabcut:* npm run cli:project list
```
