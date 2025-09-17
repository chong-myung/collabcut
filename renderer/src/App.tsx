import React, { useState, useEffect, useCallback } from 'react';
import LoginForm from './components/LoginForm';
import ProjectPanel from './components/ProjectPanel';
import MediaAssetCard from './components/MediaAssetCard';
import { Button } from './components/ui/button';
import './App.css';

interface User {
  user: {
    display_name?: string;
    username: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at?: string;
  type?: 'local' | 'cloud';
}

interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'folder';
  duration?: number;
  size: number;
  thumbnailUrl?: string;
  uploadedAt: Date;
  uploadedBy: string;
  description?: string;
  tags?: string[];
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number;
}

declare global {
  interface Window {
    electronAPI: {
      getCurrentUser: () => Promise<{ success: boolean; data?: User }>;
      listProjects: () => Promise<{ success: boolean; data?: Project[] }>;
      createProject: (projectData: {
        name: string;
        description: string;
      }) => Promise<{ success: boolean; error?: string }>;
      login: (
        userId: string
      ) => Promise<{ success: boolean; data?: User; error?: string }>;
      logout: () => Promise<void>;
      listMedia: (
        projectId: string
      ) => Promise<{ success: boolean; data?: any[] }>;
    };
  }
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const result = await window.electronAPI.listProjects();
      console.log('project result', result);
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }, []);

  const loadMediaAssets = useCallback(
    async (projectId: string) => {
      setLoadingMedia(true);
      try {
        const result = await window.electronAPI.listMedia(projectId);
        console.log('media result', result);
        if (result.success && result.data) {
          // 데이터 매핑 (API 응답 형식에 맞춰 조정)
          const mappedAssets: MediaAsset[] = result.data.map((asset: any) => ({
            id: asset.id,
            name: asset.filename || asset.name,
            type:
              asset.file_type === 'video'
                ? 'video'
                : asset.file_type === 'audio'
                  ? 'audio'
                  : 'image',
            duration: asset.duration,
            size: asset.file_size || asset.size || 0,
            thumbnailUrl: asset.thumbnail_url,
            uploadedAt: new Date(
              asset.created_at || asset.uploadedAt || Date.now()
            ),
            uploadedBy: asset.uploaded_by || asset.uploadedBy || 'Unknown',
            description: asset.description,
            tags: asset.tags || [],
            status: 'ready' as const,
            progress: 100,
          }));
          setMediaAssets(mappedAssets);
        } else {
          // 개발용 샘플 데이터 (API에 데이터가 없을 때)
          const sampleAssets: MediaAsset[] = [
            {
              id: '1',
              name: 'Sample Video.mp4',
              type: 'video',
              duration: 120,
              size: 1024 * 1024 * 50, // 50MB
              uploadedAt: new Date(),
              uploadedBy: currentUser?.user.username || 'Demo User',
              status: 'ready',
              tags: ['demo', 'sample'],
              description: 'A sample video file for testing',
            },
            {
              id: '2',
              name: 'Background Music.mp3',
              type: 'audio',
              duration: 180,
              size: 1024 * 1024 * 5, // 5MB
              uploadedAt: new Date(),
              uploadedBy: currentUser?.user.username || 'Demo User',
              status: 'ready',
              tags: ['music', 'background'],
            },
            {
              id: '3',
              name: 'Logo.png',
              type: 'image',
              size: 1024 * 500, // 500KB
              uploadedAt: new Date(),
              uploadedBy: currentUser?.user.username || 'Demo User',
              status: 'ready',
              tags: ['logo', 'brand'],
            },
            {
              id: '4',
              name: 'Processing Video.mov',
              type: 'video',
              duration: 300,
              size: 1024 * 1024 * 100, // 100MB
              uploadedAt: new Date(),
              uploadedBy: currentUser?.user.username || 'Demo User',
              status: 'processing',
              progress: 75,
            },
          ];
          setMediaAssets(sampleAssets);
        }
      } catch (error) {
        console.error('Error loading media assets:', error);
        // 에러 시에도 샘플 데이터 표시
        const sampleAssets: MediaAsset[] = [
          {
            id: '1',
            name: 'Sample Video.mp4',
            type: 'video',
            duration: 120,
            size: 1024 * 1024 * 50,
            uploadedAt: new Date(),
            uploadedBy: currentUser?.user.username || 'Demo User',
            status: 'ready',
            tags: ['demo', 'sample'],
          },
        ];
        setMediaAssets(sampleAssets);
      } finally {
        setLoadingMedia(false);
      }
    },
    [currentUser]
  );

  const checkCurrentUser = useCallback(async () => {
    try {
      const result = await window.electronAPI.getCurrentUser();
      console.log('user result', result);
      if (result.success) {
        setCurrentUser(result.data!);
        loadProjects();
      }
    } catch (error) {
      console.error('Error checking current user:', error);
    } finally {
      setLoading(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    // Check if user is already logged in
    checkCurrentUser();
  }, [checkCurrentUser]);

  const handleLogin = (userAuth: User) => {
    setCurrentUser(userAuth);
    loadProjects();
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.logout();
      setCurrentUser(null);
      setProjects([]);
      setSelectedProject(null);
      setMediaAssets([]);
      setSelectedMedia(null);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleCreateProject = async () => {
    try {
      const projectData = {
        name: `New Project ${Date.now()}`,
        description: 'A new collaborative video project',
      };

      const result = await window.electronAPI.createProject(projectData);
      if (result.success) {
        loadProjects(); // Refresh project list
        alert('Project created successfully!');
      } else {
        alert('Failed to create project: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert('An error occurred while creating the project');
    }
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSelectedMedia(null);
    if (project.id) {
      loadMediaAssets(project.id);
    }
  };

  const handleSelectMedia = (media: MediaAsset) => {
    setSelectedMedia(media);
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>CollabCut</h1>
          <p>Real-time collaborative video editing platform</p>
          <LoginForm onLogin={handleLogin} />
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="app-layout">
        {/* Discord-style sidebar */}
        <div className="sidebar">
          <ProjectPanel
            projects={projects}
            currentUser={currentUser}
            selectedProject={selectedProject}
            onCreateProject={handleCreateProject}
            onSelectProject={handleSelectProject}
            onLogout={handleLogout}
          />
        </div>

        {/* Main content area */}
        <div className="main-content">
          <div className="content-header">
            <h1>CollabCut</h1>
            <p>
              Welcome,{' '}
              {currentUser.user.display_name || currentUser.user.username}!
            </p>
          </div>

          <div className="content-body">
            {!selectedProject ? (
              <div className="empty-state">
                <h2>No project selected</h2>
                <p>Select a project from the sidebar to start editing</p>
                {projects.length === 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={handleCreateProject}
                  >
                    Create New Project
                  </button>
                )}
              </div>
            ) : (
              <div className="projects-workspace">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-discord-text-primary mb-2">
                    {selectedProject.name}
                  </h2>
                  <p className="text-discord-text-muted mb-4">
                    {selectedProject.description}
                  </p>
                  <div className="flex gap-4 items-center">
                    <span className="px-3 py-1 bg-discord-bg-accent rounded text-sm text-discord-text-muted">
                      {selectedProject.type === 'cloud'
                        ? '☁️ Cloud'
                        : '💻 Local'}
                    </span>
                    <span className="px-3 py-1 bg-discord-bg-accent rounded text-sm text-discord-text-muted">
                      Created:{' '}
                      {new Date(
                        selectedProject.created_at
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Media Assets Section */}
                <div className="media-section">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-discord-text-primary">
                      Media Assets
                    </h3>
                    <Button
                      onClick={() => {
                        /* TODO: 파일 업로드 기능 */
                      }}
                      className="text-sm"
                    >
                      📁 Add Media
                    </Button>
                  </div>

                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-discord-text-muted">
                        Loading media assets...
                      </div>
                    </div>
                  ) : mediaAssets.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-4">📁</div>
                      <h4 className="text-lg font-medium text-discord-text-secondary mb-2">
                        No media assets
                      </h4>
                      <p className="text-discord-text-muted mb-4">
                        Upload your first video, audio, or image file to get
                        started.
                      </p>
                      <Button
                        onClick={() => {
                          /* TODO: 파일 업로드 기능 */
                        }}
                      >
                        Upload Media
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {mediaAssets.map((asset) => (
                        <MediaAssetCard
                          key={asset.id}
                          asset={asset}
                          onSelect={handleSelectMedia}
                          isSelected={selectedMedia?.id === asset.id}
                          onEdit={(asset) => {
                            console.log('Edit asset:', asset);
                            // TODO: 편집 기능 구현
                          }}
                          onDelete={(assetId) => {
                            console.log('Delete asset:', assetId);
                            // TODO: 삭제 기능 구현
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
