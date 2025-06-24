'use client'

import { ThemeToggle } from './ThemeToggle'
import { LogoutButton } from './auth/LogoutButton'
import { ActiveTab } from './types'

interface HeaderProps {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
}

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Mobile Layout */}
      <div className="block sm:hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="tracy.ac" className="w-6 h-6" />
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                tracy.ac
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </div>
        <div className="flex">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'home' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => setActiveTab('cost')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
              activeTab === 'cost' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Cost Insights
          </button>
          <button
            onClick={() => setActiveTab('disaggregation')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
              activeTab === 'disaggregation' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            AC Analysis
          </button>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="tracy.ac" className="w-8 h-8" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              tracy.ac
            </h1>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'home' 
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setActiveTab('cost')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'cost' 
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Cost Insights
            </button>
            <button
              onClick={() => setActiveTab('disaggregation')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'disaggregation' 
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              AC Analysis
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}