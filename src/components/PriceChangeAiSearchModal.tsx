import React, { useState } from 'react';
import { 
  Sparkles, 
  Search, 
  X, 
  Mic, 
  MicOff, 
  TrendingDown, 
  TrendingUp, 
  PackagePlus, 
  Layers, 
  Bot,
  Zap
} from 'lucide-react';

export interface PriceChangeAiFilterCriteria {
  keyword?: string;
  filterType?: 'all' | 'increase' | 'decrease' | 'new';
  minDiff?: number | null;
  maxDiff?: number | null;
  explanation: string;
}

interface PriceChangeAiSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyAiFilter: (criteria: PriceChangeAiFilterCriteria) => void;
}

export const PriceChangeAiSearchModal: React.FC<PriceChangeAiSearchModalProps> = ({
  isOpen,
  onClose,
  onApplyAiFilter,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  if (!isOpen) return null;

  // Voice recognition inside the modal
  const handleVoiceInput = () => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;

    if (!SpeechRecognition) {
      alert('المتصفح الحالي لا يدعم ميزة التعرف الصوتي المباشر.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-EG';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setPrompt(text);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  // Local semantic heuristic parser for price change queries (fully offline capable)
  const parseLocally = (query: string): PriceChangeAiFilterCriteria => {
    const q = query.trim().toLowerCase();
    let filterType: 'all' | 'increase' | 'decrease' | 'new' = 'all';
    let keyword = '';
    let minDiff: number | null = null;
    let maxDiff: number | null = null;
    const explanations: string[] = [];

    // Detect type
    if (q.includes('زيادة') || q.includes('زادت') || q.includes('غلي') || q.includes('غليت') || q.includes('مرتفع')) {
      filterType = 'increase';
      explanations.push('الأصناف التي زادت أسعارها 🔺');
    } else if (q.includes('نقص') || q.includes('انخفض') || q.includes('نزلت') || q.includes('رخص') || q.includes('تخفيض')) {
      filterType = 'decrease';
      explanations.push('الأصناف التي انخفضت أسعارها 🔻');
    } else if (q.includes('جديد') || q.includes('جديدة') || q.includes('مضاف') || q.includes('مضافة')) {
      filterType = 'new';
      explanations.push('الأصناف الجديدة المضافة 🆕');
    }

    // Detect difference amounts: e.g. "أكثر من 5", "فوق 10", "أكبر من 2"
    const diffMatch = q.match(/(فوق|أكبر من|اكبر من|أكثر من|اكثر من|زيادة من|بأكثر من)\s*(\d+)/);
    if (diffMatch && diffMatch[2]) {
      minDiff = Number(diffMatch[2]);
      explanations.push(`فرق سعر أكثر من ${minDiff} ج.م`);
    }

    // Residual keywords (e.g. "سكر", "شاي", "زيت", "جبنة", "1002")
    const cleanWord = q
      .replace(/(زيادة|زادت|غليت|غلي|نقص|انخفض|نزلت|رخص|تخفيض|جديد|جديدة|مضاف|مضافة|فوق|أكبر من|اكبر من|أكثر من|اكثر من|\d+|جنيه|جنية|ج\.م)/g, '')
      .trim();
    if (cleanWord.length > 1) {
      keyword = cleanWord;
      explanations.push(`اسم الصنف: "${cleanWord}"`);
    }

    return {
      keyword,
      filterType,
      minDiff,
      maxDiff,
      explanation: explanations.length > 0 ? explanations.join(' • ') : `بحث ذكي عن: "${query}"`,
    };
  };

  const handleExecute = async (queryText: string) => {
    const textToSearch = queryText.trim();
    if (!textToSearch) return;

    setIsLoading(true);

    try {
      // Try server AI endpoint with a fast 2-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('/api/ai-search-price-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToSearch }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          onApplyAiFilter({
            keyword: data.searchKeyword || '',
            filterType: data.filterType || 'all',
            minDiff: data.minDiff ?? null,
            maxDiff: data.maxDiff ?? null,
            explanation: data.explanation || `تصفية فروق الأسعار: ${textToSearch}`,
          });
          setIsLoading(false);
          onClose();
          return;
        }
      }
    } catch {
      // Fallback seamlessly to local parser
    }

    const localResult = parseLocally(textToSearch);
    onApplyAiFilter(localResult);
    setIsLoading(false);
    onClose();
  };

  const presets = [
    {
      title: 'جميع الزيادات السعرية 🔺',
      desc: 'الأصناف التي ارتفع سعرها',
      icon: TrendingUp,
      color: 'text-rose-700 bg-rose-50 border-rose-200',
      query: 'الأصناف التي زادت أسعارها',
    },
    {
      title: 'جميع التخفيضات السعرية 🔻',
      desc: 'الأصناف التي نزل أو انخفض سعرها',
      icon: TrendingDown,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      query: 'الأصناف التي انخفضت ونزلت أسعارها',
    },
    {
      title: 'زيادات كبرى (أكثر من 5 جنيه)',
      desc: 'فروق أسعار ملحوظة',
      icon: Zap,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      query: 'الأصناف التي زادت بأكثر من 5 جنيه',
    },
    {
      title: 'الأصناف الجديدة المضافة 🆕',
      desc: 'أصناف تم استحداثها مؤخراً',
      icon: PackagePlus,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      query: 'الأصناف الجديدة المضافة',
    },
    {
      title: 'فروق أسعار السكر والزيوت',
      desc: 'متابعة السلع الاستراتيجية',
      icon: Layers,
      color: 'text-purple-700 bg-purple-50 border-purple-200',
      query: 'زيادة سكر زيت',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-700 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                البحث الذكي في فروق وتغيرات الأسعار (AI)
              </h3>
              <p className="text-xs text-violet-100">
                ابحث باللغة الطبيعية أو بالصوت عن أي زيادة أو تخفيض أو صنف جديد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Body */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="relative">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExecute(prompt);
              }}
              placeholder="مثال: هاتلي الأصناف اللي زادت أكتر من 5 جنيه أو الأصناف اللي سعرها نزل..."
              className="w-full bg-slate-50 border-2 border-violet-200 focus:border-violet-600 rounded-xl pl-12 pr-11 py-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-inner"
              autoFocus
            />

            {/* Mic inside input */}
            <button
              type="button"
              onClick={handleVoiceInput}
              title="تحدث بالصوت"
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                isListening
                  ? 'bg-rose-600 text-white animate-bounce'
                  : 'text-slate-400 hover:text-violet-600 hover:bg-violet-50'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {prompt && (
              <button
                type="button"
                onClick={() => setPrompt('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Voice Listening Status */}
          {isListening && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping"></span>
                <span className="font-bold">الميكروفون يستمع لصوتك الآن... قل طلبك بوضوح</span>
              </div>
              <button
                onClick={() => setIsListening(false)}
                className="text-xs text-rose-700 underline font-bold"
              >
                إيقاف
              </button>
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
              <span className="flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-violet-600" />
                استعلامات ذكية جاهزة بضغطة واحدة:
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {presets.map((preset, idx) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.query);
                      handleExecute(preset.query);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-start gap-2.5 ${preset.color}`}
                  >
                    <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{preset.title}</div>
                      <div className="text-[11px] opacity-75 mt-0.5">{preset.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            disabled={!prompt.trim() || isLoading}
            onClick={() => handleExecute(prompt)}
            className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                جاري التحليل...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                تطبيق البحث الذكي
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
