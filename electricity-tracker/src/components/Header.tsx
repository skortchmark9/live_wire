'use client'

import { ThemeToggle } from './ThemeToggle'
import { LogoutButton } from './auth/LogoutButton'
import { ActiveTab } from './types'
import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
}

export function Header({ activeTab, setActiveTab }: HeaderProps) {
  const [showInfoModal, setShowInfoModal] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    document.cookie = 'user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'demo_mode=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    router.push('/login');
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Mobile Layout */}
      <div className="block sm:hidden">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo.svg" alt="tracy.ac" className="w-5 h-5" width={20} height={20} />
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">
              tracy.ac
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInfoModal(true)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="About this project"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </button>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Logout"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="flex">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex-1 py-2 px-3 text-center text-sm font-medium transition-colors ${
              activeTab === 'home' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => setActiveTab('cost')}
            className={`flex-1 py-2 px-3 text-center text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
              activeTab === 'cost' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Cost Insights
          </button>
          <button
            onClick={() => setActiveTab('disaggregation')}
            className={`flex-1 py-2 px-3 text-center text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700 ${
              activeTab === 'disaggregation' 
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            AC
          </button>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="tracy.ac" className="w-8 h-8" width={32} height={32} />
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
              AC
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInfoModal(true)}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="About this project"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </button>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Logout"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  About tracy.ac
                </h2>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  Hi! I'm Sam, developer of tracy.ac.
                </p>
                <div>
                  <p className="mb-3">Many assumptions were made in making this:</p>
                  <ul className="space-y-1 ml-4 text-sm">
                    <li>• Using E1 Rates</li>
                    <li>• Using supply/delivery charges from my apartment last month</li>
                    <li>• That the only reason your electricity usage would go above baseline is due to AC usage</li>
                  </ul>
                </div>
                <p className="text-sm">
                  If you've got issues, questions, or feedback about the app, you can text me at{' '}
                  <span className="font-medium text-blue-600 dark:text-blue-400">516 417 2472</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}