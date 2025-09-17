import React, { useState } from 'react';
import { Button } from './ui/button';

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  size?: number;
  modifiedAt?: Date;
  fileType?: 'video' | 'audio' | 'image' | 'document' | 'other';
}

interface FolderTreeProps {
  nodes: TreeNode[];
  onSelectNode?: (node: TreeNode) => void;
  selectedNodeId?: string;
  onCreateFolder?: (parentId: string, name: string) => void;
  onUploadFile?: (parentId: string, files: FileList) => void;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  nodes,
  onSelectNode,
  selectedNodeId,
  onCreateFolder,
  onUploadFile,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const toggleExpanded = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleCreateFolder = (parentId: string) => {
    setNewFolderParent(parentId);
    setNewFolderName('');
  };

  const confirmCreateFolder = () => {
    if (newFolderParent && newFolderName.trim() && onCreateFolder) {
      onCreateFolder(newFolderParent, newFolderName.trim());
      setNewFolderParent(null);
      setNewFolderName('');
    }
  };

  const cancelCreateFolder = () => {
    setNewFolderParent(null);
    setNewFolderName('');
  };

  const handleFileUpload = (
    parentId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0 && onUploadFile) {
      onUploadFile(parentId, files);
    }
  };

  const getFileIcon = (node: TreeNode) => {
    if (node.type === 'folder') {
      return expandedNodes.has(node.id) ? '📂' : '📁';
    }

    switch (node.fileType) {
      case 'video':
        return '🎬';
      case 'audio':
        return '🎵';
      case 'image':
        return '🖼️';
      case 'document':
        return '📄';
      default:
        return '📎';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="tree-node">
        <div
          className={`tree-node-header ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => onSelectNode?.(node)}
        >
          <div className="tree-node-content">
            {node.type === 'folder' && hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(node.id);
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </Button>
            )}
            <span className="file-icon">{getFileIcon(node)}</span>
            <span className="file-name">{node.name}</span>
            {node.type === 'file' && node.size && (
              <span className="file-size">{formatFileSize(node.size)}</span>
            )}
          </div>

          {node.type === 'folder' && (
            <div className="tree-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateFolder(node.id);
                }}
                title="Create folder"
              >
                📁+
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById(`upload-${node.id}`)?.click();
                }}
                title="Upload file"
              >
                📤
              </Button>
              <input
                id={`upload-${node.id}`}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(node.id, e)}
              />
            </div>
          )}
        </div>

        {newFolderParent === node.id && (
          <div
            className="new-folder-input"
            style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmCreateFolder();
                } else if (e.key === 'Escape') {
                  cancelCreateFolder();
                }
              }}
            />
            <Button size="sm" onClick={confirmCreateFolder}>
              ✓
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelCreateFolder}>
              ✕
            </Button>
          </div>
        )}

        {isExpanded && hasChildren && (
          <div className="tree-children">
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-tree">
      <div className="tree-header">
        <h4>Project Files</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleCreateFolder('root')}
          title="Create root folder"
        >
          📁+
        </Button>
      </div>
      <div className="tree-content">
        {nodes.map((node) => renderNode(node))}
        {newFolderParent === 'root' && (
          <div className="new-folder-input" style={{ paddingLeft: '8px' }}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmCreateFolder();
                } else if (e.key === 'Escape') {
                  cancelCreateFolder();
                }
              }}
            />
            <Button size="sm" onClick={confirmCreateFolder}>
              ✓
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelCreateFolder}>
              ✕
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FolderTree;
