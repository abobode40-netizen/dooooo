export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
  mimeType: string;
}

const BACKUP_FOLDER_NAME = 'Store_POS_ERP_Backups';

/**
 * Finds or creates the dedicated POS backup folder in the user's Google Drive
 */
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  // Check if folder already exists
  const query = `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    throw new Error('فشل البحث عن مجلد النسخ الاحتياطي في Google Drive');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'مجلد النسخ الاحتياطية لنظام إدارة المخازن ونقاط البيع'
    })
  });

  if (!createRes.ok) {
    throw new Error('فشل إنشاء مجلد النسخ الاحتياطي في Google Drive');
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Uploads a full JSON database backup file to Google Drive
 */
export async function uploadBackupToDrive(
  accessToken: string,
  backupJsonContent: string,
  fileName?: string
): Promise<DriveBackupFile> {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const finalName =
    fileName ||
    `pos_erp_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  const metadata = {
    name: finalName,
    mimeType: 'application/json',
    parents: [folderId],
    description: 'نسخة احتياطية كاملة لقاعدة بيانات المخازن والمبيعات'
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append(
    'file',
    new Blob([backupJsonContent], { type: 'application/json' })
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size,mimeType',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: form
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Google Drive Upload error:', errText);
    throw new Error('تعذر حفظ ملف النسخة الاحتياطية على Google Drive');
  }

  return await res.json();
}

/**
 * Lists all backup JSON files in the user's Google Drive
 */
export async function listDriveBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&orderBy=createdTime desc&fields=files(id,name,createdTime,size,mimeType)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error('تعذر جلب ملفات النسخ الاحتياطية من Google Drive');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Downloads the JSON content of a specific backup file from Google Drive
 */
export async function downloadBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error('تعذر تحميل محتوى النسخة الاحتياطية من Google Drive');
  }

  return await res.text();
}

/**
 * Deletes a backup file from Google Drive
 */
export async function deleteBackupFromDrive(
  accessToken: string,
  fileId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok && res.status !== 404) {
    throw new Error('تعذر حذف الملف من Google Drive');
  }
}
