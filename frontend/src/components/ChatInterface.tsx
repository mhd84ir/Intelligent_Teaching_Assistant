'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { askQuestion, AskResponse } from '@/lib/api';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: AskResponse;
}

// Detect if text contains Persian/Arabic characters
function isPersian(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// Generate session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(generateSessionId);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askQuestion(input.trim(), sessionId);

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        type: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        data: response,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        type: 'assistant',
        content: '❌ متأسفانه خطایی رخ داد. لطفاً دوباره تلاش کنید.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(expandedSources === messageId ? null : messageId);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              دستیار آموزشی هوشمند
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Intelligent Teaching Assistant
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
                <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                سلام! 👋
              </h2>
              <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                من دستیار آموزشی هوشمند شما هستم. هر سوالی از مطالب درس دارید بپرسید.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  'تست تورینگ چیست؟',
                  'What is AI?',
                  'انواع یادگیری ماشین',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`message-fade-in flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm'
                }`}
              >
                {/* Message content */}
                <div className={`prose prose-sm dark:prose-invert max-w-none ${isPersian(message.content) ? 'rtl' : ''}`}>
                  {message.type === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="m-0">{message.content}</p>
                  )}
                </div>

                {/* Key Points */}
                {message.data?.keyPoints && message.data.keyPoints.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                      🎯 نکات کلیدی:
                    </p>
                    <ul className="space-y-1">
                      {message.data.keyPoints.map((point, i) => (
                        <li key={i} className={`text-sm text-gray-700 dark:text-gray-300 ${isPersian(point) ? 'rtl' : ''}`}>
                          • {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sources toggle */}
                {message.data?.relevantSlides && message.data.relevantSlides.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{message.data.relevantSlides.length} منبع</span>
                      {expandedSources === message.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {expandedSources === message.id && (
                      <div className="mt-2 space-y-2">
                        {message.data.relevantSlides.map((slide, i) => (
                          <div
                            key={i}
                            className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs"
                          >
                            <p className="font-medium text-gray-700 dark:text-gray-300">
                              📄 اسلاید {slide.slideNumber}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400 truncate">
                              {slide.documentName}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Metadata */}
                {message.data && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span className={`px-2 py-0.5 rounded-full ${
                      message.data.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      message.data.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {message.data.confidence === 'high' ? '✓ اطمینان بالا' :
                       message.data.confidence === 'medium' ? '~ اطمینان متوسط' :
                       '? اطمینان پایین'}
                    </span>
                    <span>{(message.data.responseTime / 1000).toFixed(1)}s</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start message-fade-in">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-600 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-blue-600 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-blue-600 rounded-full typing-dot" />
                  </div>
                  <span className="text-sm text-gray-500">در حال فکر کردن...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="سوال خود را بنویسید..."
                rows={1}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-500"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Enter برای ارسال • Shift+Enter برای خط جدید
          </p>
        </form>
      </div>
    </div>
  );
}
