// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface AskResponse {
  success: boolean;
  question: string;
  answer: string;
  citations: number[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  relevantSlides: {
    slideNumber: number;
    documentName: string;
    preview: string;
  }[];
  keyPoints: string[];
  additionalNotes?: string;
  responseTime: number;
  error?: string;
}

export interface StatsResponse {
  totalDocuments: number;
  totalChunks: number;
  databaseSizeMB: string;
  documents: {
    id: string;
    name: string;
    total_pages: number;
    total_chunks: number;
    upload_date: string;
  }[];
  questionsToday: number;
  totalQuestions: number;
  avgResponseTime: number;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  documentId: string;
  slidesCount: number;
  chunksCount: number;
  totalDocuments: number;
  totalChunks: number;
  error?: string;
}

// Ask a question
export async function askQuestion(
  question: string,
  sessionId?: string
): Promise<AskResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question,
      sessionId,
      useIntelligent: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Get stats
export async function getStats(): Promise<StatsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/admin/smart/stats`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Upload PDF
export async function uploadPDF(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch(`${API_BASE_URL}/api/admin/smart/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Delete document
export async function deleteDocument(docId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/admin/smart/documents/${docId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Clear all documents
export async function clearAllDocuments(): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/admin/smart/clear`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
