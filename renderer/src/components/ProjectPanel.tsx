import React, { useState } from 'react';
import { Button } from './ui/button';
import SearchBar from './SearchBar';
import FolderTree from './FolderTree';

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

interface ProjectPanelProps {
  projects: Project[];
  currentUser: User;
  selectedProject?: Project | null;
  onCreateProject: () => void;
  onSelectProject: (project: Project) => void;
  onLogout: () => void;
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({
  projects,
  currentUser,
  selectedProject,
  onCreateProject,
  onSelectProject,
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCloudProjects, setShowCloudProjects] = useState(true);
  const [showLocalProjects, setShowLocalProjects] = useState(true);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      (project.type === 'cloud' && showCloudProjects) ||
      (project.type === 'local' && showLocalProjects) ||
      (!project.type && showLocalProjects); // 기본값은 local

    return matchesSearch && matchesType;
  });

  return (
    <div className="project-panel">
      {/* User section */}
      <div className="user-section">
        <div className="user-info">
          <div className="user-avatar">
            {(currentUser.user.display_name ||
              currentUser.user.username)[0].toUpperCase()}
          </div>
          <div className="user-details">
            <span className="user-name">
              {currentUser.user.display_name || currentUser.user.username}
            </span>
            <span className="user-status">Online</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="logout-btn"
        >
          ⚙️
        </Button>
      </div>

      {/* Search and filters */}
      <div className="search-section">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search projects..."
        />

        <div className="filter-toggles">
          <Button
            variant={showLocalProjects ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowLocalProjects(!showLocalProjects)}
            className="filter-btn"
          >
            💻 Local
          </Button>
          <Button
            variant={showCloudProjects ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowCloudProjects(!showCloudProjects)}
            className="filter-btn"
          >
            ☁️ Cloud
          </Button>
        </div>
      </div>

      {/* Projects list */}
      <div className="projects-section">
        <div className="projects-header">
          <h3>Projects</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCreateProject}
            className="add-project-btn"
          >
            +
          </Button>
        </div>

        <div className="projects-list">
          {filteredProjects.length === 0 ? (
            <div className="empty-projects">
              {projects.length === 0 ? (
                <p>No projects yet. Create your first project!</p>
              ) : (
                <p>No projects match your search criteria.</p>
              )}
            </div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className={`project-item ${selectedProject?.id === project.id ? 'selected' : ''}`}
                onClick={() => onSelectProject(project)}
              >
                <div className="project-icon">
                  {project.type === 'cloud' ? '☁️' : '💻'}
                </div>
                <div className="project-details">
                  <div className="project-name">{project.name}</div>
                  <div className="project-description">
                    {project.description.length > 50
                      ? `${project.description.substring(0, 50)}...`
                      : project.description}
                  </div>
                  <div className="project-date">
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Project content section - only show when project is selected */}
      {selectedProject && (
        <div className="project-content-section">
          <div className="section-tabs">
            <Button variant="ghost" size="sm" className="tab-btn active">
              📁 Files
            </Button>
            <Button variant="ghost" size="sm" className="tab-btn">
              🎬 Media
            </Button>
          </div>

          <div className="folder-tree-container">
            <FolderTree
              nodes={[
                {
                  id: 'videos',
                  name: 'Videos',
                  type: 'folder',
                  children: [
                    {
                      id: 'video1',
                      name: 'intro.mp4',
                      type: 'file',
                      fileType: 'video',
                      size: 1024000,
                    },
                  ],
                },
                {
                  id: 'audio',
                  name: 'Audio',
                  type: 'folder',
                  children: [],
                },
                {
                  id: 'images',
                  name: 'Images',
                  type: 'folder',
                  children: [],
                },
              ]}
              selectedNodeId=""
              onSelectNode={(node) => console.log('Selected node:', node)}
              onCreateFolder={(parentId, name) =>
                console.log('Create folder:', parentId, name)
              }
              onUploadFile={(parentId, files) =>
                console.log('Upload files:', parentId, files)
              }
            />
          </div>
        </div>
      )}

      {/* Recent activity section */}
      <div className="activity-section">
        <h4>Recent Activity</h4>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-icon">📝</div>
            <div className="activity-text">
              <span>Project created</span>
              <span className="activity-time">2 hours ago</span>
            </div>
          </div>
          <div className="activity-item">
            <div className="activity-icon">🎬</div>
            <div className="activity-text">
              <span>Video uploaded</span>
              <span className="activity-time">5 hours ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectPanel;
