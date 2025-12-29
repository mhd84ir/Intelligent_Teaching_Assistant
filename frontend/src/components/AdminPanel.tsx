'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Database, 
  Clock, 
  HelpCircle,
  CheckCircle,
  AlertCircle,
  X,
  Loader2
} from 'lucide-react';
import { getStats, uploadPDF, deleteDocument, StatsResponse } from '@/lib/api';

export default function AdminPanel() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError('خطا در دریافت اطلاعات');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.includes('pdf')) {
      setError('فقط فایل‌های PDF مجاز هستند');
      return;
    }

    setUploadProgress('در حال آپلود...');
    setError(null);
    setSuccess(null);

    try {
      const result = await uploadPDF(file);
      if (result.success) {
        setSuccess(`✅ ${result.slidesCount} اسلاید به ${result.chunksCount} chunk تبدیل شد`);
        fetchStats();
      } else {
        setError(result.error || 'خطا در آپلود');
      }
    } catch (err) {
      setError('خطا در آپلود فایل');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDelete = async (docId: string, docName: string) => {
    if (!confirm(`آیا از حذف "${docName}" مطمئن هستید؟`)) return;

    try {
      await deleteDocument(docId);
      setSuccess('سند با موفقیت حذف شد');
      fetchStats();
    } catch (err) {
      setError('خطا در حذف سند');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            پنل مدیریت
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            مدیریت پایگاه دانش و آپلود اسلایدها
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="text-red-700 dark:text-red-300">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-red-600" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-300">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto">
              <X className="w-4 h-4 text-green-600" />
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">اسناد</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalDocuments ?? '-'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Chunks</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.totalChunks ?? '-'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <HelpCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">سوالات امروز</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.questionsToday ?? '-'}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">میانگین پاسخ</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats?.avgResponseTime ? `${(stats.avgResponseTime / 1000).toFixed(1)}s` : '-'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              آپلود PDF جدید
            </h2>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
              }`}
            >
              {uploadProgress ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-gray-600 dark:text-gray-400">{uploadProgress}</p>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    فایل PDF را اینجا بکشید یا کلیک کنید
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
                  >
                    انتخاب فایل
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Documents List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                اسناد موجود
              </h2>
              <button
                onClick={fetchStats}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {isLoading && !stats ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : stats?.documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                هنوز سندی آپلود نشده
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {stats?.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    <FileText className="w-8 h-8 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {doc.name.replace(/^upload_\d+_/, '')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.total_pages} صفحه • {doc.total_chunks} chunk
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(doc.id, doc.name)}
                      className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
