import React, { useRef, useState, useEffect } from 'react';
import { 
  Download, 
  Upload, 
  RotateCcw, 
  Github, 
  ShieldCheck, 
  Copy, 
  Check, 
  Database, 
  Terminal, 
  ExternalLink,
  Info,
  Cloud,
  CloudUpload,
  CloudDownload,
  Trash2,
  RefreshCw,
  LogOut,
  User,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { 
  initAuth, 
  googleSignIn, 
  googleLogout, 
  getAccessToken 
} from '../lib/firebaseAuth';
import { 
  uploadBackupToDrive, 
  listDriveBackups, 
  downloadBackupFromDrive, 
  deleteBackupFromDrive, 
  DriveBackupFile 
} from '../services/googleDriveService';
import { User as FirebaseUser } from 'firebase/auth';

export const BackupView: React.FC = () => {
  const { 
    products, 
    sales, 
    shortageLists, 
    priceChangeDays, 
    customerDebts, 
    cashSessions, 
    exportBackupJSON, 
    importBackupJSON, 
    resetToInitialData,
    showToast
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Google Drive & Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  // Setup Auth Listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        fetchDriveFiles(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setDriveBackups([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        showToast(`مرحباً ${res.user.displayName || 'بك'}! تم ربط حساب Google بنجاح`);
        fetchDriveFiles(res.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل تسجيل الدخول بحساب Google', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setUser(null);
      setAccessToken(null);
      setDriveBackups([]);
      showToast('تم تسجيل الخروج من حساب Google بنجاح');
    } catch (err: any) {
      showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
  };

  const fetchDriveFiles = async (token?: string) => {
    const activeToken = token || accessToken || (await getAccessToken());
    if (!activeToken) return;

    setIsLoadingDrive(true);
    try {
      const files = await listDriveBackups(activeToken);
      setDriveBackups(files);
    } catch (err: any) {
      console.error(err);
      showToast('تعذر استرجاع ملفات Google Drive', 'error');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleUploadToDrive = async () => {
    const token = accessToken || (await getAccessToken());
    if (!token) {
      showToast('يرجى تسجيل الدخول بحساب Google أولاً', 'error');
      return;
    }

    setIsUploadingToDrive(true);
    try {
      const jsonContent = exportBackupJSON();
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `pos_store_backup_${dateStr}.json`;
      await uploadBackupToDrive(token, jsonContent, filename);
      showToast('تم رفع النسخة الاحتياطية بنجاح إلى Google Drive');
      fetchDriveFiles(token);
    } catch (err: any) {
      showToast(err.message || 'فشل رفع النسخة الاحتياطية إلى Google Drive', 'error');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleRestoreFromDrive = async (file: DriveBackupFile) => {
    const confirmRestore = window.confirm(
      `هل أنت متأكد من استعادة النسخة الاحتياطية "${file.name}"؟ سيتم استبدال البيانات الحالية بالبيانات الموجودة في هذه النسخة.`
    );
    if (!confirmRestore) return;

    const token = accessToken || (await getAccessToken());
    if (!token) return;

    try {
      const jsonContent = await downloadBackupFromDrive(token, file.id);
      const success = importBackupJSON(jsonContent);
      if (success) {
        showToast('تم استعادة قاعدة البيانات من Google Drive بنجاح');
      }
    } catch (err: any) {
      showToast('تعذر تنزيل أو قراءة النسخة الاحتياطية من Google Drive', 'error');
    }
  };

  const handleDeleteFromDrive = async (file: DriveBackupFile) => {
    const confirmDelete = window.confirm(
      `هل أنت متأكد من حذف النسخة الاحتياطية "${file.name}" من Google Drive نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`
    );
    if (!confirmDelete) return;

    const token = accessToken || (await getAccessToken());
    if (!token) return;

    setDeletingFileId(file.id);
    try {
      await deleteBackupFromDrive(token, file.id);
      setDriveBackups(prev => prev.filter(f => f.id !== file.id));
      showToast('تم حذف النسخة الاحتياطية من Google Drive بنجاح');
    } catch (err: any) {
      showToast('تعذر حذف الملف من Google Drive', 'error');
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleDownloadBackup = () => {
    const jsonStr = exportBackupJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store_pos_erp_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تصدير نسخة احتياطية كاملة من قاعدة البيانات بنجاح');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      const success = importBackupJSON(content);
      if (success && fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (window.confirm('تحذير: هل أنت متأكد من رغبتك في استعادة بيانات المصنع الأصلية؟ سيتم استرجاع الأصناف والأسعار الافتراضية.')) {
      resetToInitialData();
    }
  };

  const gitSteps = [
    {
      title: '1. إنشاء مستودع جديد على GitHub',
      desc: 'افتح حسابك على GitHub وانقر على زر New Repository، ثم سمّه (مثلاً: store-pos-erp-system) واجعله Public.',
      command: null
    },
    {
      title: '2. ربط المشروع المحلي والمستودع',
      desc: 'في الطرفية (Terminal) في مجلد المشروع، قم بتنفيذ الأوامر التالية لرفع المشروع كاملاً:',
      command: `git init\ngit add .\ngit commit -m "Initial commit: Arabic Retail POS & ERP System with exact database"\ngit branch -M main\ngit remote add origin https://github.com/YOUR_USERNAME/store-pos-erp-system.git\ngit push -u origin main`
    },
    {
      title: '3. النشر المباشر على GitHub Pages أو Vercel',
      desc: 'يمكنك أيضاً تشغيل الأمر التالي لعمل build ونشره فوراً مجاناً على Vercel أو Netlify أو GitHub Pages:',
      command: `npm run build`
    }
  ];

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    showToast('تم نسخ الأوامر للحافظة بنجاح');
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-amber-400" />
            النسخ الاحتياطي السحابي (Google Drive) والمحلي
          </h2>
          <p className="text-xs text-slate-400">حفظ ومزامنة قاعدة بيانات المخزن ونقاط البيع سحابياً بأمان واستعادتها في أي وقت</p>
        </div>

        {/* User Google Account Chip */}
        {user ? (
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700 px-3.5 py-1.5 rounded-xl">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google User'}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full border border-amber-400"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
                <User className="w-4 h-4" />
              </div>
            )}
            <div className="text-right">
              <div className="text-xs font-bold text-white truncate max-w-40">
                {user.displayName || 'مستخدم Google'}
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-40 font-mono">
                {user.email}
              </div>
            </div>
            <button
              onClick={handleGoogleLogout}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 border border-slate-200"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            {isLoggingIn ? 'جاري الاتصال...' : 'ربط مع Google Drive'}
          </button>
        )}
      </div>

      {/* Google Drive Cloud Backups Card */}
      <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            النسخ الاحتياطي السحابي عبر Google Drive
          </h3>

          <div className="flex items-center gap-2">
            {user && (
              <>
                <button
                  onClick={() => fetchDriveFiles()}
                  disabled={isLoadingDrive}
                  className="p-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs transition-colors flex items-center gap-1.5"
                  title="تحديث القائمة"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                  تحديث
                </button>

                <button
                  onClick={handleUploadToDrive}
                  disabled={isUploadingToDrive}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-600/20 transition-all flex items-center gap-2"
                >
                  <CloudUpload className="w-4 h-4" />
                  {isUploadingToDrive ? 'جاري الحفظ على Drive...' : 'حفظ نسخة جديدة على Drive'}
                </button>
              </>
            )}
          </div>
        </div>

        {user ? (
          <div className="space-y-3">
            {isLoadingDrive ? (
              <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                جاري فحص وتنزيل قائمة النسخ الاحتياطية من حساب Google Drive الخاص بك...
              </div>
            ) : driveBackups.length > 0 ? (
              <div className="space-y-2">
                {driveBackups.map(file => (
                  <div
                    key={file.id}
                    className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white font-mono">{file.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-3">
                          <span>
                            تاريخ النسخ: {new Date(file.createdTime).toLocaleString('ar-EG')}
                          </span>
                          {file.size && (
                            <span className="font-mono">
                              الحجم: {(Number(file.size) / 1024).toFixed(1)} KB
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestoreFromDrive(file)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                        title="استرجاع البيانات الحالية من هذه النسخة السحابية"
                      >
                        <CloudDownload className="w-3.5 h-3.5" />
                        استعادة هذه النسخة
                      </button>

                      <button
                        onClick={() => handleDeleteFromDrive(file)}
                        disabled={deletingFileId === file.id}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors"
                        title="حذف النسخة من Drive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-900/60 rounded-xl border border-dashed border-slate-800 space-y-2">
                <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">لا توجد نسخ احتياطية محفوظة حتى الآن في مجلد Google Drive</p>
                <button
                  onClick={handleUploadToDrive}
                  disabled={isUploadingToDrive}
                  className="mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2"
                >
                  <CloudUpload className="w-4 h-4" />
                  حفظ أول نسخة سحابية الآن
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 p-6 space-y-3">
            <Cloud className="w-10 h-10 text-sky-400/60 mx-auto" />
            <h4 className="text-sm font-bold text-white">قم بتسجيل الدخول بحساب Google لحفظ واسترجاع بياناتك سحابياً</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              عند ربط حساب Google Drive، ستتمكن من عمل نسخ احتياطي آمن لقاعدة بيانات المخازن والمبيعات والديون، والوصول إليها من أي جهاز آخر.
            </p>
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="mt-2 px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl shadow-lg transition-all inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              {isLoggingIn ? 'جاري الاتصال...' : 'تسجيل الدخول وربط Google Drive'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Local Backup & Restore Card */}
        <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            النسخ الاحتياطي المحلي واستعادة الملفات
          </h3>

          <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
            <div className="text-slate-300 font-bold mb-2">إحصائيات قاعدة البيانات المخزنة:</div>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>الأصناف في الدليل: <strong className="text-amber-400">{products.length}</strong> صنف</div>
              <div>فواتير المبيعات: <strong className="text-emerald-400">{sales.length}</strong> فاتورة</div>
              <div>قوائم النواقص: <strong className="text-sky-400">{shortageLists.length}</strong> قائمة</div>
              <div>أيام تعديل الأسعار: <strong className="text-rose-400">{priceChangeDays.length}</strong> يوم</div>
              <div>حسابات العملاء: <strong className="text-purple-400">{customerDebts.length}</strong> حساب</div>
              <div>جلسات الخزينة: <strong className="text-amber-300">{cashSessions.length}</strong> جلسة</div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleDownloadBackup}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              تنزيل نسخة احتياطية محلية (ملف JSON)
            </button>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl border border-slate-600 transition-all flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                استيراد واستعادة نسخة احتياطية من جهازك
              </button>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-2.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-semibold text-xs rounded-xl border border-rose-800/40 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              استرجاع بيانات المصنع الأولية
            </button>
          </div>
        </div>

        {/* GitHub Guide & Deployment */}
        <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Github className="w-4 h-4 text-amber-400" />
              أوامر نشر المستودع العام (Public GitHub)
            </h3>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
              Open Source
            </span>
          </div>

          <div className="space-y-3">
            {gitSteps.map((step, idx) => (
              <div key={idx} className="bg-slate-900/90 rounded-xl p-3.5 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-200">{step.title}</h4>
                <p className="text-[11px] text-slate-400">{step.desc}</p>
                {step.command && (
                  <div className="relative">
                    <pre className="p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-amber-300 overflow-x-auto border border-slate-800/80 text-left dir-ltr">
                      {step.command}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(step.command!, idx)}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="نسخ الأوامر"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

