import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    // Check if user is already logged in
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const result = await window.electronAPI.getCurrentUser();
      console.log('user result', result);
      if (result.success) {
        setCurrentUser(result.data);
        loadProjects();
      }
    } catch (error) {
      console.error('Error checking current user:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const result = await window.electronAPI.listProjects();
      console.log('project result', result);
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const handleLogin = (userAuth) => {
    setCurrentUser(userAuth);
    loadProjects();
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.logout();
      setCurrentUser(null);
      setProjects([]);
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
      <header className="App-header">
        <div className="user-info">
          <h1>CollabCut</h1>
          <p>
            Welcome,{' '}
            {currentUser.user.display_name || currentUser.user.username}!
          </p>
          <button onClick={handleLogout} className="btn btn-logout">
            Logout
          </button>
        </div>

        <div className="welcome-section">
          <h2>Your Projects</h2>
          <div className="action-buttons">
            <button className="btn btn-primary" onClick={handleCreateProject}>
              Create New Project
            </button>
          </div>

          <div className="projects-list">
            {projects.length === 0 ? (
              <p>No projects yet. Create your first project!</p>
            ) : (
              <ul>
                {projects.map((project) => (
                  <li key={project.id} className="project-item">
                    <h3>{project.name}</h3>
                    <p>{project.description}</p>
                    <small>
                      Created:{' '}
                      {new Date(project.created_at).toLocaleDateString()}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}

export default App;
