import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Navbar, TabType } from './components/Navbar';
import { POSView } from './components/POSView';
import { ProductsView } from './components/ProductsView';
import { ShortagesView } from './components/ShortagesView';
import { PriceChangesView } from './components/PriceChangesView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { DebtLedgerView } from './components/DebtLedgerView';
import { CashDrawerView } from './components/CashDrawerView';
import { BackupView } from './components/BackupView';
import { ToastContainer } from './components/ToastContainer';

function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabType>('pos');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'pos' && <POSView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'shortages' && <ShortagesView />}
        {activeTab === 'price_changes' && <PriceChangesView />}
        {activeTab === 'sales' && <SalesHistoryView />}
        {activeTab === 'debts' && <DebtLedgerView />}
        {activeTab === 'cash_drawer' && <CashDrawerView />}
        {activeTab === 'backup' && <BackupView />}
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

