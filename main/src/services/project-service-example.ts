/**
 * Project Service 사용 예시
 * 로컬과 클라우드 프로젝트를 모두 조회하는 방법
 */

import { ProjectService } from './project.service';
import { CloudApiService } from './cloud-api.service';
import { DatabaseService } from './database.service';

// 사용 예시
async function exampleUsage() {
  // 1. 데이터베이스 서비스 초기화
  const dbService = new DatabaseService();
  await dbService.initialize();

  // 2. 클라우드 API 서비스 초기화 (선택사항)
  const cloudApiService = new CloudApiService({
    baseUrl: 'https://api.collabcut.com',
    apiKey: 'your-api-key-here',
    timeout: 10000,
  });

  // 3. 프로젝트 서비스 초기화 (클라우드 서비스 포함)
  const projectService = new ProjectService(dbService, cloudApiService);

  // 4. 사용자 프로젝트 조회 (로컬 + 클라우드)
  const userId = 'user-123';
  
  // 모든 프로젝트 조회 (로컬 + 클라우드)
  const allProjects = await projectService.getUserProjects(userId, {
    includeCloud: true, // 클라우드 프로젝트 포함
    limit: 20,
    offset: 0,
    orderBy: 'updated_at',
    orderDirection: 'DESC',
    search: 'my project', // 검색어
  });

  if (allProjects.success) {
    console.log('총 프로젝트 수:', allProjects.data?.length);
    allProjects.data?.forEach((project) => {
      console.log(`프로젝트: ${project.name} (클라우드 동기화: ${project.cloud_sync_enabled})`);
    });
  }

  // 5. 로컬 프로젝트만 조회
  const localOnlyProjects = await projectService.getUserProjects(userId, {
    includeCloud: false, // 클라우드 프로젝트 제외
  });

  // 6. 클라우드 서비스 상태 확인
  if (cloudApiService.isServiceOnline()) {
    console.log('클라우드 서비스가 온라인 상태입니다.');
  } else {
    console.log('클라우드 서비스가 오프라인 상태입니다.');
  }
}

export { exampleUsage };
