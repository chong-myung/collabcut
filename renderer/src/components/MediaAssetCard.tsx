import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration?: number; // in seconds
  size: number; // in bytes
  thumbnailUrl?: string;
  uploadedAt: Date;
  uploadedBy: string;
  description?: string;
  tags?: string[];
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number; // 0-100 for uploading/processing
}

interface MediaAssetCardProps {
  asset: MediaAsset;
  onSelect?: (asset: MediaAsset) => void;
  onDelete?: (assetId: string) => void;
  onEdit?: (asset: MediaAsset) => void;
  isSelected?: boolean;
  isDragging?: boolean;
  onDragStart?: (asset: MediaAsset) => void;
  onDragEnd?: () => void;
}

const MediaAssetCard: React.FC<MediaAssetCardProps> = ({
  asset,
  onSelect,
  onDelete,
  onEdit,
  isSelected = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return '🎬';
      case 'audio':
        return '🎵';
      case 'image':
        return '🖼️';
      default:
        return '📎';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'text-blue-400';
      case 'processing':
        return 'text-yellow-400';
      case 'ready':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-discord-text-faint';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'ready':
        return 'Ready';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (asset.status !== 'ready') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    onDragStart?.(asset);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
  };

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:bg-discord-bg-accent ${isSelected ? 'ring-2 ring-discord-brand' : ''} ${isDragging ? 'opacity-50' : ''} media-asset-card`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect?.(asset)}
      draggable={asset.status === 'ready'}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getTypeIcon(asset.type)}</span>
            <CardTitle className="text-sm font-medium truncate">
              {asset.name}
            </CardTitle>
          </div>
          {isHovered && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(!showDetails);
                }}
                title="Show details"
              >
                ℹ️
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(asset);
                }}
                title="Edit"
              >
                ✏️
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(asset.id);
                }}
                title="Delete"
              >
                🗑️
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Thumbnail or preview */}
        <div className="media-preview">
          {asset.thumbnailUrl ? (
            <img
              src={asset.thumbnailUrl}
              alt={asset.name}
              className="w-full h-24 object-cover rounded"
            />
          ) : (
            <div className="w-full h-24 bg-discord-bg-accent rounded flex items-center justify-center">
              <span className="text-3xl">{getTypeIcon(asset.type)}</span>
            </div>
          )}

          {/* Duration overlay for video/audio */}
          {asset.duration && (
            <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
              {formatDuration(asset.duration)}
            </div>
          )}
        </div>

        {/* Status and progress */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${getStatusColor(asset.status)}`}>
              {getStatusText(asset.status)}
            </span>
            <span className="text-xs text-discord-text-faint">
              {formatFileSize(asset.size)}
            </span>
          </div>

          {/* Progress bar for uploading/processing */}
          {(asset.status === 'uploading' || asset.status === 'processing') &&
            asset.progress !== undefined && (
              <div className="w-full bg-discord-bg-accent rounded-full h-1">
                <div
                  className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${asset.progress}%` }}
                />
              </div>
            )}

          {/* Tags */}
          {asset.tags && asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {asset.tags.slice(0, 3).map((tag, index) => (
                <span
                  key={index}
                  className="text-xs bg-discord-bg-accent text-discord-text-muted px-1 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
              {asset.tags.length > 3 && (
                <span className="text-xs text-discord-text-faint">
                  +{asset.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Detailed info (expandable) */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-discord-border space-y-1">
            <div className="text-xs text-discord-text-faint">
              <div>Uploaded by: {asset.uploadedBy}</div>
              <div>Date: {asset.uploadedAt.toLocaleDateString()}</div>
              {asset.description && (
                <div className="mt-1">
                  <div className="font-medium">Description:</div>
                  <div className="text-discord-text-muted">
                    {asset.description}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MediaAssetCard;
