import React, { useState } from 'react';

interface User {
  user: {
    display_name?: string;
    username: string;
  };
}

interface LoginFormProps {
  onLogin: (user: User) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      setError('Please enter a user ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.login(userId.trim());
      if (result.success && result.data) {
        onLogin(result.data);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form">
      <h2>Login to CollabCut</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="userId">User ID:</label>
          <input
            type="text"
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter your user ID"
            disabled={loading}
          />
        </div>
        {error && <div className="error-message">{error}</div>}
        <button type="submit" disabled={loading || !userId.trim()}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <div className="demo-info">
        <p>
          <strong>Demo용 사용자 ID:</strong>
        </p>
        <p>
          임시로 아무 문자열이나 입력하면 됩니다 (예: "user1", "demo", "test")
        </p>
      </div>
    </div>
  );
};

export default LoginForm;
