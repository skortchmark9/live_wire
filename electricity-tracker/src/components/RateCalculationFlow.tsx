'use client';

import { useState, useEffect } from 'react';
import { getApiBaseUrl, postFetcher } from '@electricity-tracker/shared';
import { RateCalculationProgress } from './RateCalculationProgress';
import { RateResults } from './RateResults';
import { RateCalculationForm } from './RateCalculationForm';

interface RateCalculationFlowProps {
  sessionId: string;
}

interface ProgressUpdate {
  step: string;
  message: string;
  progress: number;
  result?: any;
}

type FlowState = 'form' | 'calculating' | 'completed' | 'error';

export function RateCalculationFlow({ sessionId }: RateCalculationFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>('form');
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);

  // Debug logging and fallback sessionId from cookie
  useEffect(() => {
    console.log('RateCalculationFlow sessionId:', sessionId);
    
    // If no sessionId from auth hook, try to get it from cookie
    if (!sessionId && typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('user_session='));
      if (sessionCookie) {
        const cookieSessionId = sessionCookie.split('=')[1];
        console.log('Found session in cookie:', cookieSessionId);
        // You might want to set this in the auth state, but for now we'll just log it
      }
    }
  }, [sessionId]);

  // Clean up websocket on unmount
  useEffect(() => {
    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [websocket]);

  const getSessionId = () => {
    // First try the sessionId from auth hook
    if (sessionId) return sessionId;
    
    // Fallback to cookie if auth hook doesn't have it
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      const sessionCookie = cookies.find(c => c.trim().startsWith('user_session='));
      if (sessionCookie) {
        return sessionCookie.split('=')[1];
      }
    }
    
    return null;
  };

  const startCalculation = async (startDate: string, endDate: string) => {
    const actualSessionId = getSessionId();
    
    if (!actualSessionId) {
      setError('No session found. Please log in first.');
      setFlowState('error');
      return;
    }

    setFlowState('calculating');
    setProgress(null);
    setError(null);
    setResults(null);

    // Connect to WebSocket for progress updates using existing API config
    const apiBaseUrl = getApiBaseUrl();
    const wsUrl = apiBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + `/api/rates/ws/${actualSessionId}`;
    
    const ws = new WebSocket(wsUrl);
    setWebsocket(ws);

    ws.onopen = () => {
      console.log('WebSocket connected to:', wsUrl);
      
      // Send heartbeat every 10 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        console.log('WebSocket readyState:', ws.readyState);
        if (ws.readyState === WebSocket.OPEN) {
          console.log('Sending heartbeat ping');
          ws.send('ping');
        } else {
          console.log('WebSocket not open, clearing heartbeat');
          clearInterval(heartbeatInterval);
        }
      }, 10000);
      
      // Store interval ID for cleanup
      (ws as any).heartbeatInterval = heartbeatInterval;
    };

    ws.onmessage = (event) => {
      console.log('Raw WebSocket message received:', event.data, 'at', new Date().toISOString());
      
      // Skip pong responses from heartbeat
      if (event.data === 'pong') {
        console.log('✓ Received heartbeat pong');
        return;
      }

      try {
        const update: ProgressUpdate = JSON.parse(event.data);
        console.log('🔄 Progress update received:', {
          step: update.step,
          progress: update.progress,
          message: update.message,
          timestamp: new Date().toISOString()
        });
        
        setProgress(update);
        
        if (update.step === 'completed' && update.result) {
          console.log('✅ Calculation completed with results:', update.result);
          setResults(update.result);
          setFlowState('completed');
          ws.close();
        } else if (update.step === 'error') {
          console.error('❌ Calculation error:', update.message);
          setError(update.message);
          setFlowState('error');
          ws.close();
        }
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', event.data, error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error occurred');
      setFlowState('error');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      
      // Clean up heartbeat interval
      if ((ws as any).heartbeatInterval) {
        clearInterval((ws as any).heartbeatInterval);
      }
      
      setWebsocket(null);
    };

    // Start the calculation process using existing postFetcher
    try {
      const data = await postFetcher('/api/rates/calculate', {
        session_id: actualSessionId,
        start_date: startDate,
        end_date: endDate,
      });
      
      console.log('Calculation started:', data);
    } catch (err) {
      console.error('Error starting calculation:', err);
      console.error('Error details:', err);
      setError(`Failed to start rate calculation: ${err.message}`);
      setFlowState('error');
      ws.close();
    }
  };

  const resetFlow = () => {
    setFlowState('form');
    setProgress(null);
    setResults(null);
    setError(null);
    if (websocket) {
      websocket.close();
    }
  };

  return (
    <div className="space-y-6">
      {flowState === 'form' && (
        <RateCalculationForm onStart={startCalculation} />
      )}

      {flowState === 'calculating' && (
        <RateCalculationProgress progress={progress || { step: 'initializing', message: 'Starting calculation...', progress: 0 }} />
      )}

      {flowState === 'completed' && results && (
        <RateResults results={results} onReset={resetFlow} />
      )}

      {flowState === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <div className="w-6 h-6 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mr-3">
              <span className="text-red-600 dark:text-red-400">✕</span>
            </div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Calculation Failed
            </h3>
          </div>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <button
            onClick={resetFlow}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}