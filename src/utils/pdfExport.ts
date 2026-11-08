import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { Sale, CustomerDebt, Product, PriceChangeItem } from '../types';

/**
 * Utility to convert an HTML container into a clean, printable multi-page PDF using jsPDF.
 */
async function generatePdfFromElement(
  element: HTMLElement,
  fileName: string,
  orientation: 'p' | 'l' = 'p',
  format: 'a4' | 'a5' = 'a4'
): Promise<void> {
  // Temporarily attach to document if not visible
  const isDetached = !document.body.contains(element);
  if (isDetached) {
    element.style.position = 'fixed';
    element.style.top = '-99999px';
    element.style.left = '0';
    element.style.width = format === 'a5' ? '560px' : (orientation === 'p' ? '794px' : '1123px'); // Standard A4 / A5 at 96 DPI
    document.body.appendChild(element);
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // High resolution (crisp text & borders)
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: format === 'a5' ? 590 : (orientation === 'p' ? 820 : 1150)
    });

    const pdf = new jsPDF(orientation, 'mm', format);
    let pageWidth = 210;
    let pageHeight = 297;
    if (format === 'a5') {
      pageWidth = orientation === 'p' ? 148 : 210;
      pageHeight = orientation === 'p' ? 210 : 148;
    } else {
      pageWidth = orientation === 'p' ? 210 : 297;
      pageHeight = orientation === 'p' ? 297 : 210;
    }
    const margin = format === 'a5' ? 5 : 8;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = (canvas.height * contentWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    if (contentHeight <= pageHeight - margin * 2) {
      // Single page document
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
    } else {
      // Multi-page document: slice gracefully
      let heightLeft = contentHeight;
      let position = margin;
      const usablePageHeight = pageHeight - margin * 2;

      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
      heightLeft -= usablePageHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        position -= usablePageHeight;
        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
        heightLeft -= usablePageHeight;
      }
    }

    // Save the PDF file to user device
    pdf.save(fileName);
  } finally {
    if (isDetached && document.body.contains(element)) {
      document.body.removeChild(element);
    }
  }
}

/**
 * Exports Sales Ledger / History as an official printable PDF file using jsPDF.
 */
export async function exportSalesHistoryPDF(
  salesList: Sale[],
  filterInfo?: {
    searchQuery?: string;
    paymentFilter?: string;
    totalAmount?: number;
  }
): Promise<void> {
  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = '24px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.width = '1120px'; // Landscape A4 container for rich sales ledger

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const totalAmount = filterInfo?.totalAmount ?? salesList.reduce((sum, s) => sum + (Number(s.final_amount) || 0), 0);
  const totalInvoices = salesList.length;
  const cashSalesCount = salesList.filter(s => s.payment_type === 'cash').length;
  const debtSalesCount = salesList.filter(s => s.payment_type === 'debt').length;
  const visaSalesCount = salesList.filter(s => s.payment_type === 'visa').length;

  const cashAmount = salesList
    .filter(s => s.payment_type === 'cash')
    .reduce((sum, s) => sum + (Number(s.final_amount) || 0), 0);
  const debtAmount = salesList
    .filter(s => s.payment_type === 'debt')
    .reduce((sum, s) => sum + (Number(s.final_amount) || 0), 0);

  container.innerHTML = `
    <div style="border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: #0f172a;">
            مؤسسة البركة لتجارة وتوزيع المواد الغذائية
          </h1>
          <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #2563eb;">
            سجل كشف فواتير المبيعات الصادرة
          </h2>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            تقرير رسمي صادر وموثق من نظام إدارة المبيعات والحسابات
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px; text-align: right; min-width: 200px;">
          <div style="margin-bottom: 4px;"><strong>تاريخ الاستخراج:</strong> ${dateStr}</div>
          <div style="margin-bottom: 4px;"><strong>وقت الطباعة:</strong> ${timeStr}</div>
          <div><strong>عدد الفواتير:</strong> <span style="color: #2563eb; font-weight: 800;">${totalInvoices} فاتورة</span></div>
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px;">
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #1e40af; font-weight: 600;">إجمالي قيمة المبيعات</div>
          <div style="font-size: 16px; font-weight: 900; color: #1e3a8a; font-family: monospace; margin-top: 2px;">
            ${totalAmount.toLocaleString()} ج.م
          </div>
        </div>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #166534; font-weight: 600;">المبيعات النقدية (كاش)</div>
          <div style="font-size: 16px; font-weight: 900; color: #14532d; font-family: monospace; margin-top: 2px;">
            ${cashAmount.toLocaleString()} ج.م (${cashSalesCount})
          </div>
        </div>

        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9f1239; font-weight: 600;">المبيعات الآجلة (ذمم)</div>
          <div style="font-size: 16px; font-weight: 900; color: #881337; font-family: monospace; margin-top: 2px;">
            ${debtAmount.toLocaleString()} ج.م (${debtSalesCount})
          </div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #475569; font-weight: 600;">متوسط قيمة الفاتورة</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">
            ${totalInvoices > 0 ? Math.round(totalAmount / totalInvoices).toLocaleString() : 0} ج.م
          </div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 8px 6px; border: 1px solid #334155; text-align: center; width: 36px;">م</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 90px;">رقم الفاتورة</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 125px;">التاريخ والوقت</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; width: 80px; text-align: center;">كود العميل</th>
          <th style="padding: 8px 10px; border: 1px solid #334155;">اسم العميل</th>
          <th style="padding: 8px 10px; border: 1px solid #334155;">العنوان</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 85px;">طريقة الدفع</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 70px;">الأصناف</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 100px;">الصافي (ج.م)</th>
        </tr>
      </thead>
      <tbody>
        ${salesList
          .map((sale, idx) => {
            const payBg =
              sale.payment_type === 'cash' ? '#dcfce7' : sale.payment_type === 'debt' ? '#fee2e2' : '#e0e7ff';
            const payColor =
              sale.payment_type === 'cash' ? '#166534' : sale.payment_type === 'debt' ? '#991b1b' : '#3730a3';
            const payText =
              sale.payment_type === 'cash' ? 'نقدي' : sale.payment_type === 'debt' ? 'آجل' : 'فيزا';

            const createdDate = new Date(sale.created_at);
            const formattedDate =
              createdDate.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) +
              ' ' +
              createdDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

            return `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${idx + 1}</td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 700; color: #1e293b;">
                  ${sale.invoice_number || '-'}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; color: #475569;">
                  ${formattedDate}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 700; color: #2563eb;">
                  ${sale.customer_code || '94'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                  ${sale.customer_name || 'عميل نقدي عام'}
                  ${sale.customer_phone ? `<div style="font-size: 9px; color: #64748b; font-family: monospace;">${sale.customer_phone}</div>` : ''}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-size: 10px; color: #475569;">
                  ${sale.customer_address || '-'}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center;">
                  <span style="background-color: ${payBg}; color: ${payColor}; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; display: inline-block;">
                    ${payText}
                  </span>
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: #475569;">
                  ${sale.items?.length || 0}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 900; font-size: 12px; color: #0f172a;">
                  ${Number(sale.final_amount || 0).toLocaleString()}
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f1f5f9; font-weight: 900; font-size: 12px; border-top: 2px solid #0f172a;">
          <td colspan="7" style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right;">
            المجموع الكلي لكافة فواتير المبيعات الواردة بالتقرير (${totalInvoices} فاتورة):
          </td>
          <td style="padding: 10px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">
            ${salesList.reduce((acc, s) => acc + (s.items?.length || 0), 0)} صنف
          </td>
          <td style="padding: 10px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; color: #2563eb; font-size: 14px;">
            ${totalAmount.toLocaleString()} ج.م
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Footer Signatures & System Stamp -->
    <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #475569;">
      <div>
        <div style="font-weight: 700; margin-bottom: 25px;">المسؤول عن إعداد السجل:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">التوقيع: ....................</div>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 10px;">
        تم توليد هذا المستند إلكترونياً عبر مكتبة jsPDF المعتمدة | نظام المحاسبة والمبيعات المتكامل
      </div>

      <div style="text-align: left;">
        <div style="font-weight: 700; margin-bottom: 25px;">اعتماد إدارة الحسابات:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">الختم / التوقيع: ................</div>
      </div>
    </div>
  `;

  const dateFileName = now.toISOString().split('T')[0];
  await generatePdfFromElement(container, `سجل_فواتير_المبيعات_${dateFileName}.pdf`, 'l');
}

/**
 * Exports Customer List / Directory as an official printable PDF file using jsPDF.
 */
export async function exportCustomersListPDF(
  customerList: CustomerDebt[],
  filterInfo?: {
    searchQuery?: string;
    totalDebt?: number;
  }
): Promise<void> {
  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = '24px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.width = '1120px'; // Landscape A4 for wide customer details

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const totalCustomers = customerList.length;
  const customersWithDebt = customerList.filter(c => (Number(c.current_debt) || 0) > 0);
  const totalDebtSum = filterInfo?.totalDebt ?? customerList.reduce((sum, c) => sum + (Number(c.current_debt) || 0), 0);
  const zeroDebtCount = totalCustomers - customersWithDebt.length;

  container.innerHTML = `
    <div style="border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: #0f172a;">
            مؤسسة البركة لتجارة وتوزيع المواد الغذائية
          </h1>
          <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #2563eb;">
            كشف ودليل العملاء وأرصدة المديونيات
          </h2>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            سجل رسمي موحد يشتمل على: كود العميل، اسم العميل، العنوان، أرقام الهواتف، وأرصدة الحسابات
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px; text-align: right; min-width: 200px;">
          <div style="margin-bottom: 4px;"><strong>تاريخ الكشف:</strong> ${dateStr}</div>
          <div style="margin-bottom: 4px;"><strong>وقت الإصدار:</strong> ${timeStr}</div>
          <div><strong>إجمالي العملاء:</strong> <span style="color: #2563eb; font-weight: 800;">${totalCustomers} عميل</span></div>
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px;">
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #1e40af; font-weight: 600;">إجمالي العملاء المسجلين</div>
          <div style="font-size: 16px; font-weight: 900; color: #1e3a8a; font-family: monospace; margin-top: 2px;">
            ${totalCustomers} عميل
          </div>
        </div>

        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9f1239; font-weight: 600;">إجمالي المديونيات المستحقة</div>
          <div style="font-size: 16px; font-weight: 900; color: #881337; font-family: monospace; margin-top: 2px;">
            ${totalDebtSum.toLocaleString()} ج.م
          </div>
        </div>

        <div style="background-color: #fef2f2; border: 1px solid #fed7aa; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9a3412; font-weight: 600;">عملاء عليهم مبالغ آجلة</div>
          <div style="font-size: 16px; font-weight: 900; color: #c2410c; font-family: monospace; margin-top: 2px;">
            ${customersWithDebt.length} عميل
          </div>
        </div>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #166534; font-weight: 600;">عملاء خالص الحساب (صفر)</div>
          <div style="font-size: 16px; font-weight: 900; color: #15803d; font-family: monospace; margin-top: 2px;">
            ${zeroDebtCount} عميل
          </div>
        </div>
      </div>
    </div>

    <!-- Customers Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 8px 6px; border: 1px solid #334155; text-align: center; width: 36px;">م</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 85px;">كود العميل</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; width: 170px;">اسم العميل والمنشأة</th>
          <th style="padding: 8px 10px; border: 1px solid #334155;">العنوان والتفاصيل</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 110px;">التليفون الأول</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 110px;">التليفون الثاني</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; width: 150px;">ملاحظات الحساب</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 110px;">الرصيد / المديونية</th>
        </tr>
      </thead>
      <tbody>
        ${customerList
          .map((c, idx) => {
            const debt = Number(c.current_debt) || 0;
            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const debtColor = debt > 0 ? '#dc2626' : '#16a34a';

            return `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${idx + 1}</td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 800; color: #2563eb;">
                  ${c.customer_code || '-'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                  ${c.customer_name}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #334155; font-size: 10px;">
                  ${c.address || '-'}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #0f172a;">
                  ${c.phone || '-'}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #0f172a;">
                  ${c.phone2 || '-'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #64748b; font-size: 10px;">
                  ${c.notes || '-'}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 900; font-size: 12px; color: ${debtColor};">
                  ${debt > 0 ? `${debt.toLocaleString()} ج.م` : 'خالص (0)'}
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f1f5f9; font-weight: 900; font-size: 12px; border-top: 2px solid #0f172a;">
          <td colspan="7" style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right;">
            إجمالي رصيد المديونيات لكافة العملاء (${totalCustomers} عميل):
          </td>
          <td style="padding: 10px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; color: #dc2626; font-size: 14px;">
            ${totalDebtSum.toLocaleString()} ج.م
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Footer Signatures & System Stamp -->
    <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #475569;">
      <div>
        <div style="font-weight: 700; margin-bottom: 25px;">إعداد مسؤول المبيعات والعملاء:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">التوقيع: ....................</div>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 10px;">
        تم توليد هذا المستند إلكترونياً عبر مكتبة jsPDF المعتمدة | نظام المحاسبة وإدارة المخازن
      </div>

      <div style="text-align: left;">
        <div style="font-weight: 700; margin-bottom: 25px;">اعتماد الإدارة العامة:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">الختم / التوقيع: ................</div>
      </div>
    </div>
  `;

  const dateFileName = now.toISOString().split('T')[0];
  await generatePdfFromElement(container, `دليل_وكشف_العملاء_${dateFileName}.pdf`, 'l');
}

/**
 * Exports an individual invoice DOM element as a high quality printable A4/A5 PDF using jsPDF.
 */
export async function exportInvoiceElementPDF(
  element: HTMLElement,
  invoiceNumber: string,
  pageSize: 'a4' | 'a5' = 'a4'
): Promise<void> {
  const safeName = (invoiceNumber || 'فاتورة').replace(/[^a-zA-Z0-9-_]/g, '_');
  const sizeSuffix = pageSize === 'a5' ? 'A5' : 'A4';
  await generatePdfFromElement(element, `فاتورة_مبيعات_${safeName}_${sizeSuffix}.pdf`, 'p', pageSize);
}

/**
 * Directly generates and exports an official invoice PDF (A4 or A5) without requiring modal DOM mounting.
 */
export async function exportSaleInvoiceDirectPDF(
  sale: Sale,
  options?: {
    pageSize?: 'a4' | 'a5';
    previousBalance?: number;
    storeInfo?: {
      name?: string;
      activity?: string;
      phone?: string;
      address?: string;
      commercialReg?: string;
    };
  }
): Promise<void> {
  const pageSize = options?.pageSize || 'a4';
  const isA5 = pageSize === 'a5';
  const previousBalance = options?.previousBalance || 0;
  const storeInfo = options?.storeInfo || {
    name: 'مؤسسة البركة لتجارة وتوزيع المواد الغذائية',
    activity: 'تجارة وتوزيع المواد الغذائية والسلع الاستهلاكية بالجملة والقطاعي',
    phone: '01012345678 - 01198765432',
    address: 'شارع الجمهورية الرئيسي - المخزن والفرع المركزي',
    commercialReg: 'س.ت: 89412 - ب.ض: 432-110-985'
  };

  const invoiceDate = new Date(sale.created_at || Date.now());
  const formattedDate = invoiceDate.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const formattedTime = invoiceDate.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const finalAmount = Number(sale.final_amount) || 0;
  const totalAmount = Number(sale.total_amount) || finalAmount;
  const discount = Number(sale.discount) || 0;
  const currentTotalDebt = previousBalance + (sale.payment_type === 'debt' ? finalAmount : 0);

  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = isA5 ? '14px' : '22px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.width = isA5 ? '560px' : '794px';
  container.style.boxSizing = 'border-box';

  const paymentLabel = sale.payment_type === 'debt' ? 'آجل (على الحساب)' : sale.payment_type === 'visa' ? 'شبكة فيزا' : 'نقدي فوري';

  container.innerHTML = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: ${isA5 ? '10px' : '14px'}; margin-bottom: ${isA5 ? '10px' : '14px'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
        <div>
          <h1 style="margin: 0 0 3px 0; font-size: ${isA5 ? '16px' : '20px'}; font-weight: 900; color: #0f172a;">
            ${storeInfo.name}
          </h1>
          <p style="margin: 0 0 4px 0; font-size: ${isA5 ? '9px' : '11px'}; color: #475569;">
            ${storeInfo.activity}
          </p>
          <div style="font-size: ${isA5 ? '9px' : '10px'}; color: #64748b;">
            <span>📞 ${storeInfo.phone}</span> | <span>📍 ${storeInfo.address}</span>
          </div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: ${isA5 ? '6px 10px' : '8px 12px'}; min-width: ${isA5 ? '140px' : '180px'}; text-align: right;">
          <div style="text-align: center; font-weight: 900; font-size: ${isA5 ? '11px' : '13px'}; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px;">
            فاتورة مبيعات (${paymentLabel})
          </div>
          <div style="font-size: ${isA5 ? '9px' : '11px'}; display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #64748b;">رقم الفاتورة:</span>
            <strong style="color: #b45309; font-family: monospace;">${sale.invoice_number}</strong>
          </div>
          <div style="font-size: ${isA5 ? '8px' : '10px'}; color: #64748b; display: flex; justify-content: space-between;">
            <span>التاريخ:</span>
            <span style="font-family: monospace;">${formattedDate} ${formattedTime}</span>
          </div>
          <div style="font-size: ${isA5 ? '8px' : '9px'}; color: #0369a1; text-align: center; margin-top: 3px; font-weight: bold; background: #e0f2fe; border-radius: 3px; padding: 1px;">
            ورق مقاس ${isA5 ? 'A5 (مدمج)' : 'A4 (قياسي)'}
          </div>
        </div>
      </div>

      <!-- Customer Bar -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: ${isA5 ? '8px' : '12px'}; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: ${isA5 ? '5px 8px' : '8px 10px'}; font-size: ${isA5 ? '9px' : '11px'};">
        <div>
          <span style="color: #64748b; font-size: ${isA5 ? '8px' : '9px'}; display: block;">كود العميل:</span>
          <strong style="color: #1d4ed8; font-family: monospace;">${sale.customer_code || '94'}</strong>
        </div>
        <div>
          <span style="color: #64748b; font-size: ${isA5 ? '8px' : '9px'}; display: block;">اسم العميل:</span>
          <strong style="color: #0f172a;">${sale.customer_name || 'عميل نقدي عام'}</strong>
        </div>
        <div>
          <span style="color: #64748b; font-size: ${isA5 ? '8px' : '9px'}; display: block;">رقم الهاتف:</span>
          <span style="color: #334155; font-family: monospace;">${sale.customer_phone || '-'}</span>
        </div>
        <div>
          <span style="color: #64748b; font-size: ${isA5 ? '8px' : '9px'}; display: block;">الكاشير / الفرع:</span>
          <span style="color: #334155;">${sale.cashier_name || 'الكاشير الرئيسي'}</span>
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: ${isA5 ? '9px' : '11px'}; text-align: right; margin-bottom: ${isA5 ? '10px' : '14px'};">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: ${isA5 ? '4px 3px' : '7px 4px'}; border: 1px solid #334155; text-align: center; width: ${isA5 ? '22px' : '30px'};">م</th>
          <th style="padding: ${isA5 ? '4px 4px' : '7px 6px'}; border: 1px solid #334155; text-align: center; width: ${isA5 ? '60px' : '75px'};">الكود</th>
          <th style="padding: ${isA5 ? '4px 6px' : '7px 8px'}; border: 1px solid #334155;">اسم الصنف والبيان</th>
          <th style="padding: ${isA5 ? '4px 4px' : '7px 6px'}; border: 1px solid #334155; text-align: center; width: ${isA5 ? '40px' : '55px'};">الوحدة</th>
          <th style="padding: ${isA5 ? '4px 4px' : '7px 6px'}; border: 1px solid #334155; text-align: center; width: ${isA5 ? '38px' : '50px'};">الكمية</th>
          <th style="padding: ${isA5 ? '4px 4px' : '7px 6px'}; border: 1px solid #334155; text-align: center; width: ${isA5 ? '52px' : '70px'};">السعر</th>
          <th style="padding: ${isA5 ? '4px 6px' : '7px 8px'}; border: 1px solid #334155; text-align: left; width: ${isA5 ? '65px' : '85px'};">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items
          .map((item, idx) => {
            const itemTotal = Number(item.total_price) || (Number(item.quantity) * Number(item.unit_price));
            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            return `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: ${isA5 ? '4px 2px' : '6px 4px'}; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${idx + 1}</td>
                <td style="padding: ${isA5 ? '4px 4px' : '6px 6px'}; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: bold; color: #1e40af;">
                  ${item.code || `100${idx + 1}`}
                </td>
                <td style="padding: ${isA5 ? '4px 6px' : '6px 8px'}; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                  ${item.product_name}
                </td>
                <td style="padding: ${isA5 ? '4px 3px' : '6px 4px'}; border: 1px solid #cbd5e1; text-align: center; color: #475569;">
                  ${item.unit || 'قطعة'}
                </td>
                <td style="padding: ${isA5 ? '4px 3px' : '6px 4px'}; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 900; color: #0f172a;">
                  ${item.quantity}
                </td>
                <td style="padding: ${isA5 ? '4px 4px' : '6px 6px'}; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #334155;">
                  ${Number(item.unit_price).toFixed(2)}
                </td>
                <td style="padding: ${isA5 ? '4px 6px' : '6px 8px'}; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 900; color: #0f172a;">
                  ${itemTotal.toFixed(2)}
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>

    <!-- Totals and Signatures Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <!-- Notes & Terms -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: ${isA5 ? '6px 8px' : '10px'}; font-size: ${isA5 ? '8px' : '10px'}; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <strong style="color: #334155; display: block; margin-bottom: 3px;">شروط وملاحظات:</strong>
          <p style="margin: 0; color: #64748b; line-height: 1.4;">
            ${sale.notes || 'البضاعة المباعة لا ترد ولا تستبدل بعد 14 يوماً من تاريخ الفاتورة. شكراً لتعاملكم معنا.'}
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: ${isA5 ? '8px' : '9px'};">
          <div>
            <div style="border-bottom: 1px dashed #94a3b8; height: 16px; margin-bottom: 2px;"></div>
            <span>توقيع المستلم</span>
          </div>
          <div>
            <div style="border-bottom: 1px dashed #94a3b8; height: 16px; margin-bottom: 2px;"></div>
            <span>توقيع الكاشير</span>
          </div>
        </div>
      </div>

      <!-- Financial Totals Box -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: ${isA5 ? '8px 10px' : '12px 14px'}; font-size: ${isA5 ? '9px' : '11px'};">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #475569;">
          <span>إجمالي القيمة:</span>
          <strong style="color: #0f172a; font-family: monospace;">${totalAmount.toLocaleString()} ج.م</strong>
        </div>

        ${
          discount > 0
            ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #dc2626;">
            <span>الخصم الممنوح:</span>
            <strong style="font-family: monospace;">-${discount.toLocaleString()} ج.م</strong>
          </div>
        `
            : ''
        }

        <div style="display: flex; justify-content: space-between; padding: ${isA5 ? '4px 0' : '6px 0'}; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; margin: 4px 0; font-size: ${isA5 ? '11px' : '14px'}; font-weight: 900; color: #047857;">
          <span>صافي الفاتورة:</span>
          <span style="font-family: monospace;">${finalAmount.toLocaleString()} ج.م</span>
        </div>

        ${
          sale.payment_type === 'debt'
            ? `
          <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 4px; padding: 4px 6px; margin-top: 5px; font-size: ${isA5 ? '8px' : '10px'};">
            <div style="display: flex; justify-content: space-between; color: #9f1239;">
              <span>الرصيد السابق:</span>
              <strong style="font-family: monospace;">${previousBalance.toLocaleString()} ج.م</strong>
            </div>
            <div style="display: flex; justify-content: space-between; color: #881337; font-weight: 900; border-top: 1px solid #fecdd3; margin-top: 3px; padding-top: 2px;">
              <span>إجمالي الحساب المستحق:</span>
              <strong style="font-family: monospace;">${currentTotalDebt.toLocaleString()} ج.م</strong>
            </div>
          </div>
        `
            : ''
        }
      </div>
    </div>

    <!-- Footer Stamp -->
    <div style="text-align: center; font-size: ${isA5 ? '7px' : '9px'}; color: #94a3b8; margin-top: ${isA5 ? '8px' : '12px'}; border-top: 1px solid #f1f5f9; padding-top: 4px;">
      تم توليد هذه الفاتورة إلكترونياً عبر نظام نقاط البيع والمبيعات (مقاس ${pageSize.toUpperCase()}) • ${formattedDate}
    </div>
  `;

  const safeName = (sale.invoice_number || 'فاتورة').replace(/[^a-zA-Z0-9-_]/g, '_');
  const sizeSuffix = isA5 ? 'A5' : 'A4';
  await generatePdfFromElement(container, `فاتورة_${safeName}_${sizeSuffix}.pdf`, 'p', pageSize);
}

/**
 * Exports Product List / Inventory Directory as an official printable PDF file using jsPDF.
 */
export async function exportProductsListPDF(
  productList: Product[],
  filterInfo?: {
    searchQuery?: string;
    category?: string;
  }
): Promise<void> {
  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = '24px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.width = '1120px'; // Landscape A4 for wide table

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const totalProducts = productList.length;
  const totalStock = productList.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalWholesaleValue = productList.reduce((sum, p) => sum + ((Number(p.price_wholesale) || Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
  const totalRetailValue = productList.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);

  container.innerHTML = `
    <div style="border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: #0f172a;">
            مؤسسة أولاد طه لتجارة وتوزيع المواد الغذائية
          </h1>
          <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #16a34a;">
            دليل الأصناف وقائمة أسعار المخزن المعتمدة
          </h2>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            سجل رسمي موحد لبيانات الأصناف، أسعار الجملة والقطاعي، والأرصدة المخزنية
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px; text-align: right; min-width: 200px;">
          <div style="margin-bottom: 4px;"><strong>تاريخ الاستخراج:</strong> ${dateStr}</div>
          <div style="margin-bottom: 4px;"><strong>وقت الطباعة:</strong> ${timeStr}</div>
          <div><strong>إجمالي الأصناف:</strong> <span style="color: #16a34a; font-weight: 800;">${totalProducts} صنف</span></div>
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px;">
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #166534; font-weight: 600;">إجمالي عدد الأصناف</div>
          <div style="font-size: 16px; font-weight: 900; color: #14532d; font-family: monospace; margin-top: 2px;">
            ${totalProducts} صنف
          </div>
        </div>

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #1e40af; font-weight: 600;">إجمالي رصيد القطع والعبوات</div>
          <div style="font-size: 16px; font-weight: 900; color: #1e3a8a; font-family: monospace; margin-top: 2px;">
            ${totalStock.toLocaleString()} وحدة
          </div>
        </div>

        <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #854d0e; font-weight: 600;">تقييم المخزون بسعر الجملة</div>
          <div style="font-size: 16px; font-weight: 900; color: #713f12; font-family: monospace; margin-top: 2px;">
            ${Math.round(totalWholesaleValue).toLocaleString()} ج.م
          </div>
        </div>

        <div style="background-color: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9d174d; font-weight: 600;">القيمة البيعية المتوقعة (قطاعي)</div>
          <div style="font-size: 16px; font-weight: 900; color: #831843; font-family: monospace; margin-top: 2px;">
            ${Math.round(totalRetailValue).toLocaleString()} ج.م
          </div>
        </div>
      </div>
    </div>

    <!-- Products Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 8px 6px; border: 1px solid #334155; text-align: center; width: 36px;">م</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 85px;">كود الصنف</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; width: 220px;">اسم الصنف والبيان</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 75px;">الوحدة</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; width: 120px;">القسم / التصنيف</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 95px;">سعر الجملة</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 95px;">سعر القطاعي</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 80px;">الرصيد بالمخزن</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 100px;">الباركود</th>
        </tr>
      </thead>
      <tbody>
        ${productList
          .map((p, idx) => {
            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const wholesale = Number(p.price_wholesale) || Number(p.price) || 0;
            const retail = Number(p.price) || 0;
            const stock = Number(p.stock) || 0;
            const stockColor = stock <= 5 ? '#dc2626' : '#1e293b';

            return `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${idx + 1}</td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 800; color: #2563eb;">
                  ${p.code || '-'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                  ${p.name}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; color: #475569;">
                  ${p.unit || 'قطعة'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #64748b; font-size: 10px;">
                  ${p.category || 'عام'}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 700; color: #1e3a8a;">
                  ${wholesale.toLocaleString()} ج.م
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 900; color: #166534;">
                  ${retail.toLocaleString()} ج.م
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 800; color: ${stockColor};">
                  ${stock}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #64748b; font-size: 10px;">
                  ${p.barcode || '-'}
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background-color: #f1f5f9; font-weight: 900; font-size: 12px; border-top: 2px solid #0f172a;">
          <td colspan="7" style="padding: 10px 12px; border: 1px solid #cbd5e1; text-align: right;">
            المجموع الكلي لأرصدة الأصناف المسجلة (${totalProducts} صنف):
          </td>
          <td style="padding: 10px 8px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: #2563eb; font-size: 13px;">
            ${totalStock.toLocaleString()}
          </td>
          <td style="padding: 10px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 10px; color: #64748b;">
            -
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Footer Signatures & System Stamp -->
    <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #475569;">
      <div>
        <div style="font-weight: 700; margin-bottom: 25px;">أمين المخزن / المسؤول:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">التوقيع: ....................</div>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 10px;">
        تم توليد هذا المستند إلكترونياً عبر مكتبة jsPDF المعتمدة | نظام إدارة المخازن والأصناف
      </div>

      <div style="text-align: left;">
        <div style="font-weight: 700; margin-bottom: 25px;">اعتماد إدارة المبيعات:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">الختم / التوقيع: ................</div>
      </div>
    </div>
  `;

  const dateFileName = now.toISOString().split('T')[0];
  await generatePdfFromElement(container, `دليل_وكشف_الأصناف_${dateFileName}.pdf`, 'l');
}

/**
 * Exports Price Changes / Differences (الزيادة والنقصان) as a printable PDF report using jsPDF.
 */
export async function exportPriceChangesListPDF(
  itemsList: any[]
): Promise<void> {
  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = '24px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.width = '1120px'; // Landscape A4

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const totalRecords = itemsList.length;
  let increaseCount = 0;
  let decreaseCount = 0;
  let newCount = 0;

  itemsList.forEach(item => {
    const diff = (Number(item.diff_wholesale) || 0) || (Number(item.diff_retail) || 0) || ((Number(item.new_price) || 0) - (Number(item.old_price) || 0));
    if (item.is_new) newCount++;
    else if (diff > 0) increaseCount++;
    else if (diff < 0) decreaseCount++;
  });

  container.innerHTML = `
    <div style="border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: #0f172a;">
            مؤسسة أولاد طه لتجارة وتوزيع المواد الغذائية
          </h1>
          <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #dc2626;">
            تقرير وفروق الأسعار (الزيادة والنقصان في أسعار الأصناف)
          </h2>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            توثيق الفروق التاريخية في أسعار الجملة والقطاعي والتحديثات التلقائية واليدوية
          </p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px; text-align: right; min-width: 200px;">
          <div style="margin-bottom: 4px;"><strong>تاريخ الاستخراج:</strong> ${dateStr}</div>
          <div style="margin-bottom: 4px;"><strong>وقت الطباعة:</strong> ${timeStr}</div>
          <div><strong>إجمالي السجلات:</strong> <span style="color: #dc2626; font-weight: 800;">${totalRecords} سجل</span></div>
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px;">
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #1e40af; font-weight: 600;">إجمالي حركات التغير</div>
          <div style="font-size: 16px; font-weight: 900; color: #1e3a8a; font-family: monospace; margin-top: 2px;">
            ${totalRecords} حركة
          </div>
        </div>

        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9f1239; font-weight: 600;">أصناف ارتفعت أسعارها 🔺</div>
          <div style="font-size: 16px; font-weight: 900; color: #881337; font-family: monospace; margin-top: 2px;">
            ${increaseCount} صنف
          </div>
        </div>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #166534; font-weight: 600;">أصناف انخفضت أسعارها 🔻</div>
          <div style="font-size: 16px; font-weight: 900; color: #14532d; font-family: monospace; margin-top: 2px;">
            ${decreaseCount} صنف
          </div>
        </div>

        <div style="background-color: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 6px; padding: 8px 12px;">
          <div style="font-size: 10px; color: #9d174d; font-weight: 600;">أصناف جديدة مضافة 🆕</div>
          <div style="font-size: 16px; font-weight: 900; color: #831843; font-family: monospace; margin-top: 2px;">
            ${newCount} صنف
          </div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: right;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="padding: 8px 6px; border: 1px solid #334155; text-align: center; width: 36px;">م</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 85px;">كود الصنف</th>
          <th style="padding: 8px 10px; border: 1px solid #334155; width: 220px;">اسم الصنف</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: center; width: 85px;">حالة التغير</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 85px;">الجملة السابق</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 85px;">الجملة الحالي</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 80px;">فارق الجملة</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 85px;">القطاعي السابق</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 85px;">القطاعي الحالي</th>
          <th style="padding: 8px 8px; border: 1px solid #334155; text-align: left; width: 80px;">فارق القطاعي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsList
          .map((item, idx) => {
            const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const oldWholesale = Number(item.old_price_wholesale || item.old_wholesale || item.old_price) || 0;
            const newWholesale = Number(item.new_price_wholesale || item.new_wholesale || item.new_price) || 0;
            const diffWholesale = Number(item.diff_wholesale) || (newWholesale - oldWholesale);

            const oldRetail = Number(item.old_price_retail || item.old_retail || item.old_price) || 0;
            const newRetail = Number(item.new_price_retail || item.new_retail || item.new_price) || 0;
            const diffRetail = Number(item.diff_retail) || (newRetail - oldRetail);

            let badgeBg = '#f1f5f9';
            let badgeColor = '#475569';
            let badgeText = 'ثابت';

            if (item.is_new) {
              badgeBg = '#fdf2f8';
              badgeColor = '#9d174d';
              badgeText = 'جديد 🆕';
            } else if (diffWholesale > 0 || diffRetail > 0) {
              badgeBg = '#fee2e2';
              badgeColor = '#991b1b';
              badgeText = 'زيادة 🔺';
            } else if (diffWholesale < 0 || diffRetail < 0) {
              badgeBg = '#dcfce7';
              badgeColor = '#166534';
              badgeText = 'نقصان 🔻';
            }

            return `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace;">${idx + 1}</td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: 800; color: #2563eb;">
                  ${item.code || item.item_code || '-'}
                </td>
                <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a;">
                  ${item.product_name || item.name || 'صنف'}
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; text-align: center;">
                  <span style="background-color: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">
                    ${badgeText}
                  </span>
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; color: #64748b;">
                  ${oldWholesale || '-'}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 700; color: #1e293b;">
                  ${newWholesale}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 800; color: ${diffWholesale > 0 ? '#dc2626' : diffWholesale < 0 ? '#16a34a' : '#64748b'};">
                  ${diffWholesale > 0 ? `+${diffWholesale}` : diffWholesale}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; color: #64748b;">
                  ${oldRetail || '-'}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 900; color: #1e293b;">
                  ${newRetail}
                </td>
                <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; font-family: monospace; font-weight: 800; color: ${diffRetail > 0 ? '#dc2626' : diffRetail < 0 ? '#16a34a' : '#64748b'};">
                  ${diffRetail > 0 ? `+${diffRetail}` : diffRetail}
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>

    <!-- Footer Signatures & System Stamp -->
    <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #475569;">
      <div>
        <div style="font-weight: 700; margin-bottom: 25px;">مسؤول التسعير والمشتريات:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">التوقيع: ....................</div>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 10px;">
        تم توليد هذا المستند إلكترونياً عبر مكتبة jsPDF المعتمدة | نظام توثيق وتحديث الأسعار
      </div>

      <div style="text-align: left;">
        <div style="font-weight: 700; margin-bottom: 25px;">اعتماد الإدارة المالية:</div>
        <div style="border-top: 1px solid #cbd5e1; width: 140px; padding-top: 4px;">الختم / التوقيع: ................</div>
      </div>
    </div>
  `;

  const dateFileName = now.toISOString().split('T')[0];
  await generatePdfFromElement(container, `تقرير_فروق_الأسعار_${dateFileName}.pdf`, 'l');
}


