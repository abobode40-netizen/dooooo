import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Navbar, TabType } from './components/Navbar';
import { POSView } from './components/POSView';
import { PurchaseInvoiceView } from './components/PurchaseInvoiceView';
import { ProductsView } from './components/ProductsView';
import { CustomersView } from './components/CustomersView';
import { PriceChangesView } from './components/PriceChangesView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { DebtLedgerView } from './components/DebtLedgerView';
import { CashDrawerView } from './components/CashDrawerView';
import { SettingsView } from './components/SettingsView';
import { ToastContainer } from './components/ToastContainer';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        {activeTab === 'pos' && <POSView />}
        {activeTab === 'purchases' && <PurchaseInvoiceView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'price_changes' && <PriceChangesView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'debts' && <DebtLedgerView />}
        {activeTab === 'sales' && <SalesHistoryView />}
        {activeTab === 'cash_drawer' && <CashDrawerView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Notifications Toast */}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
