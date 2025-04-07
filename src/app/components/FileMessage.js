'use client'

import { useState } from 'react'
import { Download, File, Image as ImageIcon } from 'lucide-react'
import subworldNetwork from '../../utils/SubworldNetworkService'

export default function FileMessage({ message, formatMessageTime, currentUserKey }) {
    const [downloading, setDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    const isSentByCurrentUser = message.sender === currentUserKey;
    const isImage = message.fileType && message.fileType.startsWith('image/');

    const getFileIcon = () => {
        if (isImage) {
            return <ImageIcon size={32} className="text-blue-300 flex-shrink-0" />;
        }
        return <File size={32} className="text-gray-300 flex-shrink-0" />;
    };

    const handleDownload = async () => {
        try {
            setDownloading(true);
            setDownloadProgress(10);

            // Get user ID from the message
            const userID = message.recipient === currentUserKey ?
                message.recipient : message.sender;

            console.log('Downloading file for user ID:', userID, 'File ID:', message.fileID);

            if (message.fileID) {
                setDownloadProgress(30);

                // Download the file contents directly (skip metadata fetch to simplify)
                console.log('Starting file download...');
                const fileBlob = await subworldNetwork.downloadFile(userID, message.fileID);
                console.log('File downloaded, size:', fileBlob.size, 'bytes, type:', fileBlob.type);
                setDownloadProgress(90);

                // Create a download link with the file's original mime type
                const url = URL.createObjectURL(fileBlob);

                // Create download link and trigger download
                const link = document.createElement('a');
                link.href = url;
                link.download = message.fileName || 'download.file';

                // Log download details
                console.log('Download link created:', {
                    filename: link.download,
                    type: fileBlob.type,
                    size: fileBlob.size
                });

                // Add to DOM, click, and remove
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Clean up object URL after a delay
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    console.log('Object URL revoked');
                }, 100);

                setDownloadProgress(100);
            }
            else {
                throw new Error('No file data available');
            }
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Failed to download file. Please try again.');
        } finally {
            setDownloading(false);
            setTimeout(() => setDownloadProgress(0), 1000);
        }
    };

    // Helper to get file icon/type display
    const getFileTypeDisplay = () => {
        const type = message.fileType || '';

        if (type.startsWith('image/')) return 'Image';
        if (type.startsWith('video/')) return 'Video';
        if (type.startsWith('audio/')) return 'Audio';
        if (type.startsWith('text/')) return 'Text';
        if (type.includes('pdf')) return 'PDF';
        if (type.includes('word') || type.includes('document')) return 'Document';
        if (type.includes('excel') || type.includes('spreadsheet')) return 'Spreadsheet';

        return 'File';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '';

        if (bytes < 1024) return bytes + ' bytes';
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    };

    return (
        <div className={`file-message mb-6 ${isSentByCurrentUser ? 'text-right' : ''}`}>
            <div
                className={`inline-block overflow-hidden rounded-2xl ${isSentByCurrentUser ? 'bg-blue-600' : 'bg-gray-800'}`}
            >
                <div className="p-4">
                    <div className="flex items-center space-x-3">
                        {getFileIcon()}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate max-w-[200px] text-left">{message.fileName}</div>
                            <div className="text-xs text-gray-400/80 text-left">
                                {getFileTypeDisplay()} • {formatFileSize(message.fileSize)}
                            </div>
                        </div>
                    </div>

                    {downloadProgress > 0 && downloadProgress < 100 && (
                        <div className="mt-3 w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                            <div
                                className="bg-blue-500 h-full transition-all duration-300 ease-out"
                                style={{ width: `${downloadProgress}%` }}
                            ></div>
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="mt-3 w-full py-2 px-3 flex items-center justify-center rounded-lg bg-blue-500/30 hover:bg-blue-500/50 transition-colors"
                    >
                        {downloading ? (
                            <span className="flex items-center">
                                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                Downloading...
                            </span>
                        ) : (
                            <span className="flex items-center">
                                <Download size={16} className="mr-2" />
                                Download {isImage ? 'Image' : 'File'}
                            </span>
                        )}
                    </button>
                </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
                {formatMessageTime(message.timestamp)}
            </div>
        </div>
    );
}