import { createContext, useContext, useState, useRef } from 'react';
import type { ScannedItem } from '../types/index';

export type Path = 'single' | 'batch';
export type Step = 'choose' | 'drop' | 'reading' | 'meet' | 'saving' | 'welcomed';

export interface ReviewItem {
  scanned:        ScannedItem;
  selected:       boolean;
  editedName:     string;
  editedCategory: string;
  editedColor:    string;
  editedOccasion: string;
  editedSeason:   string;
  editedStyle:    string;
}

export interface BatchProgress { current: number; total: number; failed: number; }

interface UploadState {
  step:          Step;
  path:          Path;
  reviewItem:    ReviewItem | null;
  batchItems:    ReviewItem[];
  batchProgress: BatchProgress | null;
  batchJobId:    string | null;
  savedCount:    number;
  notice:        string | null;
  batchPreviews: string[];
  fileRef:       React.RefObject<HTMLInputElement>;

  setStep:          (s: Step)                 => void;
  setPath:          (p: Path)                 => void;
  setReviewItem:    (r: ReviewItem | null)    => void;
  setBatchItems:    React.Dispatch<React.SetStateAction<ReviewItem[]>>;
  setBatchProgress: (p: BatchProgress | null) => void;
  setBatchJobId:    (id: string | null)       => void;
  setSavedCount:    (n: number)               => void;
  setNotice:        (n: string | null)        => void;
  setBatchPreviews: (p: string[])             => void;
  reset:            ()                        => void;
}

const UploadContext = createContext<UploadState | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [step,          setStep]          = useState<Step>('choose');
  const [path,          setPath]          = useState<Path>('single');
  const [reviewItem,    setReviewItem]    = useState<ReviewItem | null>(null);
  const [batchItems,    setBatchItems]    = useState<ReviewItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchJobId,    setBatchJobId]    = useState<string | null>(null);
  const [savedCount,    setSavedCount]    = useState(0);
  const [notice,        setNotice]        = useState<string | null>(null);
  const [batchPreviews, setBatchPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep('choose');
    setPath('single');
    setReviewItem(null);
    setBatchItems([]);
    setBatchProgress(null);
    setBatchJobId(null);
    setSavedCount(0);
    setNotice(null);
    setBatchPreviews([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <UploadContext.Provider value={{
      step, path, reviewItem, batchItems, batchProgress,
      batchJobId, savedCount, notice, batchPreviews, fileRef,
      setStep, setPath, setReviewItem, setBatchItems, setBatchProgress,
      setBatchJobId, setSavedCount, setNotice, setBatchPreviews,
      reset,
    }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider');
  return ctx;
}
