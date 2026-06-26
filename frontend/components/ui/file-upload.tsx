'use client';

import { UploadCloud } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/format';

type FileStatus = 'idle' | 'dragging' | 'uploading' | 'error';

interface FileError {
  message: string;
  code: string;
}

export interface FileUploadProps {
  onUploadSuccess?: (file: File) => void;
  onUploadError?: (error: FileError) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number;
  currentFile?: File | null;
  onFileRemove?: () => void;
  /** ms for upload animation. 0 = instant. Defaults to 400ms */
  uploadDelay?: number;
  validateFile?: (file: File) => FileError | null;
  className?: string;
}

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const UPLOAD_STEP_SIZE = 5;
const FILE_SIZES = ['Bytes', 'KB', 'MB', 'GB'] as const;

const formatBytes = (bytes: number, decimals = 1): string => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unit = FILE_SIZES[i] ?? FILE_SIZES[FILE_SIZES.length - 1];
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${unit}`;
};

const UploadIllustration = () => (
  <div className="relative h-16 w-16">
    <svg aria-label="Upload illustration" className="h-full w-full" fill="none" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" strokeDasharray="4 4" strokeWidth="2" stroke="rgba(255,255,255,0.12)">
        <animateTransform attributeName="transform" dur="60s" from="0 50 50" repeatCount="indefinite" to="360 50 50" type="rotate" />
      </circle>
      <path
        fill="rgba(94,198,255,0.12)"
        stroke="var(--cyan)"
        d="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z"
        strokeWidth="2"
      >
        <animate attributeName="d" dur="2s" repeatCount="indefinite" values="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z;M30 38H70C75 38 75 43 75 43V68C75 73 70 73 70 73H30C25 73 25 68 25 68V43C25 38 30 38 30 38Z;M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z" />
      </path>
      <path stroke="var(--cyan)" d="M30 35C30 35 35 35 40 35C45 35 45 30 50 30C55 30 55 35 60 35C65 35 70 35 70 35" fill="none" strokeWidth="2" />
      <g className="translate-y-2 transform">
        <line stroke="var(--cyan)" strokeLinecap="round" strokeWidth="2" x1="50" x2="50" y1="45" y2="60">
          <animate attributeName="y2" dur="2s" repeatCount="indefinite" values="60;55;60" />
        </line>
        <polyline stroke="var(--cyan)" fill="none" points="42,52 50,45 58,52" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <animate attributeName="points" dur="2s" repeatCount="indefinite" values="42,52 50,45 58,52;42,47 50,40 58,47;42,52 50,45 58,52" />
        </polyline>
      </g>
    </svg>
  </div>
);

const UploadingAnimation = ({ progress }: { progress: number }) => (
  <div className="relative h-16 w-16">
    <svg aria-label={`Upload progress: ${Math.round(progress)}%`} className="h-full w-full" fill="none" viewBox="0 0 240 240">
      <defs>
        <mask id="progress-mask">
          <rect fill="black" height="240" width="240" />
          <circle cx="120" cy="120" fill="white" r="120"
            strokeDasharray={`${(progress / 100) * 754}, 754`}
            transform="rotate(-90 120 120)" />
        </mask>
      </defs>
      <style>{`
        @keyframes rotate-cw { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes rotate-ccw { from{transform:rotate(360deg)} to{transform:rotate(0deg)} }
        .g-spin circle { transform-origin:120px 120px }
        .g-spin circle:nth-child(odd)  { animation:rotate-cw  8s linear infinite }
        .g-spin circle:nth-child(even) { animation:rotate-ccw 8s linear infinite }
        .g-spin circle:nth-child(2n){animation-delay:0.2s}
        .g-spin circle:nth-child(3n){animation-delay:0.3s}
        .g-spin circle:nth-child(5n){animation-delay:0.5s}
      `}</style>
      <g className="g-spin" mask="url(#progress-mask)" strokeDasharray="18% 40%" strokeWidth="10">
        <circle cx="120" cy="120" opacity="0.95" r="150" stroke="#5EC6FF" />
        <circle cx="120" cy="120" opacity="0.95" r="140" stroke="#a78bfa" />
        <circle cx="120" cy="120" opacity="0.95" r="130" stroke="#5EC6FF" />
        <circle cx="120" cy="120" opacity="0.95" r="120" stroke="#c084fc" />
        <circle cx="120" cy="120" opacity="0.95" r="110" stroke="#38bdf8" />
        <circle cx="120" cy="120" opacity="0.95" r="100" stroke="#818cf8" />
        <circle cx="120" cy="120" opacity="0.95" r="90"  stroke="#5EC6FF" />
        <circle cx="120" cy="120" opacity="0.95" r="80"  stroke="#a78bfa" />
        <circle cx="120" cy="120" opacity="0.95" r="70"  stroke="#38bdf8" />
        <circle cx="120" cy="120" opacity="0.95" r="60"  stroke="#c084fc" />
        <circle cx="120" cy="120" opacity="0.95" r="50"  stroke="#5EC6FF" />
        <circle cx="120" cy="120" opacity="0.95" r="40"  stroke="#818cf8" />
        <circle cx="120" cy="120" opacity="0.95" r="30"  stroke="#38bdf8" />
        <circle cx="120" cy="120" opacity="0.95" r="20"  stroke="#a78bfa" />
      </g>
    </svg>
  </div>
);

export function FileUpload({
  onUploadSuccess = () => {},
  onUploadError = () => {},
  acceptedFileTypes = [],
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  currentFile: initialFile = null,
  onFileRemove = () => {},
  uploadDelay = 400,
  validateFile = () => null,
  className,
}: FileUploadProps) {
  const [file, setFile] = useState<File | null>(initialFile);
  const [status, setStatus] = useState<FileStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<FileError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
  }, []);

  const validateFileSize = useCallback((f: File): FileError | null => {
    if (f.size > maxFileSize) return { message: `File size exceeds ${formatBytes(maxFileSize)}`, code: 'FILE_TOO_LARGE' };
    return null;
  }, [maxFileSize]);

  const validateFileType = useCallback((f: File): FileError | null => {
    if (!acceptedFileTypes?.length) return null;
    const fileType = f.type.toLowerCase();
    if (!acceptedFileTypes.some((t) => fileType.match(t.toLowerCase()))) {
      return { message: `File type must be ${acceptedFileTypes.join(', ')}`, code: 'INVALID_FILE_TYPE' };
    }
    return null;
  }, [acceptedFileTypes]);

  const handleError = useCallback((err: FileError) => {
    setError(err);
    setStatus('error');
    onUploadError?.(err);
    setTimeout(() => { setError(null); setStatus('idle'); }, 3000);
  }, [onUploadError]);

  const simulateUpload = useCallback((uploadingFile: File) => {
    let currentProgress = 0;
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);

    const delay = Math.max(uploadDelay, 1);
    uploadIntervalRef.current = setInterval(() => {
      currentProgress += UPLOAD_STEP_SIZE;
      if (currentProgress >= 100) {
        if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
        setProgress(0);
        setStatus('idle');
        setFile(null);
        onUploadSuccess?.(uploadingFile);
      } else {
        setStatus((prev) => {
          if (prev === 'uploading') { setProgress(currentProgress); return 'uploading'; }
          if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
          return prev;
        });
      }
    }, delay / (100 / UPLOAD_STEP_SIZE));
  }, [onUploadSuccess, uploadDelay]);

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return;
    setError(null);
    const sizeError = validateFileSize(selectedFile);
    if (sizeError) { handleError(sizeError); return; }
    const typeError = validateFileType(selectedFile);
    if (typeError) { handleError(typeError); return; }
    const customError = validateFile?.(selectedFile);
    if (customError) { handleError(customError); return; }
    setFile(selectedFile);
    setStatus('uploading');
    setProgress(0);
    simulateUpload(selectedFile);
  }, [simulateUpload, validateFileSize, validateFileType, validateFile, handleError]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setStatus((prev) => (prev !== 'uploading' ? 'dragging' : prev));
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setStatus((prev) => (prev === 'dragging' ? 'idle' : prev));
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (status === 'uploading') return;
    setStatus('idle');
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [status, handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    handleFileSelect(selectedFile || null);
    if (e.target) e.target.value = '';
  }, [handleFileSelect]);

  const triggerFileInput = useCallback(() => {
    if (status === 'uploading') return;
    fileInputRef.current?.click();
  }, [status]);

  const resetState = useCallback(() => {
    setFile(null); setStatus('idle'); setProgress(0);
    onFileRemove?.();
  }, [onFileRemove]);

  return (
    <div className={cn('relative w-full', className)}>
      {/* outer frame */}
      <div className="group relative w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5">
        <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-[var(--cyan)]/20 to-transparent" />

        <div className="relative w-full rounded-[10px] bg-white/[0.02] p-1.5">
          <div className={cn(
            'relative mx-auto w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]/60',
            error ? 'border-[var(--red)]/50' : '',
          )}>
            {/* drag overlay */}
            <div className={cn('absolute inset-0 transition-opacity duration-300', status === 'dragging' ? 'opacity-100' : 'opacity-0')}>
              <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-[var(--cyan)]/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-[20%] bg-gradient-to-t from-[var(--cyan)]/10 to-transparent" />
              <div className="absolute inset-y-0 left-0 w-[20%] bg-gradient-to-r from-[var(--cyan)]/10 to-transparent" />
              <div className="absolute inset-y-0 right-0 w-[20%] bg-gradient-to-l from-[var(--cyan)]/10 to-transparent" />
              <div className="absolute inset-[20%] animate-pulse rounded-lg bg-[var(--cyan)]/5" />
            </div>

            <div className="relative h-[220px]">
              <AnimatePresence mode="wait">
                {status === 'idle' || status === 'dragging' ? (
                  <motion.div
                    key="dropzone"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: status === 'dragging' ? 0.8 : 1, y: 0, scale: status === 'dragging' ? 0.98 : 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-6"
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <div className="mb-4"><UploadIllustration /></div>

                    <div className="mb-4 space-y-1 text-center">
                      <h3 className="font-semibold text-[var(--text)] text-sm tracking-tight">
                        Drag and drop your resume
                      </h3>
                      <p className="text-[var(--muted)] text-xs">
                        {acceptedFileTypes?.length
                          ? acceptedFileTypes.map((t) => t.replace('.', '')).join(', ').toUpperCase()
                          : 'PDF, DOCX, TXT'}
                        {maxFileSize ? ` · up to ${formatBytes(maxFileSize)}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={triggerFileInput}
                      className="group flex w-4/5 items-center justify-center gap-2 rounded-lg border border-[var(--border-bright)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-all duration-200 hover:border-white/25 hover:bg-white/[0.08]"
                    >
                      <span>Choose File</span>
                      <UploadCloud className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={acceptedFileTypes?.join(',')}
                      aria-label="File input"
                      className="sr-only"
                      onChange={handleFileInputChange}
                    />
                  </motion.div>
                ) : status === 'uploading' ? (
                  <motion.div
                    key="uploading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-6"
                  >
                    <div className="mb-4"><UploadingAnimation progress={progress} /></div>

                    <div className="mb-4 space-y-1 text-center">
                      <h3 className="truncate font-semibold text-[var(--text)] text-sm">{file?.name}</h3>
                      <div className="flex items-center justify-center gap-2 text-xs">
                        <span className="text-[var(--muted)]">{formatBytes(file?.size ?? 0)}</span>
                        <span className="font-medium text-[var(--cyan)]">{Math.round(progress)}%</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetState}
                      className="flex w-4/5 items-center justify-center gap-2 rounded-lg border border-[var(--border-bright)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-[var(--muted2)] transition-all duration-200 hover:text-[var(--text)]"
                    >
                      Cancel
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--red)]/20 bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-2"
                >
                  <p className="text-[var(--red)] text-sm">{error.message}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileUpload;
