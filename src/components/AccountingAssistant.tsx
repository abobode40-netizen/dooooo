import { useEffect, useRef, useState } from 'react';
import { Bot, Copy, Mic, Plus, Send, Sparkles, UserRound, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
const suggestions = ['تقرير المبيعات اليومي', 'تقرير مبيعات الشهر الحالي', 'ابحث عن صنف أرز', 'ما أكثر الأصناف مبيعاً هذا الشهر؟', 'ما الزيادات الجديدة في الأسعار؟', 'إيه النواقص المفتوحة؟', 'ما الأصناف الجديدة هذا الشهر؟', 'مين أكثر العملاء مديونية؟'];
const formatMessage = (content: string) => content.replace(/\*\*(.*?)\*\*/g, '$1');
const money = (value: unknown) => `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} جنيه`;
// تواريخ بتوقيت الجهاز المحلي (وليس UTC) وتحويل حدود اليوم إلى ISO صحيح
const localDay = (d = new Date()) => { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const dayStartISO = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const dayEndISO = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();
const dateRange = (question: string) => { const today = localDay(); return /الشهر|شهري|monthly/i.test(question) ? { from: `${today.slice(0, 8)}01`, to: today } : { from: today, to: today }; };

// PostgREST يقطع النتائج عند 1000 صف → نقرأ على صفحات
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const out: T[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < size) break;
  }
  return out;
}
const sanitize = (v: string) => v.replace(/[,%()"'\\*:]/g, ' ').trim();

async function localAssistantAnswer(question: string): Promise<string> {
  const range = dateRange(question);
  if (/مبيعات|فاتورة|فواتير|بيع/.test(question)) {
    const rows = await fetchAll<{ id: string; total: number }>(() => supabase.from('sales').select('id,total,created_at').gte('created_at', dayStartISO(range.from)).lte('created_at', dayEndISO(range.to)).order('created_at').order('id'));
    const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    if (/أكثر|اكتر|الأصناف|اصناف/.test(question)) {
      if (!rows.length) return 'لا توجد مبيعات في هذه الفترة.';
      const items = await fetchAll<{ name: string; quantity: number; subtotal: number }>(() => supabase.from('sale_items').select('name,quantity,subtotal,sales!inner(created_at)').gte('sales.created_at', dayStartISO(range.from)).lte('sales.created_at', dayEndISO(range.to)).order('id'));
      const grouped = new Map<string, { quantity: number; sales: number }>();
      for (const item of items) { const old = grouped.get(item.name) ?? { quantity: 0, sales: 0 }; old.quantity += Number(item.quantity || 0); old.sales += Number(item.subtotal || 0); grouped.set(item.name, old); }
      return `أكثر الأصناف مبيعاً من ${range.from} إلى ${range.to}:\n${[...grouped.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 10).map(([name, item], index) => `${index + 1}. ${name} — ${item.quantity} وحدة — ${money(item.sales)}`).join('\n')}`;
    }
    return `تقرير المبيعات من ${range.from} إلى ${range.to}:\nإجمالي المبيعات: ${money(total)}\nعدد الفواتير: ${rows.length}\nمتوسط الفاتورة: ${money(rows.length ? total / rows.length : 0)}\nالمصدر: فواتير البيع الفعلية.`;
  }
  if (/نواقص|ناقص|نفاد|تخلص/.test(question)) {
    const { data, error } = await supabase.from('shortage_items').select('product_name,notes,arrived').eq('arrived', false).order('created_at', { ascending: false }); if (error) throw error;
    const rows = (data ?? []) as Array<{ product_name: string; notes: string | null }>;
    return rows.length ? `النواقص المفتوحة (${rows.length}):\n${rows.map(item => `- ${item.product_name}${item.notes ? ` — ${item.notes}` : ''}`).join('\n')}` : 'لا توجد نواقص مفتوحة حالياً.';
  }
  if (/زيادة|نقصان|أسعار|اسعار/.test(question)) {
    const { data, error } = await supabase.from('price_change_items').select('product_name,old_price_retail,price_retail,is_new,created_at').gte('created_at', dayStartISO(range.from)).lte('created_at', dayEndISO(range.to)).order('created_at', { ascending: false }); if (error) throw error;
    const rows = (data ?? []) as Array<{ product_name: string; old_price_retail: number; price_retail: number; is_new: boolean }>;
    return rows.length ? `تغييرات الأسعار من ${range.from} إلى ${range.to}:\n${rows.map(item => `- ${item.product_name} — ${item.is_new ? 'صنف جديد' : `${money(item.old_price_retail)} ← ${money(item.price_retail)}`}`).join('\n')}` : 'لا توجد تغييرات أسعار مسجلة لهذه الفترة.';
  }
  if (/جديد|جديدة|مضاف/.test(question)) {
    const { data, error } = await supabase.from('products').select('name,code,price,stock,created_at').gte('created_at', dayStartISO(range.from)).lte('created_at', dayEndISO(range.to)).order('created_at', { ascending: false }); if (error) throw error;
    const rows = (data ?? []) as Array<{ name: string; code: string | null; price: number; stock: number }>;
    return rows.length ? `الأصناف الجديدة من ${range.from} إلى ${range.to}:\n${rows.map(item => `- ${item.name}${item.code ? ` (${item.code})` : ''} — السعر ${money(item.price)} — المخزون ${item.stock}`).join('\n')}` : 'لا توجد أصناف جديدة في هذه الفترة.';
  }
  if (/عميل|عملاء|مديون|فلوس|حساب/.test(question)) {
    const { data, error } = await supabase.from('customer_debts').select('customer_name,remaining').order('remaining', { ascending: false }).limit(20); if (error) throw error;
    const rows = (data ?? []) as Array<{ customer_name: string; remaining: number }>;
    return rows.length ? `مديونيات العملاء:\n${rows.map(item => `- ${item.customer_name}: ${money(item.remaining)}`).join('\n')}` : 'لا توجد مديونيات مسجلة.';
  }
  const search = question.replace(/ابحث|بحث|عن|صنف|الصنف|المنتج|منتج|كود|باركود|مخزون|المخزون|عندي|ما هو|ايه|إيه/g, ' ').trim();
  if (/مخزون|المخزون/.test(question) && search.length <= 1) {
    const rows = await fetchAll<{ name: string; stock: number; cost: number }>(() => supabase.from('products').select('name,stock,cost').order('stock', { ascending: true }).order('id'));
    const value = rows.reduce((sum, item) => sum + Number(item.stock || 0) * Number(item.cost || 0), 0);
    const lowStock = rows.filter(item => Number(item.stock) <= 10).slice(0, 20);
    return `متابعة المخزون: ${rows.length} صنف\nقيمة المخزون بالتكلفة: ${money(value)}\nالأصناف القريبة من النفاد (${lowStock.length}):\n${lowStock.length ? lowStock.map(item => `- ${item.name}: ${item.stock}`).join('\n') : 'لا توجد أصناف قريبة من النفاد.'}`;
  }
  if (search.length > 1) {
    const safeSearch = sanitize(search); const { data, error } = await supabase.from('products').select('name,code,barcode,price,stock,unit').or(`name.ilike.%${safeSearch}%,code.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%`).limit(20); if (error) throw error;
    const rows = (data ?? []) as Array<{ name: string; code: string | null; barcode: string | null; price: number; stock: number; unit: string | null }>;
    return rows.length ? `نتائج البحث عن «${search}»:\n${rows.map(item => `- ${item.name} — السعر ${money(item.price)} — المخزون ${item.stock}${item.unit ? ` ${item.unit}` : ''}${item.code ? ` — الكود ${item.code}` : ''}`).join('\n')}` : 'لم أجد صنفاً مطابقاً.';
  }
  return 'أستطيع إعداد تقرير يومي أو شهري للمبيعات، البحث عن صنف، عرض الأصناف الجديدة، تغييرات الأسعار، النواقص، ومتابعة العملاء.';
}

export default function AccountingAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  // إيقاف الميكروفون والنطق عند مغادرة الشاشة
  useEffect(() => () => {
    const r = recognitionRef.current;
    if (r) { r.onresult = null; r.onend = null; r.onerror = null; try { r.stop(); } catch { /* ignore */ } }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const send = async (value = input) => {
    const question = value.trim(); if (!question || loading) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question, createdAt: new Date().toISOString() };
    const next = [...messages, userMessage]; setMessages(next); setInput(''); setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('accounting-assistant', { body: { messages: next.map(message => ({ role: message.role, content: message.content })) } });
      const answer = !error && typeof data?.answer === 'string' ? data.answer : await localAssistantAnswer(question);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: new Date().toISOString() }]);
    } catch {
      try {
        const answer = await localAssistantAnswer(question);
        setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: new Date().toISOString() }]);
      } catch {
        setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: 'تعذر قراءة بيانات هذا التقرير حالياً. حاول مرة أخرى.', createdAt: new Date().toISOString() }]);
      }
    } finally { setLoading(false); }
  };
  const copy = async (message: ChatMessage) => {
    try { await navigator.clipboard.writeText(message.content); setCopied(message.id); setTimeout(() => setCopied(null), 1200); }
    catch { setCopied(null); } // الحافظة غير متاحة (http أو إذن مرفوض)
  };
  const toggleVoiceInput = () => {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) { setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: 'التحدث غير مدعوم في هذا المتصفح. جرّب Chrome أو اكتب السؤال.', createdAt: new Date().toISOString() }]); return; }
    if (listening) { try { recognitionRef.current?.stop(); } catch { /* ignore */ } setListening(false); return; }
    const recognition = new SpeechRecognition(); recognitionRef.current = recognition; recognition.lang = 'ar-EG'; recognition.interimResults = false; recognition.continuous = false; setListening(true);
    recognition.onresult = event => { const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript).join(''); setInput(transcript); };
    recognition.onend = () => setListening(false); recognition.onerror = () => setListening(false);
    try { recognition.start(); } catch { setListening(false); }
  };
  const speak = (message: ChatMessage) => { if (!('speechSynthesis' in window)) return; if (speaking === message.id) { window.speechSynthesis.cancel(); setSpeaking(null); return; } window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message.content); utterance.lang = 'ar-EG'; utterance.onend = () => setSpeaking(null); setSpeaking(message.id); window.speechSynthesis.speak(utterance); };

  return <section dir="rtl" className="max-w-5xl mx-auto space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><span className="p-2 rounded-xl bg-amber-500/15 text-amber-300"><Bot className="w-6 h-6" /></span><h2 className="text-xl font-bold text-white">المساعد المحاسبي الذكي</h2></div><p className="text-slate-400 text-sm mt-2">تحليل مباشر لبيانات المبيعات والمخزون والعملاء — قراءة فقط</p></div>
      <button onClick={() => { setMessages([]); setInput(''); }} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm"><Plus className="w-4 h-4" /> محادثة جديدة</button>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-4">
      <div className="bg-slate-900/70 border border-slate-700 rounded-2xl min-h-[560px] flex flex-col overflow-hidden">
        <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[560px]">
          {messages.length === 0 && <div className="h-full min-h-[450px] flex flex-col items-center justify-center text-center px-4"><Sparkles className="w-12 h-12 text-amber-300 mb-4" /><h3 className="text-white font-bold text-lg">اسأل عن أرقام برنامجك</h3><p className="text-slate-400 text-sm mt-2 max-w-md">سأستخدم البيانات الفعلية وأوضح لك الفترة وطريقة الحساب، ولن أخترع أرقاماً غير موجودة.</p></div>}
          {messages.map(message => <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-100'}`}><div className="flex items-center gap-2 text-xs opacity-70 mb-2">{message.role === 'user' ? <UserRound className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}{message.role === 'user' ? 'أنت' : 'المساعد'}</div><p className="whitespace-pre-wrap leading-7 text-sm">{formatMessage(message.content)}</p>{message.role === 'assistant' && <div className="mt-3 flex gap-3"><button onClick={() => copy(message)} className="text-xs text-slate-400 hover:text-white flex items-center gap-1"><Copy className="w-3.5 h-3.5" />{copied === message.id ? 'تم النسخ' : 'نسخ الإجابة'}</button><button onClick={() => speak(message)} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">{speaking === message.id ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}{speaking === message.id ? 'إيقاف الصوت' : 'استماع'}</button></div>}</div></div>)}
          {loading && <div className="flex justify-end"><div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-400">جارٍ تحليل البيانات...</div></div>}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={event => { event.preventDefault(); void send(); }} className="p-3 border-t border-slate-700 flex gap-2"><button type="button" onClick={toggleVoiceInput} disabled={loading} title="تحدث بالسؤال" className={`rounded-xl px-3 ${listening ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}><Mic className="w-5 h-5" /></button><input value={input} onChange={event => setInput(event.target.value)} placeholder={listening ? 'استمع إليك الآن...' : 'اكتب سؤالك أو تحدث بالضغط على الميكروفون...'} className="flex-1 bg-slate-800 border border-slate-700 focus:border-amber-400 outline-none rounded-xl px-4 py-3 text-white" disabled={loading} /><button type="submit" disabled={!input.trim() || loading} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl px-4"><Send className="w-5 h-5" /></button></form>
      </div>
      <aside className="bg-slate-900/50 border border-slate-700 rounded-2xl p-4 h-fit"><h3 className="text-white font-semibold mb-3">أسئلة سريعة</h3><div className="space-y-2">{suggestions.map(suggestion => <button key={suggestion} onClick={() => void send(suggestion)} disabled={loading} className="w-full text-right text-sm text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 transition">{suggestion}</button>)}</div><p className="text-xs text-slate-500 mt-5 leading-6">المساعد يقرأ البيانات فقط ويركز على المنتجات والمبيعات والعملاء والبحث والزيادات والنواقص والأصناف الجديدة.</p></aside>
    </div>
  </section>;
}
