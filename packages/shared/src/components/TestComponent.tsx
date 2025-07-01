import React from 'react';

export interface TestComponentProps {
  platform: 'web' | 'mobile';
}

// Simple platform-agnostic component for hot reload testing
export function TestComponent({ platform }: TestComponentProps) {
  const currentTime = new Date().toLocaleTimeString();
  
  if (platform === 'web') {
    return (
      <div style={{
        padding: '20px',
        margin: '10px',
        backgroundColor: '#e3f2fd',
        border: '2px solid #1976d2',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <h2 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>
          🔥 Hot Reload Test Component
        </h2>
        <p style={{ margin: '5px 0', fontWeight: 'bold' }}>
          Platform: {platform}
        </p>
        <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
          Rendered at: {currentTime}
        </p>
        <p style={{ 
          margin: '10px 0 0 0', 
          padding: '10px',
          backgroundColor: '#fff3cd',
          borderRadius: '4px',
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#856404'
        }}>
          🚀 CHANGE THIS TEXT TO TEST HOT RELOAD???? 🚀
        </p>
      </div>
    );
  }

  // For React Native, return a simple text string that can be displayed
  return `🔥 Hot Reload Test Component???\nPlatform: ${platform}\nRendered at: ${currentTime}\n\n🚀 efferrdfgs??! 🚀`;
}